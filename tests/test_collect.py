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


if __name__ == "__main__":
    unittest.main()
