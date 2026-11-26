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
        # Stockiste et postes voisins : 15 jours ; le reste : 7 jours.
        for title in ("Stockiste H/F", "Stockman", "Employé de réserve", "Hôtesse de réserve", "Réserviste 25h",
                      "Stock Associate", "Agent de stock", "Employée de stock", "Back of House Associate"):
            with self.subTest(title=title):
                self.assertEqual(collect.max_publication_days(title), 15)
        for title in ("Magasinier", "Gestionnaire de stock", "Préparateur de commandes", "Chef de rayon"):
            with self.subTest(title=title):
                self.assertEqual(collect.max_publication_days(title), 7)

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

    def test_departements_et_delai_par_recherche(self):
        # « stock et réserve » : 15 jours (période d'un mois demandée à EURES) ; départements propres à la recherche.
        page = {"numberRecords": 3, "jvs": [
            self.jv("9100001", "Stockiste H/F", nuts="FR102", days=10),  # Seine-et-Marne : hors de la recherche
            self.jv("9100002", "Stockiste H/F", nuts="FR106", days=10),  # Seine-Saint-Denis, 10 jours : gardée
            self.jv("9100003", "Stockiste H/F", nuts="FR106", days=20),  # trop ancienne
        ]}
        cfg = {"queries": [{"name": "stock", "keywords": "stockiste", "departements": ["93"], "publieesDepuisJours": 15}]}
        offers, bodies = self.run_fetch([page], cfg=cfg)
        self.assertEqual(bodies[0]["publicationPeriod"], "LAST_MONTH")
        self.assertEqual([o["id"] for o in offers], ["ft_9100002"])

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


class Refonte(unittest.TestCase):
    """Refonte du 26/11/2026 : écoles, faux positifs, journal des rejets, rendement Jooble."""

    def test_ecoles_et_formations_ecartees(self):
        for title, company in (("Agent / Agente d'escale aéroportuaire (H/F)", "EAGLE ACADEMY"),
                               ("Agent de Piste Bagagiste H/F", "AEROSTAFF CAMPUS"),
                               ("Formation Qualifiante pour devenir Agent d'Escale H/F", "AIRSUP"),
                               ("Formation Agent Bagagiste H/F", "GI Group Holding")):
            with self.subTest(title=title):
                self.assertTrue(collect.is_school(title, company))
                self.assertIsNone(collect.make_offer(title, company, "Roissy-en-France (95)", "", "https://ex.fr/1",
                                                     "", "Test"))
        # Un employeur qui s'appelle « École » reste ; « formation CACES offerte » n'est pas une école.
        self.assertFalse(collect.is_school("Agent Logistique", "ECOLE NORMALE SUPERIEURE"))
        self.assertFalse(collect.is_school("Magasinier - formation CACES offerte", "Leroy Merlin"))

    def test_faux_positifs_ecartes(self):
        for title in ("Responsable Stockage Energie / BESS C&I H/F", "Technico-Commercial - Aménagement & Stockage Industriel",
                      "Plongeur Magasinier (H/F)", "Magasinier Plongeur (H/F)", "Agent Polyvalent Logistique/Moyens Généraux",
                      "Préparateur de commandes / livreur drive F/H", "Chauffeur Poids Lourd - Préparateur de Commandes",
                      "Extras Bagagistes"):
            with self.subTest(title=title):
                self.assertIsNone(collect.classify_category(title))
        for title, cat in (("Magasinier H/F", "stock"), ("Préparateur de commandes H/F", "preparation"),
                           ("Bagagiste H/F", "aeroport"), ("Stockiste - Centre commercial Rosny 2", "stock")):
            with self.subTest(title=title):
                self.assertEqual(collect.classify_category(title), cat)

    def test_journal_des_rejets(self):
        collect.REJECTS.clear()
        collect.make_offer("Stage magasinier", "Leroy Merlin", "Bondy", "", "https://ex.fr/2", "", "Test")
        collect.make_offer("Développeur web", "ACME", "Paris", "", "https://ex.fr/3", "", "Test")
        collect.make_offer("Développeur web", "ACME", "Paris", "", "https://ex.fr/4", "", "Test")
        collect.make_offer("Magasinier H/F", "ACME", "Lyon", "", "https://ex.fr/5", "", "Test")
        self.assertEqual(collect.REJECTS["stage ou alternance"], {"Stage magasinier": 1})
        self.assertEqual(collect.REJECTS["aucun métier recherché dans le titre"], {"Développeur web": 2})
        self.assertEqual(collect.REJECTS["hors Île-de-France"], {"Magasinier": 1})
        collect.REJECTS.clear()

    def test_rendement_jooble_et_pause(self):
        from datetime import date
        from unittest import mock
        today = date(2026, 11, 26)
        state = {"quota": False, "pages": 0, "suite": "", "rendement": {}, "ran": {"vide": 1, "bonne": 2}}
        with mock.patch.object(collect, "JOOBLE_STATE", state), mock.patch.object(collect, "SOURCE_STATS", []):
            for _ in range(3):
                collect.update_jooble_yield({"bonne": 4}, today)
        self.assertEqual(state["rendement"]["vide"]["vides"], 3)
        self.assertEqual(state["rendement"]["bonne"]["vides"], 0)
        # Trois passages sans offre nouvelle : en pause 7 jours (2 pour une recherche prioritaire).
        self.assertTrue(collect.jooble_paused({"name": "vide"}, state["rendement"], today))
        self.assertTrue(collect.jooble_paused({"name": "vide"}, state["rendement"], date(2026, 12, 2)))
        self.assertFalse(collect.jooble_paused({"name": "vide"}, state["rendement"], date(2026, 12, 3)))
        self.assertFalse(collect.jooble_paused({"name": "vide", "priorite": True}, state["rendement"], date(2026, 11, 28)))
        self.assertFalse(collect.jooble_paused({"name": "bonne"}, state["rendement"], today))


