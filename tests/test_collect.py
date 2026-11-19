"""Tests des règles de tri de la collecte (collect.py), sans réseau ni clé API.

Lancer : python -m unittest discover -s tests
"""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect  # noqa: E402


class Categories(unittest.TestCase):
    def cat(self, title):
        return collect.classify_category(title)

    def test_postes_stock_gardes(self):
        for title in ("Stockiste H/F", "Magasinier", "Gestionnaire de stock", "Agent de stock",
                      "Employé de réserve H/F", "Réassortisseur", "Responsable de réserve",
                      "Chef d'équipe logistique", "Stock controller", "Logistics coordinator",
                      "Magasinier hospitalier", "Préparateur de commandes CDI",
                      "Magasinier approvisionneur", "Responsable adjoint logistique"):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), "stock")

    def test_approvisionneur_ecarte(self):
        for title in ("Approvisionneur H/F", "Assistant(e) approvisionnements H/F", "Livreur Approvisionneur"):
            with self.subTest(title=title):
                self.assertNotEqual(self.cat(title), "stock")

    def test_hors_sujet_et_trop_senior_ecartes(self):
        for title in ("CHEF DE PROJET SI - Domaine Logistique", "Logisticien biomasse F/H",
                      "Responsable Soutien Logistique Intégré (SLI)", "Responsable d'exploitation logistique",
                      "Responsable plateforme logistique H/F", "Responsable Optimisation des Stocks H/F",
                      "Responsable logistique et évènementiel", "Assistant(e) rh/logistique (F/H)",
                      "ASSISTANT LOGISTIQUE, ACHATS (F/H)", "Responsable d'equipe logistique (H/F), Area Manager"):
            with self.subTest(title=title):
                self.assertNotEqual(self.cat(title), "stock")

    def test_poste_mele_de_vente_pas_en_stock(self):
        # Passe en « vente » (profil de Zia), jamais en « stock » (profil de Ryan).
        self.assertEqual(self.cat("Stockiste/conseiller de vente H/F"), "vente")
        self.assertEqual(self.cat("Stockiste H/F"), "stock")

    def test_informatique_ecartee(self):
        self.assertIsNone(self.cat("Ingénieur stockage de données cloud"))


class Caces(unittest.TestCase):
    def test_titre(self):
        self.assertTrue(collect.caces_required("Cariste H/F"))
        self.assertTrue(collect.caces_required("Préparateur de commandes CACES 1-3-5"))
        self.assertTrue(collect.caces_required("Magasinier titulaire du cacès 3"))

    def test_texte(self):
        for text, expected in (("CACES 1 et 3 obligatoires", True), ("Titulaire du CACES R489", True),
                               ("Permis CACES 3 - Obligatoire", True), ("CACES 1 souhaité", False),
                               ("CACES serait un atout", False), ("Formation CACES assurée en interne", False),
                               ("Vous êtes formés au caces", False), ("Aucune mention", False)):
            with self.subTest(text=text):
                self.assertIs(collect.caces_required("Magasinier", text), expected)

    def test_pas_de_caractere_de_controle_dans_les_regles(self):
        # Une édition passée avait écrit des retours arrière (\x08) à la place de \b.
        source = pathlib.Path(collect.__file__).read_text(encoding="utf-8")
        self.assertNotIn("\x08", source)


class Offres(unittest.TestCase):
    def test_stage_ecarte(self):
        self.assertIsNone(collect.make_offer("Stage magasinier", "X", "Paris (75)", "", "https://ex.fr/1", "", "Test"))

    def test_lien_non_web_ecarte(self):
        self.assertIsNone(collect.make_offer("Magasinier", "X", "Paris (75)", "", "javascript:alert(1)", "", "Test"))

    def test_offre_valide(self):
        offer = collect.make_offer("Magasinier H/F", "Darty", "Bondy (93)", "CDI", "https://ex.fr/2", "", "Test")
        self.assertIsNotNone(offer)
        self.assertEqual(offer["category"], "stock")
        self.assertEqual(offer["dept"], "93")

    def test_departements(self):
        self.assertEqual(collect.detect_dept("Clichy-sous-Bois"), "93")
        self.assertEqual(collect.detect_dept("Clichy"), "92")


