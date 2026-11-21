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
                      "Magasinier hospitalier", "Magasinier préparateur de commandes",
                      "Magasinier approvisionneur", "Responsable adjoint logistique"):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), "stock")

    def test_tout_ce_qui_touche_a_la_reserve(self):
        for title in ("Stockman H/F", "Assistant stockiste (H/F)", "Réserviste H/F - Magasin Paris 8",
                      "Hôte(sse) de réserve CDI", "Agent de réserve", "Back of House Associate - Paris",
                      "Stock & Logistics Advisor"):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), "stock")
        for title in ("Réserviste opérationnel gendarmerie", "Garde de la réserve naturelle",
                      "Commis back of house restaurant"):
            with self.subTest(title=title):
                self.assertIsNone(self.cat(title))

    def test_receptionnaires_ecartes_tout_le_stock_garde(self):
        # Réceptionnaire seul : non voulu ; s'il nomme aussi le stock ou un magasinier, il reste.
        for title, expected in (("Réceptionnaire - H/F", None), ("RÉCEPTIONNAIRE MAGASIN H/F - H/F", None),
                                ("Agent de réception des marchandises", None), ("Réceptionnaire (F/H)", None),
                                ("Magasinier réceptionnaire", "stock"), ("Agent de stock / réceptionnaire", "stock"),
                                ("Réceptionnaire / préparateur de commandes", "preparation"),
                                ("Agent de stock", "stock"), ("Coordinateur stock H/F", "stock"),
                                ("Responsable Optimisation des Stocks H/F", "stock"),
                                ("Gestionnaire stock et approvisionnements", "stock"),
                                ("Assistant achats et stocks", "stock"), ("Approvisionneur H/F", None)):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), expected)

    def test_preparation_onglet_detache(self):
        # Le premier métier nommé l'emporte ; « Préparateur » seul (pharmacie, véhicules) n'en est pas.
        for title, expected in (("Préparateur de commandes CDI", "preparation"),
                                ("Préparateur(trice) de commande H/F", "preparation"),
                                ("Préparateur logistique", "preparation"), ("Order picker", "preparation"),
                                ("Préparateur de commandes / Magasinier", "preparation"),
                                ("Magasinier préparateur de commandes", "stock"),
                                ("Préparateur de commandes vendeur", "vente"),
                                ("Préparateur en pharmacie", None), ("Préparateur de véhicules", None)):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), expected)

    def test_logistique_aeroport(self):
        for title, expected in (("Agent de piste aéroportuaire (H/F)", "aeroport"), ("Agent(e) d'escale", "aeroport"),
                                ("Agent de fret aérien", "aeroport"), ("Bagagiste Roissy CDG", "aeroport"),
                                ("Agent de sûreté aéroportuaire", None), ("Vendeur boutique aéroport", "vente"),
                                ("Agent logistique fret", "stock"), ("Magasinier aéroportuaire", "stock")):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), expected)

    def test_tri_de_colis_sans_inventoriste(self):
        # Inventoriste et agent d'inventaire écartés (21/11/2026), même « grande distribution » (pas l'onglet
        # Rayon) ; « Inventory Associate » (luxe) est un stockiste, l'analyste ne l'est pas.
        for title, expected in (("Agent de tri colis (H/F)", "tri"), ("Trieur / Trieuse", "tri"),
                                ("Équipier(e) d'inventaire", None), ("Inventoriste", None),
                                ("Inventoriste Magasin grande distribution", None),
                                ("Agent de tri - logistique", "tri"), ("Magasinier inventaire", "stock"),
                                ("Gestionnaire Inventaires et Stocks H/F", "stock"), ("Inventory Associate - Paris", "stock"),
                                ("Order Management & Inventory Analyst", None),
                                ("Agent de tri des déchets", None), ("Infirmier de tri", None),
                                ("Chargé d'inventaire du patrimoine", None)):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), expected)

    def test_delai_stockistes(self):
        # Stockiste et postes voisins : 15 jours ; le reste : 5 jours.
        for title in ("Stockiste H/F", "Stockman", "Employé de réserve", "Hôtesse de réserve", "Réserviste 25h",
                      "Stock Associate", "Agent de stock", "Employée de stock", "Back of House Associate"):
            with self.subTest(title=title):
                self.assertEqual(collect.max_publication_days(title), 15)
        for title in ("Magasinier", "Gestionnaire de stock", "Préparateur de commandes", "Chef de rayon"):
            with self.subTest(title=title):
                self.assertEqual(collect.max_publication_days(title), 5)

    def test_encadrement_en_magasin(self):
        # Revue du 21/11/2026 : chefs et managers de rayon, de caisse ou de drive ; ni responsable, ni
        # directeur, ni adjoint de magasin (écartés, sans passer à l'onglet Vente).
        for title, expected in (("Chef de rayon fruits et légumes", "encadrement"), ("Manager de rayon frais", "encadrement"),
                                ("Adjoint(e) responsable de magasin", None), ("Store Manager - Paris", None),
                                ("Responsable de point de vente", None), ("Directeur de Supermarché (H/F)", None),
                                ("RESPONSABLE ADJOINT/E MAGASIN- Serris (77449) (H/F)", None), ("Chef de caisse", "encadrement"),
                                ("ADJOINT RESPONSABLE RAYON EPICERIE (H/F)", "encadrement"),
                                ("Manager Drive (F/H) - Hypermarché", "encadrement"),
                                ("Responsable de réserve", "stock"), ("Assistant manager restaurant", None),
                                ("Responsable de magasin régional", None), ("Responsable boutique en ligne", None),
                                ("Employé de rayon", "rayon")):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), expected)

    def test_revue_onglet_stock(self):
        # Écartées sans passer à un autre onglet (« Responsable de secteur » n'est pas un chef de rayon).
        for title in ("Responsable de Secteur Logistique H/F", "Responsable entrepôt logistique (H/F)",
                      "Superviseur d'Opérations Logistiques et Entrepôt (H/F)", "Agent de quai H/F",
                      "Agent de logistique et de manutention en grande distribution (H/F)", "MAGASINIER LIVREUR",
                      "DISPATCHER TRANSPORT ET LOGISTIQUE (H/F)", "Tech Lead Data | Logistique 2.0 | Paris",
                      "Technicien logistique (H/F)", "Gestionnaire ADV et Flux Logistiques (H/F)"):
            with self.subTest(title=title):
                self.assertIsNone(self.cat(title))
        for title in ("Chef d'équipe logistique (H/F)", "Responsable logistique (H/F)", "Coordinateur logistique (H/F)",
                      "Stock Manager H/F", "SUPERVISEUR STOCK VALLÉE VILLAGE (F/H)", "Agent logistique (H/F)",
                      "Magasinier manutentionnaire", "Responsable Adjoint Logistique F/H"):
            with self.subTest(title=title):
                self.assertEqual(self.cat(title), "stock")

    def test_approvisionneur_ecarte(self):
        for title in ("Approvisionneur H/F", "Assistant(e) approvisionnements H/F", "Livreur Approvisionneur"):
            with self.subTest(title=title):
                self.assertNotEqual(self.cat(title), "stock")

    def test_hors_sujet_et_trop_senior_ecartes(self):
        for title in ("CHEF DE PROJET SI - Domaine Logistique", "Logisticien biomasse F/H",
                      "Responsable Soutien Logistique Intégré (SLI)", "Responsable d'exploitation logistique",
                      "Responsable plateforme logistique H/F", "Responsable Optimisation logistique H/F",
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

    def test_entreprises_exclues(self):
        # Michael Page (toutes ses variantes) et Gojob : aucune offre, quel que soit le métier.
        for company in ("Michael Page", "MICHAEL PAGE ADVERTISING", "MichaelPage", "Gojob"):
            self.assertIsNone(
                collect.make_offer("Magasinier H/F", company, "Bondy (93)", "CDI", "https://ex.fr/3", "", "Test"), company
            )
        # Offre déjà enregistrée : retirée à la collecte suivante, sauf si l'utilisateur la suit.
        offer = {"title": "Magasinier H/F", "company": "Michael Page", "location": "Bondy (93)", "url": "https://ex.fr/4"}
        self.assertEqual(collect.refresh_offer(dict(offer)), "entreprise exclue")
        self.assertEqual(collect.refresh_offer(dict(offer, status="Candidature envoyée")), "")

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


class Eures(unittest.TestCase):
    """Connecteur EURES testé hors ligne : réponses simulées."""

    @staticmethod
    def jv(reference, title, nuts="FR106", days=1, code="directhire", company="Entrepôt Test"):
        import base64
        import time as _time
        created = int((_time.time() - days * 86400) * 1000)
        return {"id": base64.b64encode(f"{reference} 9".encode()).decode().rstrip("="), "title": title,
                "description": "Réception et rangement des marchandises.", "creationDate": str(created),
                "lastModificationDate": str(created), "locationMap": {"FR": [nuts]},
                "positionOfferingCode": code, "employer": {"name": company}}

    def run_fetch(self, pages, env=None, cfg=None):
        from unittest import mock
        bodies = []

        def fake_http_json(req, timeout=35):
            import json as _json
            bodies.append(_json.loads(req.data.decode("utf-8")))
            return pages[len(bodies) - 1]

        with mock.patch.dict("os.environ", env or {}, clear=False), \
                mock.patch.object(collect, "http_json", fake_http_json), \
                mock.patch.object(collect.time, "sleep", lambda s: None):
            if not env:
                import os
                os.environ.pop("FT_CLIENT_ID", None)
                os.environ.pop("FT_CLIENT_SECRET", None)
            offers = collect.fetch_eures(cfg or {"queries": [{"name": "stock", "keywords": "magasinier stockiste"}]})
        return offers, bodies

    def test_reference_france_travail(self):
        self.assertEqual(collect.eures_reference("ODY4NTA2MSA5"), "8685061")  # « 8685061 9 »
        self.assertEqual(collect.eures_reference("MjE2U0JEVCA5"), "216SBDT")
        self.assertEqual(collect.eures_reference("pas-du-base64!"), "")

    def test_offres_retenues(self):
        page = {"numberRecords": 4, "jvs": [
            self.jv("216SBDT", "Stockiste H/F"),
            self.jv("8685061", "Magasinier H/F", code="temporary", company="CRIT INTERIM"),
            self.jv("9000001", "Magasinier H/F", nuts="FR103"),     # Yvelines : département exclu
            self.jv("9000002", "Gestionnaire de stock", days=9),    # créée il y a plus de 5 jours
        ]}
        offers, bodies = self.run_fetch([page])
        self.assertEqual(len(bodies), 1)  # moins de 50 résultats : une seule page
        self.assertEqual(bodies[0]["keywords"][0], {"keyword": "magasinier stockiste", "specificSearchCode": "TITLE"})
        self.assertEqual(bodies[0]["locationCodes"], ["fr10"])
        self.assertEqual([o["id"] for o in offers], ["ft_216SBDT", "ft_8685061"])
        first, second = offers
        self.assertEqual(first["url"], "https://candidat.francetravail.fr/offres/recherche/detail/216SBDT")
        self.assertEqual((first["location"], first["dept"], first["category"]), ("Seine-Saint-Denis (93)", "93", "stock"))
        self.assertEqual(first["contract"], "CDI")
        self.assertEqual(second["contract"], "Intérim")

    def test_ignore_quand_france_travail_actif(self):
        offers, bodies = self.run_fetch([], env={"FT_CLIENT_ID": "id", "FT_CLIENT_SECRET": "secret"})
        self.assertEqual((offers, bodies), ([], []))


class Doublons(unittest.TestCase):
    def offer(self, title, company, location, url):
        return collect.make_offer(title, company, location, "CDI", url, "", "Test")

    def test_departement_seul_et_ville_fusionnes(self):
        eures = self.offer("Magasinier H/F", "Leroy Merlin", "Seine-Saint-Denis (93)", "https://ex.fr/eures")
        jooble = self.offer("Magasinier (H/F)", "Leroy Merlin", "Bobigny (93)", "https://ex.fr/jooble")
        for first, second in ((eures, jooble), (jooble, eures)):
            with self.subTest(first=first["url"]):
                result, merged = collect.dedupe([dict(first), dict(second)])
                self.assertEqual((len(result), merged), (1, 1))
                self.assertEqual(result[0]["location"], "Bobigny (93)")  # la ville précise le département

    def test_deux_villes_jamais_fusionnees(self):
        a = self.offer("Magasinier H/F", "Leroy Merlin", "Bobigny (93)", "https://ex.fr/a")
        b = self.offer("Magasinier H/F", "Leroy Merlin", "Montreuil (93)", "https://ex.fr/b")
        result, merged = collect.dedupe([a, b])
        self.assertEqual((len(result), merged), (2, 0))


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


class JoobleQuota(unittest.TestCase):
    """Quota Jooble : recherches stockiste d'abord, arrêt au premier refus, reprise ensuite."""

    def test_prioritaires_puis_reprise(self):
        queries = [{"name": n, "keywords": n, "priorite": n.startswith("stock")}
                   for n in ("a", "stockiste", "b", "c", "stockman", "d")]
        first, rest = collect.jooble_plan(queries, "c")
        self.assertEqual([q["name"] for q in first], ["stockiste", "stockman"])
        self.assertEqual([q["name"] for q in rest], ["c", "d", "a", "b"])
        # Reprise inconnue (recherche renommée ou supprimée) : on repart du début.
        self.assertEqual([q["name"] for q in collect.jooble_plan(queries, "zz")[1]], ["a", "b", "c", "d"])

    def run_all(self, queries, suite, refuse=None, budget=None):
        from unittest import mock
        from urllib.error import HTTPError
        calls, state = [], {"quota": False, "pages": 0, "suite": suite}

        def fake(api_key, query, max_pages=1):
            calls.append(query["name"])
            if query["name"] == refuse:  # Jooble refuse : quota du jour épuisé
                state["quota"] = True
                raise HTTPError("https://ex.fr", 429, "Too Many Requests", None, None)
            state["pages"] += max_pages
            return []

        config = {"joobleQueries": queries}
        if budget:
            config["joobleMaxRequestsPerRun"] = budget
        with mock.patch.object(collect, "fetch_jooble", fake), mock.patch.object(collect, "JOOBLE_STATE", state), \
                mock.patch.object(collect, "JOOBLE_PAUSE", 0):
            errors = []
            collect.fetch_jooble_all("cle", config, errors)
        return calls, state["suite"], errors

    def test_arret_au_premier_refus(self):
        queries = [{"name": n, "keywords": n, "priorite": n == "stockiste"} for n in ("a", "b", "stockiste", "c", "d")]
        calls, suite, errors = self.run_all(queries, "b", refuse="c")
        self.assertEqual(calls, ["stockiste", "b", "c"])  # prioritaire, reprise à « b », plus rien après le refus
        self.assertEqual(suite, "c")  # « c » n'a rien reçu : elle passera en premier la prochaine fois
        self.assertEqual(len(errors), 1)

    def test_plafond_de_pages(self):
        queries = [{"name": n, "keywords": n, "maxPages": 2} for n in ("a", "b", "c", "d")]
        calls, suite, _ = self.run_all(queries, "c", budget=4)
        self.assertEqual(calls, ["c", "d"])
        self.assertEqual(suite, "a")


if __name__ == "__main__":
    unittest.main()
