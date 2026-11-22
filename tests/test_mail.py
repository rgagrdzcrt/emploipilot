"""Tests du tri des e-mails (mail.py) : confirmations de candidature d'Indeed, sans réseau ni Gmail.

Lancer : python -m unittest discover -s tests
"""
import base64
import contextlib
import io
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import mail  # noqa: E402

AT = 1795300000000  # 21/11/2026


def message(subject, body, sender="Indeed <indeedapply@indeed.com>", at=AT, mid="m1"):
    name, _, addr = sender.rpartition(" <")
    return {"id": mid, "at": at, "from_name": name, "from_addr": addr.rstrip(">").lower(),
            "subject": subject, "body": body, "unsubscribe": True, "labels": ["CATEGORY_UPDATES"]}


def tracked(company, title, status="Candidature envoyée", id_="x1"):
    return {"id": id_, "company": company, "title": title, "status": status,
            "_key": mail.company_key(company)}


# Confirmation habituelle d'Indeed, suivie de suggestions d'autres offres.
INDEED_FR = (
    "Candidature envoyée\n\nPréparateur de commandes H/F\nAmazon - Saint-Denis (93)\n\n"
    "Les éléments suivants ont été envoyés à Amazon. Bonne chance !\n• Candidature\n• CV\n\n"
    "Prochaines étapes\n• L'employeur ou l'annonceur pourra vous contacter au sujet de votre candidature.\n\n"
    "Offres similaires\nMagasinier H/F\nCarrefour - Bondy (93)\nPostulez maintenant"
)
INDEED_EN = (
    "Application submitted\nWarehouse Associate\nAmazon - Paris\n"
    "The following items were sent to Amazon. Good luck!\n• Application\n• Resume"
)


class Confirmations(unittest.TestCase):
    def test_confirmation_indeed_comptee_comme_accuse(self):
        for subject in ("Candidature Indeed : Préparateur de commandes H/F", "Votre candidature a été envoyée",
                        "Indeed Application: Préparateur de commandes H/F", "Merci de votre candidature, elle est arrivée"):
            with self.subTest(subject=subject):
                m = message(subject, INDEED_FR)
                d = mail.classify(m, [])
                self.assertEqual((d["kind"], d["label"], d["app"]), ("accuse", "accuse", None))
                self.assertEqual(mail.application_from_mail(m), ("Préparateur de commandes H/F", "Amazon", "Indeed"))

    def test_confirmation_en_anglais(self):
        m = message("Indeed Application: Warehouse Associate", INDEED_EN)
        self.assertEqual(mail.classify(m, [])["label"], "accuse")
        self.assertEqual(mail.application_from_mail(m), ("Warehouse Associate", "Amazon", "Indeed"))

    def test_entreprise_retiree_du_poste_dans_l_objet(self):
        m = message("Indeed Application: Magasinier H/F - Carrefour", "Les éléments suivants ont été envoyés à Carrefour.")
        self.assertEqual(mail.application_from_mail(m), ("Magasinier H/F", "Carrefour", "Indeed"))

    def test_employeur_via_indeed(self):
        m = message("Merci de votre candidature",
                    "Bonjour Ryan,\nMerci de votre candidature au poste de Stockiste H/F, elle est bien arrivée.\n"
                    "Nous reviendrons vers vous rapidement.", sender="Monoprix via Indeed <reply-8f3a@indeedemail.com>")
        self.assertEqual(mail.classify(m, [])["label"], "accuse")
        self.assertEqual(mail.application_from_mail(m), ("Stockiste H/F", "Monoprix", "Indeed"))

    def test_rapprochement_par_le_poste_cite_et_non_par_les_suggestions(self):
        carrefour = tracked("Carrefour", "Magasinier H/F")
        amazon = tracked("Amazon", "Préparateur de commandes H/F", status="À postuler", id_="x2")
        m = message("Votre candidature a été envoyée", INDEED_FR)
        # Carrefour n'apparaît que dans les offres similaires : pas de rapprochement.
        self.assertIsNone(mail.classify(m, [carrefour])["app"])
        self.assertIs(mail.classify(m, [carrefour, amazon])["app"], amazon)

    def test_refus_par_indeed_reste_un_refus(self):
        lidl = tracked("Lidl", "Employé de magasin H/F")
        m = message("Votre candidature chez Lidl", "Merci pour votre candidature. Malheureusement, nous ne pouvons "
                    "pas y donner suite.", sender="Lidl via Indeed <reply-1@indeedemail.com>")
        d = mail.classify(m, [lidl])
        self.assertEqual((d["label"], d["app"]), ("refus", lidl))

    def test_alertes_rappels_et_suivis_restent_du_bruit(self):
        for subject, body in (
            ("Nouvelles offres : magasinier à Bondy", "Magasinier H/F\nCarrefour - Bondy\nCandidature simplifiée"),
            ("N'oubliez pas de postuler : Magasinier H/F", "Vous avez consulté cette offre. Postulez maintenant."),
            ("Votre candidature a été consultée", "Bonne nouvelle : l'employeur a consulté votre candidature."),
            ("Offres similaires à Préparateur de commandes", "Candidature envoyée hier ? Voici d'autres offres."),
        ):
            with self.subTest(subject=subject):
                self.assertEqual(mail.classify(message(subject, body, sender="Indeed <alert@indeed.com>"), [])["label"],
                                 "bruit")