class AlertesIndeedLinkedIn(unittest.TestCase):
    """Alertes e-mail Indeed et LinkedIn (alertes.py) : une carte par lien d'offre, liens sans traceurs."""

    LINKEDIN = (
        '<p>Votre alerte emploi : stockiste</p>'
        '<a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=a&amp;otpToken=SECRET"><img alt="logo"></a>'
        '<a href="https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=a&amp;otpToken=SECRET">Stockiste H/F</a>'
        '<p>Sephora · Paris, Île-de-France, France</p><p>Candidature simplifiée</p>'
        '<a href="https://www.linkedin.com/comm/jobs/view/4099999999/?trackingId=b">Gestionnaire de stock</a>'
        '<p>Zara</p><p>Montreuil, Île-de-France, France</p>'
        '<a href="https://www.linkedin.com/comm/jobs/search/?keywords=stockiste">Voir toutes les offres</a>'
        '<p>Envoyé à quelquun@example.com</p>'
    )

    def test_linkedin(self):
        import alertes
        found = alertes.parse_job_cards(self.LINKEDIN)
        self.assertEqual([(o["title"], o["company"], o["location"], o["url"]) for o in found], [
            ("Stockiste H/F", "Sephora", "Paris, Île-de-France, France", "https://www.linkedin.com/jobs/view/4012345678/"),
            ("Gestionnaire de stock", "Zara", "Montreuil, Île-de-France, France",
             "https://www.linkedin.com/jobs/view/4099999999/"),
        ])

    def test_indeed_lien_direct_et_lien_de_suivi(self):
        import alertes, base64, gzip, json
        target = json.dumps({"u": "https://fr.indeed.com/rc/clk?jk=0123456789abcdef&from=ja&alid=9"}).encode()
        payload = base64.urlsafe_b64encode(gzip.compress(target)).decode().rstrip("=")
        markup = (f'<a href="https://cts.indeed.com/v3/{payload}"><h2>Employé de réserve H/F</h2></a>'
                  '<span>Mango</span><span>Paris (75)</span><span>Facile à postuler</span><span>CDI</span>'
                  '<a href="https://fr.indeed.com/rc/clk/dl?jk=fedcba9876543210&amp;from=ja&amp;tk=1">Magasinier</a>'
                  '<span>Leroy Merlin - Rosny-sous-Bois (93)</span>')
        found = alertes.parse_job_cards(markup)
        self.assertEqual([(o["title"], o["company"], o["location"], o["contract"], o["url"]) for o in found], [
            ("Employé de réserve H/F", "Mango", "Paris (75)", "CDI", "https://fr.indeed.com/viewjob?jk=0123456789abcdef"),
            ("Magasinier", "Leroy Merlin", "Rosny-sous-Bois (93)", "", "https://fr.indeed.com/viewjob?jk=fedcba9876543210"),
        ])

    def test_echantillon_sans_jeton_ni_adresse(self):
        import alertes, json
        sample = json.dumps(alertes.sample_of("LinkedIn", "Alerte", "2026-11-26", {"text/html": self.LINKEDIN},
                                              alertes.parse_job_cards(self.LINKEDIN)), ensure_ascii=False)
        self.assertNotIn("SECRET", sample)
        self.assertNotIn("example.com", sample)
        self.assertNotIn("trackingId", sample)

    def test_partie_texte(self):
        import alertes
        text = ("Stockiste H/F\nSephora\nParis, Île-de-France, France\n"
                "Voir l'offre : https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=x\n")
        found = alertes.parse_job_text(text)
        self.assertEqual([(o["title"], o["company"], o["location"]) for o in found],
                         [("Stockiste H/F", "Sephora", "Paris, Île-de-France, France")])