class FranceTravail(unittest.TestCase):
    """Connecteur France Travail testé hors ligne : appels simulés, aucune clé réelle."""

    def run_fetch(self, answers):
        from unittest import mock
        from urllib.error import HTTPError
        from urllib.parse import parse_qs, urlparse
        calls = []

        def fake_http_json(req, timeout=35):
            if req.full_url.startswith(collect.FT_TOKEN_URL):
                return {"access_token": "jeton-de-test"}
            calls.append(req.full_url)
            answer = answers[len(calls) - 1]
            if isinstance(answer, int):
                raise HTTPError(req.full_url, answer, "erreur simulée", {}, None)
            return answer

        cfg = {"departements": ["93"], "queries": [
            {"name": "magasinage", "category": "stock", "rome": "N1103"},
            {"name": "stockiste", "category": "stock", "keywords": "stockiste"},
            {"name": "vide", "category": "stock", "rome": "N1303"},
        ]}
        with mock.patch.dict("os.environ", {"FT_CLIENT_ID": "id", "FT_CLIENT_SECRET": "secret"}), \
                mock.patch.object(collect, "http_json", fake_http_json), \
                mock.patch.object(collect.time, "sleep", lambda s: None):
            offers = collect.fetch_francetravail(cfg)
        return offers, [(urlparse(u), parse_qs(urlparse(u).query)) for u in calls]

    def test_appels_et_offres(self):
        job = {"id": "123ABC", "intitule": "Magasinier H/F", "typeContrat": "CDI",
               "dateCreation": "2026-11-18T10:00:00.000Z", "description": "Réception des marchandises.",
               "entreprise": {"nom": "Entrepôt Test"}, "lieuTravail": {"libelle": "93 - BONDY"}}
        # 1re recherche : une offre ; 2e : erreur serveur ; 3e : « 204 », réponse vide.
        offers, calls = self.run_fetch([{"resultats": [job]}, 500, {}])
        self.assertEqual(len(calls), 3)  # une erreur n'arrête pas les recherches suivantes
        url, params = calls[0]
        self.assertEqual(url.path, "/partenaire/offresdemploi/v2/offres/search")
        self.assertEqual(params["codeROME"], ["N1103"])
        self.assertEqual(params["departement"], ["93"])
        self.assertEqual(params["range"], ["0-149"])
        self.assertIn("minCreationDate", params)
        self.assertIn("maxCreationDate", params)
        self.assertEqual(calls[1][1]["motsCles"], ["stockiste"])
        self.assertEqual(len(offers), 1)
        offer = offers[0]
        self.assertEqual(offer["url"], "https://candidat.francetravail.fr/offres/recherche/detail/123ABC")
        self.assertEqual(offer["location"], "Bondy (93)")
        self.assertEqual(offer["contract"], "CDI")
        self.assertEqual(offer["category"], "stock")

    def test_jeton_refuse_arrete_la_source(self):
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError):
            self.run_fetch([401, {}, {}])

    def test_lieux(self):
        self.assertEqual(collect.ft_location({"libelle": "93 - LE PRE-SAINT-GERVAIS"}), "Le Pre-Saint-Gervais (93)")
        self.assertEqual(collect.ft_location({"libelle": "75 - Paris 15e Arrondissement"}), "Paris 15e Arrondissement (75)")
        self.assertEqual(collect.ft_location({"libelle": "Île-de-France"}), "Île-de-France")
        self.assertEqual(collect.ft_location(None), "")


class Trajets(unittest.TestCase):
    def test_lieu_sans_itineraire_ne_bloque_pas_les_autres(self):
        import tempfile
        from unittest import mock
        from urllib.error import HTTPError

        offers = [{"location": f"Ville{i} (93)", "dept": "93"} for i in range(3)]
        answers = iter([HTTPError("u", 404, "aucun itinéraire", {}, None), 25, 40])

        def fake_transit(origin, place, key):
            answer = next(answers)
            if isinstance(answer, Exception):
                raise answer
            return answer

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(collect, "PLACES_FILE", pathlib.Path(tmp) / "lieux.json"), \
                mock.patch.dict("os.environ", {"PRIM_API_KEY": "cle-de-test"}), \
                mock.patch.object(collect, "geocode", lambda city, pc, dept: {"lat": 48.9, "lon": 2.5, "dept": "93"}), \
                mock.patch.object(collect, "transit_minutes_retry", fake_transit), \
                mock.patch.object(collect.time, "sleep", lambda s: None):
            collect.add_travel_info(offers, {"origine": {"lat": 48.9, "lon": 2.48}})
        self.assertNotIn("trajetMin", offers[0])        # 404 : pas d'itinéraire pour ce lieu
        self.assertEqual(offers[1]["trajetMin"], 25)     # les suivants sont bien calculés
        self.assertEqual(offers[2]["trajetMin"], 40)


class Http(unittest.TestCase):
    def test_reponse_vide(self):
        from unittest import mock

        class Empty:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b""

        with mock.patch.object(collect, "urlopen", lambda req, timeout=35: Empty()):
            self.assertEqual(collect.http_json("https://ex.fr"), {})


if __name__ == "__main__":
    unittest.main()
