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


class FormatsReels(unittest.TestCase):
    """Cas reçus le 22/11/2026."""

    def test_objet_candidatures_via_indeed(self):
        m = message("Candidatures via Indeed : Stockiste H/F", "Bonjour Ryan,\nMerci d'avoir postulé.",
                    sender="Indeed Apply <indeedapply@indeed.com>")
        self.assertEqual(mail.classify(m, [])["label"], "accuse")
        self.assertEqual(mail.application_from_mail(m), ("Stockiste H/F", mail.PLACEHOLDER_COMPANY, "Indeed"))
        # Fiche de l'offre dans le texte : l'intitulé puis « Entreprise - Ville ».
        m["body"] = "Votre candidature a été transmise.\nStockiste H/F\nSephora - Rosny-sous-Bois (93)\n"
        self.assertEqual(mail.application_from_mail(m), ("Stockiste H/F", "Sephora", "Indeed"))

    def test_trois_fiches_incompletes_ne_s_ecrasent_pas(self):
        entries = {}
        for i, title in enumerate(("Stockiste H/F", "Gestionnaire de parc/Stock H/F", "Gestionnaire de stocks")):
            m = message("Candidatures via Indeed : " + title, "Merci d'avoir postulé.", at=AT + i,
                        sender="Indeed Apply <indeedapply@indeed.com>", mid=str(i))
            mail.add_outside_application(entries, [], m, *mail.application_from_mail(m), AT)
        self.assertEqual(len(entries), 3)
        # Même sans poste ni entreprise lisibles, deux e-mails différents donnent deux fiches.
        for i in (10, 11):
            m = message(f"Votre candidature n°{i}", "Merci.", at=AT + i, sender="Recrutement <rh@exemple.fr>", mid=str(i))
            mail.add_outside_application(entries, [], m, mail.UNKNOWN_TITLE, mail.PLACEHOLDER_COMPANY, "e-mail", AT)
        self.assertEqual(len(entries), 5)

    def test_fiche_a_preciser_completee_quand_l_e_mail_est_relu(self):
        m = message("Candidatures via Indeed : Stockiste H/F", "Merci d'avoir postulé.",
                    sender="Indeed Apply <indeedapply@indeed.com>")
        entries = {"old": {"id": "old", "title": mail.UNKNOWN_TITLE, "company": mail.PLACEHOLDER_COMPANY,
                           "status": "Candidature envoyée", "via": "Indeed", "mailAt": AT,
                           "mailSubject": m["subject"], "mailFrom": m["from_name"]}}
        mail.add_outside_application(entries, [], m, *mail.application_from_mail(m), AT)
        self.assertEqual([(e["id"], e["title"]) for e in entries.values()], [("old", "Stockiste H/F")])

    def test_hellowork_rapproche_par_l_objet_et_non_par_les_offres_proposees(self):
        crit = tracked("Crit", "Chef d'équipe logistique (H/F)")
        m = message("Votre candidature est arrivée chez Staffizy",
                    "Votre candidature « Agent de stock H/F » pour l'entreprise Staffizy.\n"
                    "Offres similaires : Chef d'équipe logistique (H/F) - Crit - Bobigny",
                    sender="Hellowork Candidature <candidature@hellowork.com>")
        d = mail.classify(m, [crit])
        self.assertEqual((d["label"], d["app"]), ("accuse", None))
        self.assertEqual(mail.application_from_mail(m), ("Agent de stock H/F", "Staffizy", "HelloWork"))


    def test_fiche_emploi_n_attire_plus_les_autres_e_mails(self):
        emploi = tracked("Emploi", mail.UNKNOWN_TITLE)
        m = message("Votre candidature spontanée au sein du Conseil Départemental de la Seine-Saint-Denis",
                    "Nous avons bien reçu votre candidature. Direction de l'emploi et des carrières.",
                    sender="CD 93 <recrutement@seinesaintdenis.fr>")
        self.assertIsNone(mail.classify(m, [emploi])["app"])

    def test_questionnaire_de_satisfaction_range_en_bruit(self):
        m = message("Combien d'étoiles donnez-vous à emploi-collectivites.fr ? ? ?",
                    "Vous avez postulé récemment : donnez-nous votre avis.",
                    sender="Emploi-Collectivites.fr <contact@emploi-collectivites.fr>")
        self.assertEqual(mail.classify(m, [])["label"], "bruit")


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
        # Avant la remise à zéro du site (12/11), rien n'est ajouté : le site la retirerait aussitôt.
        old = message("Votre candidature a été envoyée", INDEED_FR, at=1792800000000, mid="c")  # 23/10/2026
        self.assertIsNone(mail.add_outside_application({}, [], old, *mail.application_from_mail(old), AT))


def raw(m):
    """Message au format de l'API Gmail."""
    data = base64.urlsafe_b64encode(m["body"].encode("utf-8")).decode("ascii")
    return {"id": m["id"], "internalDate": str(m["at"]), "labelIds": ["Label_bruit"],
            "payload": {"mimeType": "text/plain", "body": {"data": data}, "headers": [
                {"name": "From", "value": f"{m['from_name']} <{m['from_addr']}>"},
                {"name": "Subject", "value": m["subject"]}]}}