class ProfilRecherche(unittest.TestCase):
    """Recherche RGRD pilotée par le CV (profilRecherche, 26/11/2026) : recherches générées."""

    def test_recherches_generees(self):
        config = {
            "profilRecherche": {
                "lieux": {"Bondy": "16", "Paris": "8"},
                "postes": [{"keywords": "stockiste", "priorite": True, "maxPages": 5, "lieuxEnPlus": ["Montreuil"]},
                           {"keywords": "stock associate", "lieux": ["Paris"]},
                           {"keywords": "magasinier", "enabled": False}],
                "secteurs": [{"nom": "santé", "recherches": [{"keywords": "AP-HP", "entreprise": True, "lieu": "Paris"}]},
                             {"nom": "logisticiens", "entreprises": ["Geodis"], "lieu": "Bondy", "radius": "26"}],
            },
            "joobleQueries": [{"name": "stockiste · Paris", "keywords": "doublon"}, {"name": "serveur · Paris", "keywords": "serveur"}],
        }
        queries = {q["name"]: q for q in collect.jooble_queries(config)}
        self.assertEqual(list(queries), ["stockiste · Bondy", "stockiste · Paris", "stockiste · Montreuil",
                                         "stock associate · Paris", "AP-HP (entreprise) · Paris",
                                         "Geodis (entreprise) · Bondy", "serveur · Paris"])
        self.assertEqual((queries["stockiste · Bondy"]["maxPages"], queries["stockiste · Bondy"]["radius"]), (5, "16"))
        self.assertEqual(queries["stockiste · Montreuil"]["maxPages"], 1)  # ville en plus : une page
        self.assertEqual(queries["stockiste · Paris"]["keywords"], "stockiste")  # le profil passe avant la liste
        self.assertTrue(queries["Geodis (entreprise) · Bondy"]["companysearch"])
        self.assertFalse(queries["stockiste · Bondy"]["companysearch"])


class AutresAlertes(unittest.TestCase):
    """Alertes France Travail, Choisir le service public, Welcome to the Jungle, Leboncoin, Optioncarrière (26/11/2026)."""

    def test_liens_d_offre(self):
        import alertes
        cases = [
            ("https://candidat.francetravail.fr/offres/recherche/detail/198KZQW?at_medium=email&xtor=ES-1",
             ("France Travail", "198KZQW", "https://candidat.francetravail.fr/offres/recherche/detail/198KZQW")),
            ("https://choisirleservicepublic.gouv.fr/offre-emploi/magasinier-hospitalier-h-f-reference-2026-123456/?utm=x",
             ("Service public", "magasinier-hospitalier-h-f-reference-2026-123456",
              "https://choisirleservicepublic.gouv.fr/offre-emploi/magasinier-hospitalier-h-f-reference-2026-123456/")),
            ("https://www.welcometothejungle.com/fr/companies/aroma-zone/jobs/stock-coordinator_rosny?utm_source=alert",
             ("Welcome to the Jungle", "aroma-zone/jobs/stock-coordinator_rosny",
              "https://www.welcometothejungle.com/fr/companies/aroma-zone/jobs/stock-coordinator_rosny")),
            ("https://www.leboncoin.fr/ad/offres_d_emploi/2876543210?utm_campaign=alerte",
             ("Leboncoin", "2876543210", "https://www.leboncoin.fr/ad/offres_d_emploi/2876543210")),
            ("https://www.optioncarriere.com/jobad/fr8d1c2e3f4a5b6c7d?utm=1",
             ("Optioncarrière", "fr8d1c2e3f4a5b6c7d", "https://www.optioncarriere.com/jobad/fr8d1c2e3f4a5b6c7d")),
        ]
        for link, expected in cases:
            with self.subTest(link=link):
                self.assertEqual(alertes.job_key(link), expected)
        self.assertIsNone(alertes.job_key("https://www.francetravail.fr/candidat/mes-demarches"))

    def test_alerte_france_travail_rejoint_l_offre_eures(self):
        import alertes
        markup = ('<a href="https://candidat.francetravail.fr/offres/recherche/detail/198KZQW?xtor=ES">Magasinier (H/F)</a>'
                  '<p>HOPITAL SAINT-LOUIS</p><p>75 - PARIS 10</p>')
        found = alertes.parse_job_cards(markup)
        self.assertEqual([(o["title"], o["company"], o["location"]) for o in found],
                         [("Magasinier (H/F)", "HOPITAL SAINT-LOUIS", "75 - PARIS 10")])
        # Même adresse que l'offre lue par EURES (FT_DETAIL_URL) : les deux sont fusionnées par la collecte.
        self.assertEqual(found[0]["url"], collect.FT_DETAIL_URL.format("198KZQW"))