class AjoutAuSuivi(unittest.TestCase):
    def test_deux_confirmations_au_meme_objet_donnent_deux_candidatures(self):
        entries = {}
        first = message("Votre candidature a été envoyée", INDEED_FR, mid="a")
        second = message("Votre candidature a été envoyée",
                         INDEED_FR.replace("Amazon", "Monoprix").replace("Préparateur de commandes", "Stockiste"),
                         at=AT + 60000, mid="b")
        for m in (first, second):
            self.assertIsNotNone(mail.add_outside_application(entries, [], m, *mail.application_from_mail(m), AT))
        self.assertEqual(sorted(e["company"] for e in entries.values()), ["Amazon", "Monoprix"])
        self.assertTrue(all(e["status"] == "Candidature envoyée" and e["via"] == "Indeed" for e in entries.values()))
        # Le même e-mail relu n'ajoute rien.
        self.assertIsNone(mail.add_outside_application(entries, [], first, *mail.application_from_mail(first), AT))


def raw(m):
    """Message au format de l'API Gmail."""
    data = base64.urlsafe_b64encode(m["body"].encode("utf-8")).decode("ascii")
    return {"id": m["id"], "internalDate": str(m["at"]), "labelIds": ["Label_bruit"],
            "payload": {"mimeType": "text/plain", "body": {"data": data}, "headers": [
                {"name": "From", "value": f"{m['from_name']} <{m['from_addr']}>"},
                {"name": "Subject", "value": m["subject"]}]}}


class FakeGmail:
    def __init__(self, messages):
        self.messages, self.modified = {m["id"]: raw(m) for m in messages}, []

    def label_ids(self, names):
        return {n: "Label_" + n.rpartition("/")[2] for n in names}

    def message_ids(self, query=None, label_id=None):
        return list(self.messages) if query == mail.INDEED_QUERY else []

    def message(self, message_id):
        return self.messages[message_id]

    def modify(self, message_id, add, remove):
        self.modified.append((message_id, add, remove))

    def call(self, path):
        return {"emailAddress": "test@example.com"}


class Reclassement(unittest.TestCase):
    def test_confirmations_indeed_rangees_en_bruit_rattrapees(self):
        gmail = FakeGmail([message("Votre candidature a été envoyée", INDEED_FR, mid="a"),
                           message("Nouvelles offres : magasinier", "Magasinier H/F", mid="b",
                                   sender="Indeed <alert@indeed.com>")])
        saved = []
        originals = mail.read_gist, mail.gist_call, mail.load_offers
        mail.read_gist = lambda gist_id: ({"entries": {}}, {"mails": [], "account": "test@example.com"})
        mail.gist_call = lambda path, body=None: saved.append(body)
        mail.load_offers = lambda: []
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                mail.reclassify(gmail, "gist", [], essai=False)
        finally:
            mail.read_gist, mail.gist_call, mail.load_offers = originals
        # Seule la confirmation change de libellé (Bruit → Accusé), l'alerte reste du bruit.
        self.assertEqual(gmail.modified, [("a", ["Label_Accusé"], ["Label_Bruit"])])
        files = saved[-1]["files"]
        entries = json.loads(files[mail.SYNC_FILE]["content"])["entries"]
        self.assertEqual([(e["company"], e["title"], e["via"]) for e in entries.values()],
                         [("Amazon", "Préparateur de commandes H/F", "Indeed")])
        rows = json.loads(files[mail.MAIL_FILE]["content"])["mails"]
        self.assertEqual([(r["id"], r["label"]) for r in rows], [("a", "accuse")])


if __name__ == "__main__":
    unittest.main()