class Refus400(mail.ApiError):
    """« Precondition check failed » renvoyé par Gmail pour un e-mail (vu le 22/11/2026)."""

    def __init__(self):
        Exception.__init__(self, "Gmail GET /messages/… : HTTP 400")
        self.code = 400


class FakeGmail:
    def __init__(self, messages, by_label=None, refused=()):
        self.messages, self.modified = {m["id"]: raw(m) for m in messages}, []
        self.by_label = by_label  # libellé → identifiants ; sinon tout vient de la recherche Indeed
        self.refused = set(refused)
        for message_id in self.refused:
            self.messages.setdefault(message_id, None)

    def label_ids(self, names):
        return {n: "Label_" + n.rpartition("/")[2] for n in names}

    def message_ids(self, query=None, label_id=None):
        if self.by_label is not None:
            return [] if query else self.by_label.get(label_id, [])
        return list(self.messages) if query == mail.BRUIT_QUERY else []

    def message(self, message_id):
        if message_id in self.refused:
            raise Refus400()
        return self.messages[message_id]

    def modify(self, message_id, add, remove):
        self.modified.append((message_id, add, remove))

    def call(self, path):
        return {"emailAddress": "test@example.com"}


def run_reclassify(gmail, entries=None):
    """Reclassement complet sur un faux Gmail ; renvoie les fichiers écrits dans le gist."""
    saved, state = [], {"entries": entries or {}}
    originals = mail.read_gist, mail.gist_call, mail.load_offers
    mail.read_gist = lambda gist_id: (state, {"mails": [], "account": "test@example.com"})
    mail.gist_call = lambda path, body=None: saved.append(body)
    mail.load_offers = lambda: []
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            mail.reclassify(gmail, "gist", mail.applications_of(state), essai=False)
    finally:
        mail.read_gist, mail.gist_call, mail.load_offers = originals
    return saved[-1]["files"]


class Reclassement(unittest.TestCase):
    def test_e_mail_mal_rattache_detache_de_la_candidature(self):
        # « Finalisez… Pradagroup » avait été posé sur Michael Page, cité dans les offres proposées.
        finalise = message("Finalisez votre candidature sur le site de Pradagroup",
                           "Pour finaliser votre candidature, rendez-vous sur le site de Pradagroup.\n"
                           "Offres similaires : Agent logistique aéronautique H/F - Michael Page - Roissy",
                           sender="Hellowork Candidature <candidature@hellowork.com>", mid="p")
        entries = {"mp": {"id": "mp", "company": "Michael Page", "title": "Agent logistique aéronautique H/F",
                          "status": "À relancer", "appliedDate": "2026-11-13", "mailKind": "action", "mailAt": AT,
                          "mailSubject": finalise["subject"], "mailFrom": finalise["from_name"]}}
        files = run_reclassify(FakeGmail([finalise], by_label={"Label_À faire": ["p"]}), entries)
        mp = json.loads(files[mail.SYNC_FILE]["content"])["entries"]["mp"]
        self.assertEqual(mp["status"], "À relancer")
        self.assertNotIn("mailKind", mp)

    def test_finalisez_range_en_bruit_revient_en_a_faire_dans_la_boite(self):
        finalise = message("Finalisez votre candidature sur le site de Pradagroup",
                           "Pour finaliser votre candidature, rendez-vous sur le site de Pradagroup.",
                           sender="Hellowork Candidature <candidature@hellowork.com>", mid="p")
        self.assertEqual(mail.classify(finalise, [])["label"], "action")
        gmail = FakeGmail([finalise])
        run_reclassify(gmail)
        self.assertEqual(gmail.modified, [("p", ["Label_À faire", "INBOX"], ["Label_Bruit"])])

    def test_confirmations_indeed_rangees_en_bruit_rattrapees(self):
        # Un e-mail que Gmail refuse de lire (« z ») n'arrête plus le reclassement.
        gmail = FakeGmail([message("Votre candidature a été envoyée", INDEED_FR, mid="a"),
                           message("Nouvelles offres : magasinier", "Magasinier H/F", mid="b",
                                   sender="Indeed <alert@indeed.com>")], refused=["z"])
        files = run_reclassify(gmail)
        # Seule la confirmation change de libellé (Bruit → Accusé), l'alerte reste du bruit.
        self.assertEqual(gmail.modified, [("a", ["Label_Accusé"], ["Label_Bruit"])])
        entries =json.loads(files[mail.SYNC_FILE]["content"])["entries"]
        self.assertEqual([(e["company"], e["title"], e["via"]) for e in entries.values()],
                         [("Amazon", "Préparateur de commandes H/F", "Indeed")])
        rows = json.loads(files[mail.MAIL_FILE]["content"])["mails"]
        self.assertEqual([(r["id"], r["label"]) for r in rows], [("a", "accuse")])


if __name__ == "__main__":
    unittest.main()
