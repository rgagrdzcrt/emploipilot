
#!/usr/bin/env python3
"""EmploiPilot : collecte Jooble, Adzuna, API France Travail, EURES et flux RSS/Atom autorisés.

- Aucune candidature automatique : ce script ne fait que collecter et organiser.
- Les clés API restent dans les secrets GitHub Actions (jamais imprimées ici).
"""
import os
import re
import json
import html
import time
import base64
import hashlib
import unicodedata
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse, urlencode, quote
from urllib.error import HTTPError, URLError
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "sources.json"
OUT = ROOT / "offres.json"
UA = "EmploiPilot/0.3 (personal job-search tool)"

# Purge des offres obsolètes : une annonce est retirée si sa date de publication
# dépasse MAX_AGE_DAYS ET si elle n'a plus été revue par une source depuis
# MAX_UNSEEN_DAYS (elle a donc quitté la première page des résultats).
MAX_AGE_DAYS = 45
# Annonce publiée (ou mise à jour, pour Jooble) il y a plus de 7 jours (5 jusqu'au 22/11/2026) : retirée
# même si une source la propose encore.
MAX_PUBLICATION_DAYS = 7
# Stockiste et postes voisins (réserve, stock associate, agent ou employé de stock…), cœur de la
# recherche de Ryan : gardés 15 jours (choix du 21/11/2026). Même liste dans pilot.js (STOCKISTE_RE).
MAX_STOCKISTE_DAYS = 15
STOCKISTE_RE = re.compile(
    r"stockist|stockman|stock\s*(?:associate|room|controller|keeper)|\br[eé]serv(?:e|es|iste|istes)\b|r[eé]assortisseu"
    r"|back[\s-]?of[\s-]?house|\bboh\b|inventory\s+associate"
    r"|(?:agent|employ[eé]|[eé]quipi|h[oô]te|assistant|op[eé]rat)\w*\s+(?:de\s+|du\s+|en\s+)?stock",
    re.I,
)


def max_publication_days(title):
    """Âge maximal d'une annonce : 15 jours pour les stockistes et la réserve, 7 pour le reste."""
    return MAX_STOCKISTE_DAYS if STOCKISTE_RE.search(title or "") else MAX_PUBLICATION_DAYS
MAX_UNSEEN_DAYS = 7

STAGE_RE = re.compile(
    r"\b(stage|stagiaire|alternance|alternant|apprentissage|apprentie?)\b", re.I
)
# Dans la description, seules des formules explicites excluent l'offre : un CDI
# peut très bien évoquer le « sens de l'apprentissage » ou un « stage d'intégration ».
STAGE_TEXT_RE = re.compile(
    r"contrat d['’]apprentissage|contrat de professionnalisation|contrat en alternance"
    r"|en alternance|offre de stage|convention de stage|stage conventionn",
    re.I,
)
INTERIM_RE = re.compile(r"\b(int[eé]rim|int[eé]rimaire|mission temporaire)\b", re.I)
CDI_RE = re.compile(r"\b(CDI|contrat [àa] dur[eé]e ind[eé]termin[eé]e)\b", re.I)
CDD_RE = re.compile(r"\b(CDD|contrat [àa] dur[eé]e d[eé]termin[eé]e)\b", re.I)

# Suffixe de genre ou d'écriture inclusive accolé à un métier : « Agent(e) », « Équipier.ère »…
_G = r"[\w().·/-]*"

# Préparation de commandes (onglet à part) : « Préparateur(trice) de commande(s) », « Préparateur
# logistique », « Préparateur de colis », picking. Pas « Préparateur » seul (pharmacie, véhicules…).
PREPA_RE = re.compile(
    r"pr[eé]parat(?:eur|rice|ion)[\w().·/-]*(?:\s*[/-]\s*pr[eé]parat\w*)?\s+(?:de\s+|des\s+)?(?:commandes?|colis)\b"
    r"|pr[eé]parat(?:eur|rice)[\w().·/-]*\s+(?:logisti|e-?commerce|drive\b|d['’ ]?entrep[oô]t|de\s+quai)"
    r"|order\s*picker|\bpick(?:er|ing)\b|agent\w*\s+de\s+pr[eé]paration\b",
    re.I,
)

# Ordre important : un « magasinier vendeur » relève d'abord du stock. Les métiers détachés du
# stock (préparation, aéroport, tri & inventaire) sont départagés par logistics_split().
CATEGORY_RE = {
    "stock": re.compile(
        r"stock|logisti|magasinier|pr[eé]parat(?:eur|rice|ion) de commandes|approvision|cariste"
        r"|r[eé]ceptionnaire|entrep[oô]t|agent de quai"
        # Tout ce qui touche à la réserve d'un magasin : stockman, stockiste, réserviste,
        # « employé de réserve », « hôte(sse) de réserve », « back of house » (luxe)…
        r"|\br[eé]serves?\b|r[eé]serviste|r[eé]assortisseu|back[\s-]?of[\s-]?house|\bboh\b"
        r"|r[eé]ception\s+(?:des\s+|de\s+)?marchandises"
        r"|\binventory\b",  # « Inventory Associate » (luxe) : stockiste ; analyste écarté (STOCK_OTHER_JOB_RE)
        re.I,
    ),
    "preparation": PREPA_RE,
    # Logistique aéroportuaire : fret, piste, escale, bagages (pas la sûreté, voir AEROPORT_EXCLUDE_RE).
    "aeroport": re.compile(
        r"\bfret\b|\bfreight\b|\bcargo\b|\bramp\b|bagagiste|baggage|\bbagages?\b|avitaill|\bhandling\b|a[eé]roportuaire"
        r"|agent" + _G + r"\s+(?:de\s+piste|piste|d['’ ]\s*escale|de\s+trafic|de\s+passage\b|passage\b|de\s+transit)"
        r"|assistant" + _G + r"\s+(?:de\s+)?transit",
        re.I,
    ),
    # Tri de colis et de courrier (pas le tri des déchets, voir TRI_EXCLUDE_RE). Plus d'inventoriste
    # depuis le 21/11/2026 (INVENTORY_COUNT_RE).
    "tri": re.compile(
        r"(?:agent|op[eé]rat|employ[eé]|[eé]quipi|technicien)" + _G + r"\s+(?:de\s+|du\s+)?tri\b|\btrieu(?:r|se)s?\b"
        r"|\btri\s+(?:de\s+|des\s+|du\s+)?(?:colis|courriers?|postal|paquets?)|centre\s+de\s+tri"
        r"|traitement\s+du\s+courrier",
        re.I,
    ),
    # Encadrement en magasin : chef / manager de rayon, adjoint ou responsable de magasin…
    "encadrement": re.compile(
        r"chef(?:fe)?\s+de\s+(?:rayon|caisses?|magasin|boutique)|(?:manager|responsable|r[eé]f[eé]rent\w*)\s+(?:de\s+|du\s+)?rayon"
        r"|(?:responsable|directeur|directrice|manager|g[eé]rant\w*|adjoint\w*|co-?manager|assistant\w*\s+manager)\b"
        r".{0,30}?\b(?:magasins?|boutiques?|points?\s+de\s+ventes?|supermarch\w*|hypermarch\w*|sup[eé]rettes?|surface\s+de\s+vente)"
        r"|\b(?:store|shop|department)\s+manager|\bassistant\w*\s+manager\b"
        r"|manager\s+(?:de\s+|du\s+)?(?:commerce|caisses?|march[eé]|frais|univers|libre.?service)",
        re.I,
    ),
    "rayon": re.compile(
        r"mise en rayon|employ[eé].{0,12}rayon|employ[eé]e? commercia|rayonn?iste|libre.?service"
        r"|r[eé]assort|grande distribution",
        re.I,
    ),
    # Postes de vente en magasin uniquement : « boutique » ou « vente » seuls
    # attrapaient des postes de bureau (assistant des ventes, planification…)
    # et d'encadrement (responsable de boutique).
    "vente": re.compile(
        r"vendeu(?:r|se)|conseill[\w.·()]*(?:\s+\w+)?\s+(?:de |en |des )?ventes?"
        r"|conseill[\w.·()]*\s+(?:de )?mode|caissi|h[oô]te(?:sse)?\s*de\s*caisse"
        r"|sales\s*(?:associate|advisor)|stylist\w*\s*conseil"
        r"|conseill[\w.·()]*\s+client\w*\s+(?:en\s+)?(?:boutique|magasin)"
        r"|[eé]quipier\w*\s+(?:de\s+)?vente|employ[eé]\w*.{0,20}points?\s+de\s+ventes?",
        re.I,
    ),
    # Profil de Zia : service en salle et café (pas la cuisine ni la restauration rapide).
    "restauration": re.compile(
        r"serveu(?:r|se)|\brunner\b|commis de salle|chef(?:fe)? de rang|ma[iî]tre d['’]h[oô]tel"
        r"|barista|barman|barmaid|limonadi"
        r"|h[oô]te(?:sse)?\s+d['’]accueil.{0,25}(?:restau|brasserie|caf[eé])"
        r"|[eé]quipier\w*\s+(?:de\s+)?salle|employ[eé]\w*\s+(?:polyvalent\w*\s+)?(?:de\s+)?(?:salle|caf[eé])",
        re.I,
    ),
}
CATEGORIES = set(CATEGORY_RE)


def _target_categories():
    """Métiers réellement collectés : "categories" dans sources.json (tous si absent).
    Une offre d'un autre métier est écartée, puis retirée d'offres.json à la collecte suivante."""
    try:
        wanted = json.loads(CONFIG.read_text(encoding="utf-8")).get("categories") or []
    except (OSError, ValueError, AttributeError):
        wanted = []
    return {c for c in wanted if c in CATEGORY_RE} or set(CATEGORY_RE)


TARGET_CATEGORIES = _target_categories()

# --- Précision de la catégorie « stock » : seulement les vrais postes de logistique ---
# Métier logistique nommé dans le titre : il l'emporte sur les exclusions ci-dessous.
STOCK_JOB_RE = re.compile(
    r"stock|magasinier|pr[eé]parat(?:eur|rice|ion) de commandes|approvision|cariste"
    r"|r[eé]ceptionnaire|agent de quai|logisticien"
    r"|(?:agent|employ[eé]e?|responsable|gestionnaire|h[oô]te(?:sse)?) (?:de |des |en )?r[eé]serve|r[eé]assortisseu",
    re.I,
)
STOCK_GENERIC_RE = re.compile(r"logisti|entrep[oô]t", re.I)
MANUTENTION_RE = re.compile(r"manutention", re.I)
# Réceptionnaire de garage (conseiller après-vente) : pas de la réception de marchandises.
GARAGE_RE = re.compile(
    r"r[eé]ceptionnaire.{0,40}(?:\bauto(?:mobile)?\b|atelier|\bmoto|carrosserie|apr[eè]s.?vente"
    r"|\bsav\b|\bvag\b|v[eé]hicule|m[eé]cani)",
    re.I,
)
# Autres métiers où « logistique » n'est qu'un à-côté du poste.
STOCK_SIDE_RE = re.compile(
    r"maintenance|sonorisation|services? g[eé]n[eé]raux|moyens g[eé]n[eé]raux|b[aâ]timent|r[eé]gie|[eé]v[eé]nementiel"
    r"|administrati|commercial|boulanger"
    r"|cantine|restauration scolaire|[eé]lectricien|monteur|m[eé]canicien|plombier|soudeur|frigoriste|chauffagiste",
    re.I,
)


# Approvisionneur (achats / commandes fournisseurs) : écarté, sauf si le titre nomme aussi
# le stock ou un poste de terrain (« Magasinier approvisionneur », « Gestionnaire stock et
# approvisionnements ») : tout ce qui touche au stock est gardé.
APPRO_RE = re.compile(r"approvision", re.I)
APPRO_KEEP_RE = re.compile(r"magasinier|stock|r[eé]serv|pr[eé]parat(?:eur|rice) de commandes", re.I)

# Réceptionnaire (E.Leclerc, Carrefour…) : non voulu (21/11/2026), sauf si le titre nomme aussi
# le stock, la réserve ou un magasinier (« Magasinier réceptionnaire », « Agent de stock / réception »).
RECEP_RE = re.compile(
    r"r[eé]ceptionnaire|r[eé]ception\s+(?:des\s+|de\s+)?marchandises|agent[\w().·/-]*\s+de\s+r[eé]ception\b", re.I
)
RECEP_KEEP_RE = re.compile(r"magasini|stock|r[eé]serv", re.I)
# Achats, optimisation, planification : autre métier ou poste trop senior, sauf si le titre
# nomme le stock (« Responsable optimisation des stocks », « Assistant achats et stocks »).
STOCK_SOFT_EXCLUDE_RE = re.compile(r"achats?\b|optimisation|planificat", re.I)

# CACES exigé : Ryan n'en a pas. « Cariste » dans le titre l'impose ; sinon, on lit le texte
# autour de chaque « CACES » : obligatoire / exigé / requis… écarte l'offre, mais pas
# « souhaité », « un plus » ou « formation CACES assurée ».
CARISTE_RE = re.compile(r"cariste|conducteur d['’ ]engins?|chariot", re.I)
# « R485 », « R489 » : recommandations CACES (gerbeur, chariot…), souvent citées sans le mot CACES.
CACES_RE = re.compile(r"c[aà]c[eèé]s|\bR\s?48[2-9]\b|\bR\s?490\b", re.I)
CACES_OPTIONAL_RE = re.compile(
    r"souhait|appr[eé]ci|un plus|\batout|serait|id[eé]alement|de pr[eé]f[eé]rence|pr[eé]f[eé]rable"
    r"|formation|form[eé]e?s?\b|financ|passer|obtenir|accompagn|possibilit|pas (?:obligatoire|n[eé]cessaire|exig)"
    r"|non (?:obligatoire|exig|requis)|sans caces",
    re.I,
)
CACES_REQUIRED_RE = re.compile(
    r"obligatoire|exig|requis|indispensable|imp[eé]rati|n[eé]cessaire|titulaire|valide|validit"
    r"|poss[eé]d|d[eé]tent|muni|ma[iî]tris|habilit|autorisation de conduite",
    re.I,
)


def caces_required(title, text=""):
    """Vrai si l'offre demande un CACES (ou un poste de cariste)."""
    if CARISTE_RE.search(title or "") or CACES_RE.search(title or ""):
        return True  # CACES cité dans le titre : exigé
    text = text or ""
    for match in CACES_RE.finditer(text):
        window = text[max(0, match.start() - 90): match.end() + 90]
        if CACES_OPTIONAL_RE.search(window):
            continue
        if CACES_REQUIRED_RE.search(window):
            return True
    return False


# Postes écartés malgré un mot de la logistique dans le titre : autre métier (SI, ingénierie,
# défense, chantier, énergie, santé, commercial, RH, événementiel) ou poste trop senior pour
# le profil (exploitation, plateforme, régional, area manager). Achats, optimisation et
# planification : voir STOCK_SOFT_EXCLUDE_RE.
STOCK_EXCLUDE_RE = re.compile(
    r"\bsi\b|chef de projet|soutien logistique|\bsli\b|d[eé]fense|biomasse|chantier|usinage|sciage"
    r"|efficacit[eé] [eé]nerg|cadre sup|\bd['’ ]affaires\b|logisti\w*\s+et\s+[eé]v[eèé]nementiel|\brh\b"
    r"|area manager|supply chain manager|tracfin"
    r"|(?:responsable|directeur|directrice|manager)\b.{0,25}(?:exploitation|plateforme|r[eé]gional|site\b)"
    r"|logistique r[eé]gional"
    r"|conseill|vend(?:eur|euse)|\bvente\b|caiss"  # stockiste / conseiller de vente : non voulu
    r"|plong(?:eur|euse)"  # « Plongeur magasinier » : plonge en restauration (26/11/2026)
    # « Réserve » hors magasin : armée, gendarmerie, réserve naturelle ; « back of house » en cuisine.
    r"|r[eé]serv\w*\s+(?:naturel|op[eé]rationnel|militaire|citoyen|sanitaire|communal|de\s+(?:la\s+)?(?:gendarmerie|police|biosph))"
    r"|gendarm|militaire|sapeurs?.pompiers?|arm[eé]e\s+de\s+(?:terre|l['’]air)|marine\s+nationale"
    # Sécurité, ingénierie, conseil et direction : autre métier ou poste trop senior.
    r"|agent\w*\s+de\s+(?:s[eé]curit[eé]|s[uû]ret[eé])|\bssiap\b|business\s+analyst|consultant|ing[eé]nieur|virtualisation"
    r"|m[eé]canicien"
    r"|direct(?:eur|rice)\b.{0,30}(?:logisti|op[eé]rations|services|supply|entrep)"
    r"|back[\s-]?of[\s-]?house.{0,40}(?:restau|cuisin|kitchen|food|crew)|(?:restau|cuisin|kitchen|food|crew|commis).{0,40}back[\s-]?of[\s-]?house",
    re.I,
)

# Stock nommé dans le titre (pas « logistique » seul) : départage avec les métiers détachés du
# stock, le premier nommé l'emporte (« Magasinier préparateur de commandes » : stock ;
# « Préparateur de commandes logistique », « Agent de tri - logistique » : onglet détaché).
STOCK_NAMED_RE = re.compile(
    r"stock|magasini|agent de quai|logisticien|\br[eé]serves?\b|r[eé]serviste|r[eé]assortisseu"
    r"|(?:agent|employ[eé]|op[eé]rat|technicien|assistant|coordinat|responsable|gestionnaire|chef\s+d['’ ]\s*[eé]quipe)"
    + _G + r"\s+(?:de\s+|en\s+)?logisti"
    r"|agent" + _G + r"\s+d['’ ]\s*entrep[oô]t",
    re.I,
)
# Métiers détachés du stock, avec leurs exclusions (autre métier sous le même mot).
PREPA_EXCLUDE_RE = re.compile(
    r"v[eé]hicule|automobile|\bauto\b|carross|pharmac|m[eé]dicament|st[eé]rilis|culinaire|cuisine|physique"
    r"|esth[eé]ti|peinture|bateau|nautique|mat[eé]riel\s+m[eé]dical|biolog|laborat|m[eé]cani|[eé]lectric"
    r"|conseill|vend(?:eur|euse)|\bvente\b|caiss"  # poste mêlé de vente : comme pour le stock
    # « Préparateur de commandes / livreur drive », « Chauffeur PL - préparateur » : transport et
    # livraison non voulus, ici comme dans l'onglet Stock (26/11/2026).
    r"|chauffeu|livreu|conducteu",
    re.I,
)
AEROPORT_EXCLUDE_RE = re.compile(
    r"s[uû]ret[eé]|s[eé]curit[eé]|filtrage|\bpif\b|\bssiap\b|\baps\b"
    r"|pilote|steward|h[oô]tesse\s+de\s+l['’]air|navigant|\bpnc\b|contr[oô]leu\w*\s+a[eé]rien"
    r"|m[eé]cani|technici|maintenance|ing[eé]ni|engineer|avionique|d[eé]clarant"
    r"|commercial|sales|business|account|d['’ ]affaires|directeu|directric|head\s+of|chef\s+de\s+projet|manager"
    r"|conducteu|chauffeu|driver|livreu|coursi|v[eé]lo|bike"
    r"|propret[eé]|nettoyage|entretien|m[eé]nage|vend|conseill|caiss"
    # Accueil et salons (service aux passagers), hôtellerie, chantiers, encadrement des opérations.
    r"|accueil|salon|lounge|voiturier|h[oô]tel|concierg|\bopc\b|\bprojets?\b|chantier|travaux"
    r"|\bextras?\b"  # « Extras bagagistes » : bagagiste d'hôtel (26/11/2026)
    r"|(?:responsable|chef)\w*.{0,25}(?:exploitation|op[eé]rations)",
    re.I,
)
TRI_EXCLUDE_RE = re.compile(
    r"d[eé]chets?|recycl|ordures|s[eé]lectif|valoris|environnement|textile|v[eê]tements?|ressourcerie"
    r"|d[eé]ch[eè]tt?erie|encombrants|patrimoine|cultur|archiv|biblioth|mus[eé]e|monument|forest|faune|flore"
    r"|biodivers|naturalist|[eé]colog|botani|herbier|informatique|logiciel|immobili|comptab|financ"
    r"|m[eé]dical|infirm|urgences|sant[eé]",
    re.I,
)
SPLIT_EXCLUDE_RE = {"preparation": PREPA_EXCLUDE_RE, "aeroport": AEROPORT_EXCLUDE_RE, "tri": TRI_EXCLUDE_RE}
# Encadrement : pas la restauration, l'hôtellerie, le web, les achats, l'optique ou la pharmacie,
# ni l'encadrement multi-sites (régional, réseau, zone).
ENCADREMENT_EXCLUDE_RE = re.compile(
    r"restau|fast.?food|\bfood\b|burger|pizz|sandwich|snack|\bbar\b|caf[eé]|brasserie|traiteur|boulang|p[aâ]tisser"
    r"|cuisine|kitchen|\bcrew\b|mcdo|kfc|starbucks|subway|h[oô]tel"
    r"|en\s+ligne|e-?commerce|\bweb\b|digital|marketing|merchandis|visuel|visual|achat|acheteu|buyer"
    r"|optique|opticien|pharmac|audio|laborat|banque|bancaire|assurance|immobili|automobile|\bauto\b|concession"
    r"|s[eé]curit[eé]|s[uû]ret[eé]|\bsav\b|apr[eè]s.?vente|commercial"
    r"|r[eé]gional|r[eé]gion\b|national|multi.?sites?|r[eé]seau|\bzone\b|district|\barea\b|si[eè]ge"
    # Poste de vente ou d'employé « évolutif » (« Vendeur polyvalent - futur adjoint ») : pas encore de l'encadrement.
    r"|^\W*(?:vendeu|conseill|caissi|h[oô]te|employ|[eé]quipi)",
    re.I,
)


STOCK_DRIVE_RE = re.compile(r"chauffeu|livreu|conducteu|dispatch|transport", re.I)
STOCK_OTHER_JOB_RE = re.compile(r"\badv\b|\bdata\b|tech\s*lead|d[eé]veloppeu|technicien|maintenance|analyst", re.I)
# Inventoriste et agent d'inventaire (comptages pour les sociétés d'inventaire) : écartés (21/11/2026),
# sauf si le titre nomme aussi le stock ou la réserve.
INVENTORY_COUNT_RE = re.compile(
    r"inventori|(?:agent|op[eé]rat|employ[eé]|[eé]quipi|charg[eé]|assistant|technicien|contr[oô]leu)\S*\s+"
    r"(?:d['’ ]\s*|de\s+l['’]\s*)?inventaires?",
    re.I,
)
STOCK_BIG_SITE_RE = re.compile(
    r"(?:responsable|directeu|directrice|manager|superviseu|chef)\w*.{0,40}?"
    r"(?:entrep[oô]t|\bsite\b|secteur|activit[eé]|d[eé]partement|plateforme|exploitation|op[eé]rations)"
    r"|superviseu|pilotage|\bmanager\b",
    re.I,
)
STOCK_DOCK_RE = re.compile(r"\bquai\b|manutention", re.I)
STOCK_KEEP_RE = re.compile(r"stock|magasini|r[eé]serv", re.I)
# Revue de l'onglet Encadrement (21/11/2026) : ni responsable, directeur, gérant ou adjoint de
# magasin, de boutique ou de point de vente (store manager, co-manager…) ; restent les chefs et
# managers de rayon, de caisse, de secteur, de département ou d'univers.
ENCADREMENT_STORE_RE = re.compile(
    r"(?:responsable|directeu|directrice|g[eé]rant|manager|chef|adjoint|assistant|second)\S*(?:\s+\S+){0,4}?\s+"
    r"(?:magasin|boutique|point\s+de\s+vente|supermarch|hypermarch|sup[eé]rette|surface\s+de\s+vente|store|shop)"
    r"|(?:store|shop|assistant)\s+manager|co.?manager|adjoint\S*\s+de\s+direction",
    re.I,
)
ENCADREMENT_KEEP_RE = re.compile(r"rayon|caisse|secteur|univers|d[eé]partement|department|frais|drive", re.I)


def stock_review_reject(title):
    """Revue de l'onglet Stock (21/11/2026), offres écartées sans passer à un autre onglet
    (« Responsable de secteur logistique » n'est pas un chef de rayon) :
    - conduite, livraison, transport, même « Magasinier livreur » ;
    - ADV, data, technicien, maintenance, sans stock ni réserve dans le titre ;
    - encadrement de gros sites (responsable d'entrepôt, de secteur, d'activité, superviseur…),
      agent de quai, manutention, sauf si le titre nomme le stock, la réserve ou le magasinier
      (« Stock Manager », « Superviseur stock » restent ; « Chef d'équipe logistique » aussi).
    """
    if STOCK_DRIVE_RE.search(title):
        return True
    if STOCK_OTHER_JOB_RE.search(title) and not re.search(r"stock|r[eé]serv", title, re.I):
        return True
    return bool((STOCK_BIG_SITE_RE.search(title) or STOCK_DOCK_RE.search(title)) and not STOCK_KEEP_RE.search(title))


def stock_off_topic(title):
    """Titre attrapé par un mot de la logistique sans être un poste de logistique.

    - « Réceptionnaire automobile », « Réceptionnaire atelier » : garage.
    - « Manutentionnaire », « Manutentionnaire logistique », « Agent de manutention en
      entrepôt » : écartés. « Magasinier manutentionnaire », « Agent logistique /
      manutentionnaire » restent (un autre métier est nommé, ou vient en tête).
    - « Agent de maintenance / logistique », « Assistant administratif et logistique »… :
      la logistique n'y est qu'une tâche annexe.
    - « Réceptionnaire » seul (E.Leclerc, Carrefour…) : non voulu ; « Magasinier réceptionnaire » reste.
    """
    if STOCK_EXCLUDE_RE.search(title):
        return True
    if STOCK_SOFT_EXCLUDE_RE.search(title) and not re.search(r"stock", title, re.I):
        return True
    if RECEP_RE.search(title) and not RECEP_KEEP_RE.search(title):
        return True
    if GARAGE_RE.search(title) and not re.search(r"magasinier|stock", title, re.I):
        return True
    if STOCK_JOB_RE.search(title):
        return False
    manutention = MANUTENTION_RE.search(title)
    generic = STOCK_GENERIC_RE.search(title)
    if manutention and (generic is None or manutention.start() < generic.start()):
        return True
    return bool(STOCK_SIDE_RE.search(title))


# Métiers de l'informatique dont le titre contient « stockage », « stock » ou « serveur ».
NOT_TARGET_RE = re.compile(
    r"\bcloud\b|\bsre\b|devops|backup|sauvegarde|data ?cent(?:er|re)|stockage de donn[eé]es|\bstorage\b"
    r"|rayonnement|combustibles?"  # études nucléaires (« combustibles au stockage »)
    r"|serveurs?\s+(?:informatique|linux|windows|web|d['’]applications?)|administrat\w+\s+(?:syst|r[eé]seau|serveur)"
    r"|(?:technicien|ing[eé]nieur)\w*\s+(?:syst|r[eé]seau|serveur|informatique)"
    # Stockage d'énergie (batteries, BESS) et vente de rayonnages industriels (26/11/2026).
    r"|stockage\s+(?:d['’]\s*)?[eé]nergie|\bbess\b|technico.?commercial|am[eé]nagement\s*(?:&|et)\s*stockage"
    r"|stockage\s+industriel",
    re.I,
)

# Écoles et organismes de formation : une formation (« Formation agent d'escale », Eagle Academy,
# Aerostaff Campus…) n'est pas un emploi (26/11/2026). L'employeur « École normale supérieure »
# reste : le mot « école » seul n'est pas retenu.
SCHOOL_TITLE_RE = re.compile(
    r"^\W*formations?\b|\bformations?\s+(?:qualifiante|dipl[oô]mante|certifiante|gratuite|financ[eé]e|r[eé]mun[eé]r[eé]e)"
    r"|\bpoei\b",
    re.I,
)
SCHOOL_COMPANY_RE = re.compile(r"acad[eé]m(?:y|ie)\b|\bcampus\b|\bairsup\b|\bstudi\b|openclassrooms|ifocop", re.I)


def is_school(title, company=""):
    """Annonce d'une école ou d'une formation plutôt que d'un employeur."""
    return bool(SCHOOL_TITLE_RE.search(title or "") or SCHOOL_COMPANY_RE.search(company or ""))

PLACEHOLDER_COMPANY = "Entreprise à vérifier"
PLACEHOLDER_LOCATION = "Lieu à vérifier dans l’annonce"
GENDER_RE = re.compile(r"\(?\b[hfx]\s*/\s*[hfx](?:\s*/\s*[hfx])?\b\)?", re.I)

# Requêtes Jooble par défaut : une par métier visé pour améliorer la couverture
# (personnalisables via "joobleQueries" dans sources.json).
DEFAULT_JOOBLE_QUERIES = [
    {
        "name": "stock-logistique",
        "enabled": True,
        "category": "stock",
        "keywords": "magasinier, stockiste, gestionnaire de stock, logistique, "
        "préparateur de commandes",
        "location": "Île-de-France",
        "radius": "80",
    },
    {
        "name": "rayon",
        "enabled": True,
        "category": "rayon",
        "keywords": "mise en rayon, employé libre-service, rayoniste, employé de rayon, réassort",
        "location": "Île-de-France",
        "radius": "80",
    },
    {
        "name": "vente",
        "enabled": True,
        "category": "vente",
        "keywords": "vendeur, vendeuse, conseiller de vente, prêt-à-porter, boutique",
        "location": "Île-de-France",
        "radius": "80",
    },
]

# API Offres d'emploi v2 de France Travail (https://francetravail.io).
# Nécessite des identifiants partenaires gratuits (secrets FT_CLIENT_ID /
# FT_CLIENT_SECRET). Sans ces secrets, la source est simplement ignorée.
FT_TOKEN_URL = (
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
    "?realm=%2Fpartenaire"
)
# Chemin complet de la recherche (l'ancien « /v2/offres/search » n'existe pas).
FT_SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
FT_SCOPE = "api_offresdemploiv2 o2dsoffre"
FT_PAGE = 150  # résultats par appel : maximum permis par l'API
FT_DETAIL_URL = "https://candidat.francetravail.fr/offres/recherche/detail/{}"
# Une recherche par code métier ROME (plus large et plus sûr que des listes de mots-clés,
# dont la combinaison n'est pas documentée) ; le titre de chaque offre est ensuite trié par
# classify_category comme pour toutes les sources.
DEFAULT_FT_QUERIES = [
    {"name": "magasinage", "category": "stock", "rome": "N1103"},
    {"name": "rayon", "category": "rayon", "rome": "D1507"},
    {"name": "vente", "category": "vente", "rome": "D1214"},
]
FT_CONTRACTS = {"CDI": "CDI", "CDD": "CDD", "MIS": "Intérim"}

# Adzuna fournit une recherche nationale généraliste. Les identifiants ne sont
# lus que dans les secrets de GitHub Actions (jamais dans sources.json).
DEFAULT_ADZUNA_QUERIES = [
    {
        "name": "stock-logistique",
        "category": "stock",
        "keywords": "magasinier stockiste gestionnaire stock logistique préparateur commandes",
    },
    {
        "name": "rayon",
        "category": "rayon",
        "keywords": "employé rayon mise rayon libre service réassort",
    },
    {
        "name": "vente",
        "category": "vente",
        "keywords": "vendeur vendeuse conseiller vente boutique prêt-à-porter",
    },
]

# Lieux connus pour déduire le département depuis un libellé libre. Un lieu
# n'est reconnu que s'il forme des mots entiers du libellé, et le lieu le plus
# long l'emporte : « Clichy-sous-Bois » (93) n'est donc plus pris pour
# « Clichy » (92), ni « Cormeilles-en-Parisis » (95) pour « Paris ».
# Sert aussi au front via le champ "dept" stocké sur chaque offre.
DEPT_CITIES = {
    "75": ["paris"],
    "77": ["seine-et-marne", "meaux", "melun", "torcy", "chelles", "chessy", "bussy",
           "marne-la-vallée", "lagny", "coulommiers", "provins", "fontainebleau",
           "dammarie", "serris", "bailly-romainvilliers", "claye-souilly", "vaux-le-pénil",
           "montereau-fault-yonne", "villeparisis", "roissy-en-brie", "moissy-cramayel",
           "lieusaint", "pontault-combault", "savigny-le-temple", "la genevraye",
           "chalmaison", "mitry-mory", "le mée-sur-seine", "nemours", "la grande-paroisse"],
    "78": ["yvelines", "versailles", "saint-quentin-en-yvelines", "mantes", "poissy",
           "sartrouville", "plaisir", "rambouillet", "trappes", "guyancourt", "chatou",
           "houilles", "conflans", "achères", "andresy", "le chesnay", "le pecq",
           "saint-germain-en-laye", "vélizy-villacoublay", "magny-les-hameaux", "maurepas",
           "montigny-le-bretonneux", "saint-arnoult-en-yvelines", "élancourt",
           "les mureaux", "coignières", "buc"],
    "91": ["essonne", "evry", "massy", "palaiseau", "longjumeau", "draveil", "ris-orangis",
           "savigny-sur-orge", "athis-mons", "juvisy", "bretigny",
           "sainte-genevieve-des-bois", "gif-sur-yvette", "orsay", "bondoufle", "lisses",
           "etampes", "saint-chéron", "les ulis", "limours", "corbeil-essonnes",
           "courcouronnes", "wissous", "morangis", "grigny", "viry-châtillon", "vauhallan"],
    "92": ["hauts-de-seine", "nanterre", "courbevoie", "boulogne-billancourt", "puteaux",
           "asnières", "colombes", "levallois", "neuilly-sur-seine", "clichy", "montrouge",
           "antony", "gennevilliers", "issy-les-moulineaux", "clamart", "suresnes",
           "rueil", "bagneux", "malakoff", "chatenay-malabry", "villeneuve-la-garenne",
           "la défense", "meudon", "sèvres", "saint-cloud", "châtillon", "vanves",
           "bois-colombes", "la garenne-colombes", "le plessis-robinson", "sceaux",
           "fontenay-aux-roses", "garches", "vaucresson", "chaville"],
    "93": ["seine-saint-denis", "bondy", "saint-denis", "montreuil", "pantin",
           "aubervilliers", "bobigny", "noisy-le-sec", "romainville", "rosny-sous-bois",
           "aulnay", "drancy", "bagnolet", "pierrefitte", "saint-ouen", "l'île-saint-denis",
           "villemomble", "gagny", "blanc-mesnil", "livry-gargan", "neuilly-sur-marne",
           "neuilly-plaisance", "clichy-sous-bois", "coubron", "vaujours", "sevran",
           "le pré-saint-gervais", "noisy-le-grand", "montfermeil", "stains",
           "pierrefitte-sur-seine", "les lilas", "épinay-sur-seine", "villepinte",
           "tremblay-en-france", "la courneuve", "le bourget", "villetaneuse"],
    "94": ["val-de-marne", "créteil", "vincennes", "ivry", "vitry", "villejuif",
           "joinville", "nogent-sur-marne", "le perreux", "champigny", "maisons-alfort",
           "saint-maur", "le kremlin-bicêtre", "fontenay-sous-bois", "bonneuil", "limeil",
           "saint-mandé", "chennevières", "villeneuve-le-roi", "villeneuve-saint-georges",
           "choisy-le-roi", "thiais", "chevilly", "rungis", "orly", "charenton",
           "cachan", "arcueil", "gentilly", "l'haÿ-les-roses", "fresnes", "alfortville",
           "sucy-en-brie", "boissy-saint-léger"],
    "95": ["val-d'oise", "argenteuil", "cergy", "pontoise", "sarcelles", "garges",
           "enghien", "montmorency", "eaubonne", "franconville", "ermont", "goussainville",
           "villiers-le-bel", "montigny-lès-cormeilles", "herblay", "taverny",
           "cormeilles-en-parisis", "saint-ouen-l'aumône", "roissy-en-france",
           "gonesse", "bezons", "sannois", "saint-gratien", "osny", "louvres",
           "saint-brice-sous-forêt", "deuil-la-barre", "domont", "villaines-sous-bois"],
}
# Lieux hors Île-de-France fréquents dans les résultats (rayon de 80 km) :
# les offres qui y sont situées sont écartées.
OUTSIDE_IDF_PLACES = [
    "oise", "hauts-de-france", "eure-et-loir", "eure", "loiret", "yonne", "aisne",
    "somme", "normandie", "centre-val-de-loire", "bourgogne", "grand est",
    "beauvais", "compiègne", "creil", "senlis", "chantilly", "chartres", "dreux",
    "evreux", "orléans", "montargis", "auxerre", "reims", "soissons",
    "château-thierry", "rouen", "amiens", "lyon", "marseille", "lille", "lens",
    "bordeaux", "toulouse", "nantes", "nice", "strasbourg", "montpellier", "rennes",
]
IDF_DEPTS = set(DEPT_CITIES)
# Départements d'Île-de-France reconnus mais trop loin : leurs offres sont écartées.
EXCLUDED_DEPTS = {"78", "91"}
# Entreprises dont on ne veut aucune offre (comparaison sans casse ni accents),
# y compris « MICHAEL PAGE ADVERTISING », « Michael Page International »…
EXCLUDED_COMPANIES = {"gojob", "michael-page", "michaelpage"}


def is_excluded_company(company):
    return any(name in slug(company or "") for name in EXCLUDED_COMPANIES)


def strip_html(value):
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


NOTES_MAX = 3000


def rich_text(value):
    """Texte sans balises qui garde les paragraphes et les listes de l'annonce
    (le site s'en sert pour présenter la description dans la fenêtre de tri)."""
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    value = re.sub(r"(?i)<li[^>]*>", "\n• ", value)
    value = re.sub(r"(?i)<br\s*/?>|</?(?:p|div|ul|ol|h[1-6]|tr)[^>]*>|</li>", "\n", value)
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    lines = (re.sub(r"\s+", " ", line).strip() for line in html.unescape(value).splitlines())
    return "\n".join(line for line in lines if line and line != "•")


def cut_text(value, limit=NOTES_MAX):
    """Coupe sur un mot entier et signale la coupure."""
    if len(value) <= limit:
        return value
    return value[:limit].rsplit(" ", 1)[0].rstrip(" ,;:•\n") + "…"


def norm_text(value):
    value = unicodedata.normalize("NFD", (value or "").lower())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", value)


def parse_date(value):
    """Normalise les dates hétérogènes (ISO .NET, ISO décalé, RFC 822, jj/mm/aaaa)."""
    if not value:
        return None
    s = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        try:
            return datetime.strptime(s, "%d/%m/%Y").replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    s = re.sub(r"\.(\d{1,6})\d*", r".\1", s)  # fraction .NET 2026-10-01T07:50:01.4330000
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return parsedate_to_datetime(s)  # format RFC 822 des flux RSS
    except (TypeError, ValueError):
        return None


def url_key(url):
    """Clé de déduplication URL : sans fragment ni / final (la query est conservée,
    les variantes de tracking sont rattrapées par la clé de contenu)."""
    url = (url or "").split("#", 1)[0].strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    key = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    # Jooble et Adzuna ajoutent au lien le mot-clé de la recherche (?ckey=…) ou
    # du suivi (utm_…) : la même annonce trouvée par deux recherches doit avoir
    # la même clé. Pour les autres sites, la query identifie parfois l'offre.
    host = parsed.netloc.lower()
    if parsed.query and not host.endswith(("jooble.org", "adzuna.fr", "adzuna.com")):
        query = "&".join(p for p in parsed.query.split("&") if not p.lower().startswith(("utm_", "ckey=")))
        if query:
            key += "?" + query
    return key.rstrip("/")


def place_key(location):
    """Ville seule : « Montereau, Seine-et-Marne » = « Montereau (77) » = « Montereau 77130 »."""
    first = re.split(r"[,(]", location or "", maxsplit=1)[0]
    return norm_text(re.sub(r"\b\d{5}\b", " ", first))


def content_key(title, company, location):
    """Clé de déduplication sur le contenu : poste (sans H/F) + entreprise + ville.
    Sans entreprise réelle, aucune clé : deux offres anonymes ne sont pas fusionnées."""
    if not norm_text(company) or company == PLACEHOLDER_COMPANY:
        return ""
    title = norm_text(GENDER_RE.sub(" ", title or ""))
    return "|".join((title, norm_text(company), place_key(location)))


def offer_keys(offer):
    keys = {url_key(offer.get("url"))}
    keys.add(content_key(offer.get("title"), offer.get("company"), offer.get("location")))
    return {k for k in keys if k}


def dept_only(offer):
    """Lieu réduit au département (offres EURES) : « Seine-Saint-Denis (93) ». Paris n'en fait pas
    partie : « Paris » est aussi le lieu donné par les autres sources (même clé de contenu)."""
    first = re.split(r"[,(]", offer.get("location") or "", maxsplit=1)[0].strip()
    return slug(first) in {slug(v) for k, v in DEPT_LABELS.items() if k != "75"} | {"ile-de-france"}


def region_key(offer):
    """Poste + entreprise + département, pour reconnaître une offre au département seul."""
    dept, company = str(offer.get("dept") or ""), offer.get("company")
    if dept not in IDF_DEPTS or not norm_text(company) or company == PLACEHOLDER_COMPANY:
        return ""
    return "|".join((norm_text(GENDER_RE.sub(" ", offer.get("title") or "")), norm_text(company), dept))


def lookup_keys(offer):
    """Clés cherchées dans l'index. Une offre au département seul retrouve la même offre (poste,
    entreprise, département) donnée avec sa ville, et inversement ; deux offres avec chacune leur
    ville ne sont jamais fusionnées par ce biais (deux magasins du même département)."""
    keys = offer_keys(offer)
    key = region_key(offer)
    if key:
        keys.add(("dept*|" if dept_only(offer) else "dept0|") + key)
    return keys


def index_keys(offer):
    """Clés sous lesquelles une offre est rangée dans l'index (voir lookup_keys)."""
    keys = offer_keys(offer)
    key = region_key(offer)
    if key:
        keys.add("dept*|" + key)
        if dept_only(offer):
            keys.add("dept0|" + key)
    return keys


def slug(value):
    value = unicodedata.normalize("NFD", (value or "").lower())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


PLACE_PATTERNS = sorted(
    [(slug(place), dept) for dept, places in DEPT_CITIES.items() for place in places]
    + [(slug(place), "HORS") for place in OUTSIDE_IDF_PLACES],
    key=lambda item: len(item[0]),
    reverse=True,
)


def detect_dept(text, postal=True):
    """Déduit le département d'Île-de-France d'un libellé libre.

    Renvoie un code (« 75 »…), « IDF » si seule la région est connue, « HORS »
    si le lieu est clairement hors Île-de-France, ou « » si on ne sait pas.
    `postal=False` ignore les nombres à 5 chiffres (un titre peut citer un salaire).
    """
    raw = (text or "").strip()
    if not raw:
        return ""
    t = slug(raw)
    place_dept = next(
        (dept for place, dept in PLACE_PATTERNS  # du plus long au plus court
         if re.search(rf"(?<![a-z0-9]){re.escape(place)}(?![a-z0-9])", t)),
        "",
    )
    # Une ville d'Île-de-France connue prime : certaines sources accolent un
    # code postal erroné (« Vauhallan, 89160 »).
    if place_dept in IDF_DEPTS:
        return place_dept
    if postal:
        m = re.search(r"(?<!\d)(\d{2})\d{3}(?!\d)", raw)
        if m:
            return m.group(1) if m.group(1) in IDF_DEPTS else "HORS"
    m = re.search(r"\((\d{2}|2[AB])\)", raw) or re.search(r"\b(75|77|78|9[1-5])\b", raw)
    if m:
        return m.group(1) if m.group(1) in IDF_DEPTS else "HORS"
    if place_dept:
        return place_dept
    if re.search(r"(?<![a-z0-9])(ile-de-france|idf)(?![a-z0-9])", t):
        return "IDF"
    return ""


def classify_contract(title, text=""):
    """None pour un stage/une alternance, sinon le type de contrat reconnu."""
    if STAGE_RE.search(title or "") or STAGE_TEXT_RE.search(text or ""):
        return None
    full = f"{title} {text}"
    if INTERIM_RE.search(full):
        return "Intérim"
    if CDI_RE.search(full):
        return "CDI"
    if CDD_RE.search(full):
        return "CDD"
    return "À vérifier"


def classify_category(title):
    """Catégorie déduite du seul titre : les descriptions citent trop souvent
    « vente » ou « stock » pour des métiers sans rapport (cuisinier, data analyst…).
    La catégorie de la requête n'est donc qu'indicative : sans mot-clé métier
    dans le titre, l'offre est écartée. Elle l'est aussi si son métier ne fait pas
    partie des métiers collectés (TARGET_CATEGORIES)."""
    title = title or ""
    if NOT_TARGET_RE.search(title):
        return None
    if INVENTORY_COUNT_RE.search(title) and not re.search(r"stock|r[eé]serv", title, re.I):
        return None  # inventoriste : ni Tri, ni Rayon
    split = logistics_split(title)
    if split:
        return split if split in TARGET_CATEGORIES else None
    for name, pattern in CATEGORY_RE.items():  # stock, encadrement, rayon, vente, restauration
        if name in SPLIT_EXCLUDE_RE:
            continue  # départagés par logistics_split
        if pattern.search(title):
            if name == "stock" and stock_review_reject(title):
                return None
            if name == "stock" and stock_off_topic(title):
                continue
            if name == "stock" and APPRO_RE.search(title) and not APPRO_KEEP_RE.search(title):
                return None
            if name == "encadrement" and ENCADREMENT_EXCLUDE_RE.search(title):
                continue
            if name == "encadrement" and ENCADREMENT_STORE_RE.search(title) and not ENCADREMENT_KEEP_RE.search(title):
                return None  # responsable ou adjoint de magasin : ni Encadrement, ni Vente
            return name if name in TARGET_CATEGORIES else None
    return None


def logistics_split(title):
    """Préparation, aéroport ou tri & inventaire si ce métier est nommé avant tout métier du
    stock (« Agent de tri - logistique » : tri ; « Magasinier préparateur de commandes » : stock)."""
    found = []
    for name, exclude in SPLIT_EXCLUDE_RE.items():
        match = CATEGORY_RE[name].search(title)
        if match and not exclude.search(title):
            found.append((match.start(), name))
    if not found:
        return None
    position, name = min(found)
    named = STOCK_NAMED_RE.search(title)
    return None if named and named.start() < position else name


def is_tracked(offer):
    """Offre suivie par l'utilisateur : elle n'est jamais retirée automatiquement."""
    status = str(offer.get("status") or "").strip().casefold()
    return bool(
        offer.get("appliedDate") or offer.get("notesEdited")
        or (status and status != "à examiner")
    )


def stable_id(url):
    return hashlib.sha256(url.split("#", 1)[0].rstrip("/").encode()).hexdigest()[:16]


# Journal des rejets (« rejets » dans stats.json, 26/11/2026) : nombre d'annonces reçues écartées
# par raison, avec les titres les plus fréquents, pour vérifier qu'aucune bonne offre ne part.
REJECTS = {}
REJECT_EXAMPLES = 12


def note_reject(reason, title):
    titles = REJECTS.setdefault(reason, {})
    key = re.sub(r"\s+", " ", GENDER_RE.sub(" ", title or "")).strip(" -–")[:90]
    titles[key] = titles.get(key, 0) + 1


def category_reject_reason(title):
    """Pourquoi classify_category écarte ce titre (journal des rejets seulement)."""
    if NOT_TARGET_RE.search(title):
        return "autre métier (informatique, énergie…)"
    if INVENTORY_COUNT_RE.search(title) and not re.search(r"stock|r[eé]serv", title, re.I):
        return "inventoriste"
    named = [name for name, pattern in CATEGORY_RE.items() if pattern.search(title)]
    if not named:
        return "aucun métier recherché dans le titre"
    if not any(name in TARGET_CATEGORIES for name in named):
        return f"métier non collecté ({named[0]})"
    return f"écarté par les règles du métier « {named[0]} »"


def reject_reason(title, text, company, contract, category, dept):
    """Raison d'écarter une annonce reçue, ou "" si elle est gardée."""
    if contract is None:
        return "stage ou alternance"
    if is_school(title, company):
        return "école ou formation"
    if category is None:
        return category_reject_reason(title)
    if dept == "HORS":
        return "hors Île-de-France"
    if dept in EXCLUDED_DEPTS:
        return f"département exclu ({dept})"
    if is_excluded_company(company):
        return "entreprise exclue"
    if caces_required(title, text):
        return "CACES exigé"
    return ""


def make_offer(title, company, location, text, url, date, source, category=None):
    if not title or not url or urlparse(url).scheme not in {"http", "https"}:
        return None

    title_text = strip_html(title)
    body_text = strip_html(text)
    contract = classify_contract(title_text, body_text)
    category = classify_category(title_text)  # la catégorie de la requête est indicative
    dept = detect_dept(location) or detect_dept(title_text, postal=False)

    # On exclut les stages/alternances, les écoles, les métiers non recherchés, les lieux
    # hors Île-de-France et les départements exclus (raison notée dans le journal des rejets).
    reason = reject_reason(title_text, body_text, company, contract, category, dept)
    if reason:
        note_reject(reason, title_text)
        return None

    parsed_date = parse_date(date)

    return {
        "id": f"{source.lower().replace(' ', '-')}_{stable_id(url)}",
        "title": title_text,
        "company": strip_html(company) or PLACEHOLDER_COMPANY,
        "location": strip_html(location) or PLACEHOLDER_LOCATION,
        "dept": dept,
        "contract": contract,
        "category": category,
        "date": parsed_date.isoformat() if parsed_date else "",
        "url": url,
        "notes": cut_text(rich_text(text))
        or "Ouvre l’annonce pour vérifier les détails.",
        "status": "À examiner",
        "source": source,
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "demo": False,
    }


def http_json(request, timeout=35):
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
    # Réponse vide (France Travail répond « 204 No Content » quand rien ne correspond).
    return json.loads(raw.decode("utf-8")) if raw.strip() else {}


# Volume par source et par recherche (annoncé par l'API, reçu, retenu),
# écrit dans stats.json pour mesurer ce que la collecte récupère réellement.
SOURCE_STATS = []


def record_stats(source, query_name, announced, received, kept, pages):
    SOURCE_STATS.append({
        "source": source, "recherche": query_name, "annoncees": announced,
        "recues": received, "retenues": kept, "pages": pages,
    })


def _jooble_page(api_key, query, page, per_page):
    payload = {
        "keywords": query.get("keywords", ""),
        "location": query.get("location", "Île-de-France"),
        "radius": str(query.get("radius", "80")),
        "page": str(page),
        "ResultOnPage": str(per_page),
        "companysearch": False,
    }
    req = Request(
        f"https://fr.jooble.org/api/{api_key}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    return http_json(req)


# Jooble accepte environ 450 pages par jour (refus 429 au-delà, constaté les 20 et 21/11/2026) ;
# un passage complet en demande ~170. À chaque collecte : les recherches « priorite » d'abord
# (stockiste, réserve, stock), puis les autres reprennent là où la précédente s'est arrêtée
# (« joobleSuite » dans stats.json), dans la limite de joobleMaxRequestsPerRun pages, et
# Jooble s'arrête au premier refus au lieu d'insister sur toutes les recherches restantes.
JOOBLE_BUDGET = 110
JOOBLE_PAUSE = 2  # secondes entre deux recherches
JOOBLE_STATE = {"quota": False, "pages": 0, "suite": "", "rendement": {}, "ran": {}}
# Rendement (« joobleRendement » dans stats.json, 26/11/2026) : offres nouvelles gardées et pages lues
# par recherche, en moyenne glissante. Une recherche qui n'apporte aucune offre nouvelle à
# JOOBLE_PAUSE_APRES passages de suite est mise en pause (ses pages vont aux autres), puis réessayée
# au bout de JOOBLE_RETEST_JOURS jours (JOOBLE_RETEST_PRIORITE_JOURS pour les prioritaires).
JOOBLE_PAUSE_APRES = 3
JOOBLE_RETEST_JOURS = 7
JOOBLE_RETEST_PRIORITE_JOURS = 2
JOOBLE_DECAY = 0.7
JOOBLE_OUBLI_JOURS = 30  # recherche renommée ou supprimée : son rendement est oublié


def jooble_plan(queries, suite):
    """Ordre de passage : (recherches prioritaires, autres à partir de la recherche `suite`)."""
    active = [q for q in queries if q.get("enabled", True) and q.get("keywords")]
    first = [q for q in active if q.get("priorite")]
    rest = [q for q in active if not q.get("priorite")]
    names = [q.get("name") for q in rest]
    start = names.index(suite) if suite in names else 0
    return first, rest[start:] + rest[:start]


def previous_jooble_suite():
    """Recherche Jooble où reprendre, notée par la collecte précédente dans stats.json."""
    try:
        return str(json.loads(STATS_FILE.read_text(encoding="utf-8")).get("joobleSuite") or "")
    except (OSError, ValueError, AttributeError):
        return ""


def previous_jooble_yield():
    """Rendement des recherches Jooble, noté par la collecte précédente dans stats.json."""
    try:
        data = json.loads(STATS_FILE.read_text(encoding="utf-8")).get("joobleRendement")
    except (OSError, ValueError, AttributeError):
        return {}
    return data if isinstance(data, dict) else {}


def jooble_paused(query, rendement, today):
    """Vrai si la recherche n'a rien apporté de nouveau à ses derniers passages et attend son nouvel essai."""
    info = rendement.get(query.get("name")) or {}
    if int(info.get("vides") or 0) < JOOBLE_PAUSE_APRES:
        return False
    try:
        last = datetime.fromisoformat(str(info.get("vu"))).date()
    except ValueError:
        return False
    wait = JOOBLE_RETEST_PRIORITE_JOURS if query.get("priorite") else JOOBLE_RETEST_JOURS
    return (today - last).days < wait


def update_jooble_yield(new_by_query, today):
    """Met à jour le rendement des recherches lancées à cette collecte (offres nouvelles gardées)."""
    rendement = JOOBLE_STATE["rendement"]
    for name, pages in JOOBLE_STATE["ran"].items():
        info = rendement.get(name) or {}
        new = int(new_by_query.get(name, 0))
        rendement[name] = {
            "nouvelles": round(JOOBLE_DECAY * float(info.get("nouvelles") or 0) + new, 2),
            "pages": round(JOOBLE_DECAY * float(info.get("pages") or 0) + pages, 2),
            "vides": 0 if new else int(info.get("vides") or 0) + 1,
            "vu": today.isoformat(),
        }
    for name in list(rendement):
        try:
            last = datetime.fromisoformat(str(rendement[name].get("vu"))).date()
        except (ValueError, AttributeError):
            last = None
        if last is None or (today - last).days > JOOBLE_OUBLI_JOURS:
            del rendement[name]
    for entry in SOURCE_STATS:
        if entry.get("source") == "Jooble" and entry.get("recherche") in JOOBLE_STATE["ran"]:
            entry["nouvelles"] = int(new_by_query.get(entry["recherche"], 0))


def fetch_jooble_all(api_key, config, errors):
    """Toutes les recherches Jooble de la collecte (voir JOOBLE_BUDGET et JOOBLE_PAUSE_APRES).
    Chaque offre garde le nom de sa recherche (« _q », retiré avant l'écriture) pour le rendement."""
    default_pages = max(1, int(config.get("joobleMaxPages", 1)))
    budget = max(1, int(config.get("joobleMaxRequestsPerRun", JOOBLE_BUDGET)))
    first, rest = jooble_plan(config.get("joobleQueries") or DEFAULT_JOOBLE_QUERIES, JOOBLE_STATE["suite"])
    if rest:
        JOOBLE_STATE["suite"] = rest[0].get("name", "")
    today = datetime.now(timezone.utc).date()
    offers, paused = [], []
    for i, query in enumerate(first + rest):
        if JOOBLE_STATE["quota"] or JOOBLE_STATE["pages"] >= budget:
            why = "refus 429" if JOOBLE_STATE["quota"] else f"{budget} pages lues"
            print(f"Jooble : {why}, recherches suivantes reportées à la prochaine collecte "
                  f"(reprise à « {JOOBLE_STATE['suite']} »).")
            break
        name = query.get("name", "?")
        if jooble_paused(query, JOOBLE_STATE.get("rendement") or {}, today):
            paused.append(name)
            if i >= len(first):
                JOOBLE_STATE["suite"] = rest[(i - len(first) + 1) % len(rest)].get("name", "")
            continue
        pages = min(max(1, int(query.get("maxPages", default_pages))), budget - JOOBLE_STATE["pages"])
        try:
            found = fetch_jooble(api_key, query, max_pages=pages)
            for offer in found:
                offer["_q"] = name
            offers.extend(found)
            JOOBLE_STATE.setdefault("ran", {})[name] = SOURCE_STATS[-1]["pages"] if SOURCE_STATS else pages
            done = True
        except Exception as exc:
            errors.append({"source": f"Jooble/{name}", "error": type(exc).__name__})
            done = not JOOBLE_STATE["quota"]  # refusée faute de quota : elle repassera en premier
        if i >= len(first) and done:
            JOOBLE_STATE["suite"] = rest[(i - len(first) + 1) % len(rest)].get("name", "")
        time.sleep(JOOBLE_PAUSE)
    if paused:
        print(f"Jooble : {len(paused)} recherche(s) en pause (aucune offre nouvelle à {JOOBLE_PAUSE_APRES} "
              f"passages de suite) : {', '.join(paused)}.")
    return offers


def fetch_jooble(api_key, query, max_pages=1, per_page=50):
    """Lit jusqu'à `max_pages` pages de résultats (50 offres chacune)."""
    jobs, total, pages = [], 0, 0
    for page in range(1, max_pages + 1):
        try:
            data = _jooble_page(api_key, query, page, per_page)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            # Ne jamais afficher l'URL complète : elle contient la clé API.
            code = getattr(exc, "code", type(exc).__name__)
            print(f"Jooble [{query.get('name')}] page {page} : erreur {code}.")
            if code == 429:
                JOOBLE_STATE["quota"] = True  # quota du jour épuisé : plus aucune recherche
            if page == 1:
                raise
            break  # quota ou incident : on garde les pages déjà lues
        JOOBLE_STATE["pages"] += 1
        page_jobs = data.get("jobs", [])
        total = int(data.get("totalCount") or total or 0)
        jobs.extend(page_jobs)
        pages = page
        if len(page_jobs) < per_page or len(jobs) >= total:
            break
        time.sleep(1.5)

    offers = []
    for job in jobs:
        url = (job.get("link") or "").strip()
        text = job.get("snippet") or ""
        title = job.get("title") or ""
        offer = make_offer(
            title=title,
            company=job.get("company") or "",
            location=job.get("location") or "",
            text=text,
            url=url,
            # Jooble ne fournit que la date de mise à jour de l'annonce, pas sa
            # date de publication : elle est rangée à part dans "updated".
            date="",
            source="Jooble",
            category=query.get("category"),
        )
        if offer:
            updated = parse_date(job.get("updated") or "")
            if updated:
                offer["updated"] = updated.isoformat()
            # Le type et la rémunération sont utiles pour examiner l'annonce.
            extra = []
            if job.get("type"):
                extra.append("Type indiqué : " + str(job["type"]))
            if job.get("salary"):
                extra.append("Salaire indiqué : " + str(job["salary"]))
            if extra:
                offer["notes"] = (offer["notes"] + "\n" + " | ".join(extra)).strip()
            offers.append(offer)

    print(f"Jooble [{query.get('name')}] : {total} annoncées, {len(jobs)} reçues ({pages} page(s)), "
          f"{len(offers)} retenues après filtrage.")
    record_stats("Jooble", query.get("name", "?"), total, len(jobs), len(offers), pages)
    return offers


def fetch_francetravail(ft_cfg):
    client_id = os.environ.get("FT_CLIENT_ID", "").strip()
    client_secret = os.environ.get("FT_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print("France Travail ignoré : secrets FT_CLIENT_ID / FT_CLIENT_SECRET absents.")
        return []

    token_req = Request(
        FT_TOKEN_URL,
        data=urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": FT_SCOPE,
            }
        ).encode("utf-8"),
        headers={
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        token = http_json(token_req).get("access_token", "")
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        print(f"France Travail : échec d'authentification ({type(exc).__name__}).")
        raise

    departements = ft_cfg.get("departements") or ["75", "93"]
    queries = [q for q in (ft_cfg.get("queries") or DEFAULT_FT_QUERIES) if q.get("enabled", True)]
    # Seulement les offres récentes : les plus anciennes seraient écartées de toute façon.
    days = int(ft_cfg.get("publieesDepuisJours") or MAX_PUBLICATION_DAYS)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    window = {
        "minCreationDate": (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "maxCreationDate": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    offers, failures = [], 0

    for dept in departements:
        for query in queries:
            params = {"departement": dept, "range": f"0-{FT_PAGE - 1}", **window}
            if query.get("rome"):
                params["codeROME"] = query["rome"]
            if query.get("keywords"):
                params["motsCles"] = query["keywords"]
            req = Request(
                f"{FT_SEARCH_URL}?{urlencode(params)}",
                headers={
                    "User-Agent": UA,
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
            label = f"{query.get('name')} / {dept}"
            # Une recherche en échec n'arrête plus les autres ; seul un jeton refusé le fait.
            data = None
            for attempt in (1, 2):
                try:
                    data = http_json(req, timeout=25)
                    break
                except HTTPError as exc:
                    if exc.code == 401:
                        raise
                    if exc.code == 429 and attempt == 1:
                        time.sleep(2)  # trop d'appels par seconde : une seconde chance
                        continue
                    print(f"France Travail [{label}] : erreur HTTP {exc.code}, recherche suivante.")
                except (URLError, TimeoutError, ValueError) as exc:
                    print(f"France Travail [{label}] : erreur ({type(exc).__name__}), recherche suivante.")
                break
            if data is None:
                failures += 1
                continue

            count = 0
            results = data.get("resultats") or []
            for job in results:
                # Offre déposée directement chez France Travail : pas d'URL d'origine.
                url = ((job.get("origineOffre") or {}).get("urlOrigine") or "").strip()
                if not url and job.get("id"):
                    url = FT_DETAIL_URL.format(quote(str(job["id"]), safe=""))
                contract = FT_CONTRACTS.get(job.get("typeContrat", ""), "À vérifier")
                parsed_date = parse_date(job.get("dateCreation") or "")
                location = ft_location(job.get("lieuTravail"))
                offer = make_offer(
                    title=job.get("intitule") or "",
                    company=(job.get("entreprise") or {}).get("nom") or "",
                    location=location,
                    text=job.get("description") or "",
                    url=url,
                    date=job.get("dateCreation") or "",
                    source="France Travail",
                    category=query.get("category"),
                )
                if offer:
                    offer["id"] = f"ft_{job.get('id') or stable_id(url)}"
                    offer["dept"] = dept or offer["dept"]
                    if not offer["date"] and parsed_date:
                        offer["date"] = parsed_date.isoformat()
                    if not (contract == "À vérifier" and offer["contract"] != "À vérifier"):
                        offer["contract"] = contract
                    offers.append(offer)
                    count += 1
            print(f"France Travail [{label}] : {len(results)} offre(s) reçue(s), {count} retenue(s).")
            record_stats("France Travail", label, len(results), len(results), count, 1)
            time.sleep(0.5)  # quelques appels par seconde au plus

    if failures and not offers and failures == len(departements) * len(queries):
        raise RuntimeError("France Travail : toutes les recherches ont échoué.")
    return offers


def ft_location(lieu):
    """« 93 - BONDY » → « Bondy (93) » : lisible, et reconnu par le calcul des trajets."""
    libelle = ((lieu or {}).get("libelle") or "").strip()
    match = re.match(r"^(\d{2,3}|2[AB])\s*-\s*(.+)$", libelle)
    if not match:
        return libelle
    city = match.group(2).strip()
    if city.isupper():
        city = re.sub(r"(^|[\s\-'’])(\w)", lambda m: m.group(1) + m.group(2).upper(), city.lower())
    return f"{city} ({match.group(1)})"


# EURES, le portail européen de l'emploi (Commission européenne), rediffuse sans clé les offres
# de France Travail et de ses partenaires (agences d'intérim, Meteojob…). Sa recherche publique
# est appelée en lecture seule ; chaque offre renvoie à sa page France Travail, dont la
# référence est contenue dans l'identifiant EURES. Seul le département est connu (pas la ville).
EURES_SEARCH_URL = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search"
EURES_PAGE = 50  # maximum accepté par l'API
EURES_NUTS = {"fr101": "75", "fr102": "77", "fr103": "78", "fr104": "91",
              "fr105": "92", "fr106": "93", "fr107": "94", "fr108": "95"}
DEPT_LABELS = {"75": "Paris", "77": "Seine-et-Marne", "78": "Yvelines", "91": "Essonne",
               "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne", "95": "Val-d'Oise"}
# Mots du titre, reliés par OU (une expression entre guillemets n'est pas prise en compte).
DEFAULT_EURES_QUERIES = [
    {"name": "stock et réserve", "keywords": "magasinier stockiste stockman stock reserve reserviste receptionnaire"},
    {"name": "préparation de commandes", "keywords": "preparateur preparatrice picking picker"},
]
# Offre « temporaire » d'une agence d'intérim connue : mission d'intérim plutôt que CDD.
INTERIM_AGENCY_RE = re.compile(
    r"int[eé]rim|adecco|manpower|randstad|synergie|proman|\bcrit\b|start\s*people|samsic|partnaire|actual"
    r"|supplay|temporis|kelly|iziwork|staffmatch|expectra|ergalis|triangle|leader\s+int",
    re.I,
)


def eures_reference(jv_id):
    """« ODY4NTA2MSA5 » (« 8685061 9 ») → « 8685061 » : référence France Travail de l'offre.
    Le 9 final désigne France Travail ; une offre d'un autre point de contact est ignorée."""
    try:
        raw = base64.b64decode(jv_id + "=" * (-len(jv_id) % 4)).decode("ascii")
    except (ValueError, UnicodeDecodeError):
        return ""
    reference, _, point = raw.partition(" ")
    return reference if point == "9" and re.fullmatch(r"[0-9A-Z]{5,12}", reference) else ""


def _eures_body(keywords, page, period="LAST_WEEK"):
    return {
        "resultsPerPage": EURES_PAGE, "page": page, "sortSearch": "MOST_RECENT",
        # Créées ou modifiées dans la période (semaine, ou mois pour la recherche des stockistes) ;
        # la date de création est vérifiée ensuite.
        "publicationPeriod": period,
        "keywords": [{"keyword": keywords, "specificSearchCode": "TITLE"}],
        "locationCodes": ["fr10"],  # Île-de-France : l'API ne filtre pas par département
        "occupationUris": [], "skillUris": [], "requiredExperienceCodes": [], "positionScheduleCodes": [],
        "sectorCodes": [], "educationAndQualificationLevelCodes": [], "positionOfferingCodes": [],
        "euresFlagCodes": [], "otherBenefitsCodes": [], "requiredLanguages": [], "minNumberPost": None,
        "sessionId": "emploipilot",
    }


def eures_offer(jv, depts, cutoff_ms):
    """Offre EURES → offre du site (None si hors période, hors département ou hors métier)."""
    reference = eures_reference(str(jv.get("id") or ""))
    created = int(jv.get("creationDate") or 0)
    regions = (jv.get("locationMap") or {}).get("FR") or []
    dept = next((EURES_NUTS[str(r).lower()] for r in regions if str(r).lower() in EURES_NUTS), "")
    code = str(jv.get("positionOfferingCode") or "").lower()
    if (not reference or created < cutoff_ms or dept not in depts
            or code in ("internship", "apprenticeship", "traineeship")):
        return None
    translation = next(iter((jv.get("translations") or {}).values()), None) or {}
    title = jv.get("title") or translation.get("title") or ""
    text = jv.get("description") or translation.get("description") or ""
    company = (jv.get("employer") or {}).get("name") or ""
    if norm_text(company) in ("nonrenseigne", "nonrenseignee", "confidentiel", "entrepriseconfidentielle"):
        company = ""  # employeur masqué par France Travail
    offer = make_offer(
        title=title, company=company, location=f"{DEPT_LABELS[dept]} ({dept})", text=text,
        url=FT_DETAIL_URL.format(quote(reference, safe="")),
        date=datetime.fromtimestamp(created / 1000, timezone.utc).isoformat(), source="EURES",
    )
    if not offer:
        return None
    offer["id"] = f"ft_{reference}"  # même identifiant que l'offre lue par l'API France Travail
    offer["dept"] = dept
    if offer["contract"] == "À vérifier" and code == "directhire":
        offer["contract"] = "CDI"
    elif offer["contract"] == "À vérifier" and code == "temporary":
        offer["contract"] = "Intérim" if INTERIM_AGENCY_RE.search(company) else "CDD"
    return offer


def fetch_eures(cfg):
    """Offres France Travail rediffusées par EURES, en Île-de-France, sans clé."""
    if not cfg.get("enabled", True):
        return []
    if (cfg.get("sansFranceTravail", True) and os.environ.get("FT_CLIENT_ID", "").strip()
            and os.environ.get("FT_CLIENT_SECRET", "").strip()):
        print("EURES ignoré : l'API France Travail est active (mêmes offres, avec la ville).")
        return []
    queries = [q for q in (cfg.get("queries") or DEFAULT_EURES_QUERIES)
               if q.get("enabled", True) and q.get("keywords")]
    depts = {str(d) for d in (cfg.get("departements") or ["75", "77", "92", "93", "94", "95"])}
    days = int(cfg.get("publieesDepuisJours") or MAX_PUBLICATION_DAYS)
    cutoff_ms = (time.time() - days * 86400) * 1000
    default_pages = max(1, int(cfg.get("maxPages") or 4))
    offers, failures = [], 0
    for query in queries:
        label = query.get("name") or query["keywords"]
        # Délai propre à la recherche (« stock et réserve » : 15 jours, comme MAX_STOCKISTE_DAYS).
        q_days = int(query.get("publieesDepuisJours") or days)
        # Départements propres à la recherche (métiers de Ryan hors stockiste : 75, 93, 95).
        q_depts = {str(d) for d in query["departements"]} if query.get("departements") else depts
        q_cutoff = (time.time() - q_days * 86400) * 1000
        period = "LAST_WEEK" if q_days <= 7 else "LAST_MONTH"
        announced = received = kept = pages = 0
        for page in range(1, max(1, int(query.get("maxPages") or default_pages)) + 1):
            req = Request(
                EURES_SEARCH_URL,
                data=json.dumps(_eures_body(query["keywords"], page, period)).encode("utf-8"),
                headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"},
                method="POST",
            )
            try:
                data = http_json(req, timeout=40)
            except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                print(f"EURES [{label}] : erreur ({type(exc).__name__}), recherche suivante.")
                failures += 1
                break
            jobs = data.get("jvs") or []
            announced = int(data.get("numberRecords") or 0)
            pages += 1
            received += len(jobs)
            for jv in jobs:
                offer = eures_offer(jv, q_depts, q_cutoff)
                if offer:
                    offers.append(offer)
                    kept += 1
            # Tri par date de modification : une page qui finit avant la période (créée au
            # plus tard quand elle a été modifiée) clôt la recherche.
            last_modified = int((jobs[-1].get("lastModificationDate") or 0) if jobs else 0)
            if len(jobs) < EURES_PAGE or page * EURES_PAGE >= announced or last_modified < q_cutoff:
                break
            time.sleep(1)
        print(f"EURES [{label}] : {received} offre(s) reçue(s) sur {announced}, {kept} retenue(s).")
        record_stats("EURES", label, announced, received, kept, pages)
        time.sleep(1)
    if failures and failures == len(queries):
        raise RuntimeError("EURES : toutes les recherches ont échoué.")
    return offers


def api_json(url, label, timeout=30):
    """GET JSON sans jamais afficher l'URL (elle peut contenir une clé)."""
    req = Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    try:
        return http_json(req, timeout=timeout)
    except HTTPError as exc:
        print(f"{label} : erreur HTTP {exc.code}.")
        raise
    except (URLError, TimeoutError, ValueError) as exc:
        print(f"{label} : erreur de connexion ou réponse invalide ({type(exc).__name__}).")
        raise


MCP_PROTOCOL_VERSION = "2025-03-26"
JOBLET_MCP_URL = "https://joblet-grok.joveo.com/mcp"
WORKOPIA_MCP_URL = "https://workopia.io/api/mcp-jobs"
WORKOPIA_TOKEN_URL = "https://workopia.io/api/oauth/token"


def _mcp_post(endpoint, payload, token="", session_id="", protocol_version=""):
    """Envoie un message JSON-RPC MCP et accepte les réponses JSON ou SSE."""
    headers = {
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    if protocol_version:
        headers["MCP-Protocol-Version"] = protocol_version

    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=40) as response:
            raw = response.read().decode("utf-8", errors="replace")
            response_session = response.headers.get("Mcp-Session-Id", session_id)
            content_type = response.headers.get("Content-Type", "")
    except HTTPError as exc:
        # Ne jamais imprimer le corps d'erreur : il pourrait contenir des
        # détails d'authentification ou des données de compte.
        raise RuntimeError(f"réponse HTTP {exc.code}") from None
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"connexion impossible ({type(exc).__name__})") from None

    if not raw.strip():
        return {}, response_session

    if "text/event-stream" in content_type.lower():
        messages = []
        for line in raw.splitlines():
            if not line.startswith("data:"):
                continue
            value = line[5:].strip()
            if not value or value == "[DONE]":
                continue
            try:
                messages.append(json.loads(value))
            except json.JSONDecodeError:
                continue
        if not messages:
            raise RuntimeError("réponse MCP SSE illisible")
        # Les notifications peuvent accompagner la réponse; prendre le
        # dernier message JSON-RPC qui porte un identifiant.
        parsed = next(
            (message for message in reversed(messages) if "id" in message),
            messages[-1],
        )
    else:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("réponse MCP JSON illisible") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("réponse MCP inattendue")
    return parsed, response_session


def mcp_tool_call(endpoint, tool_name, arguments, token=""):
    """Initialise une session MCP puis appelle un outil en lecture seule."""
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "zcrt-job-collector", "version": "1.0.0"},
        },
    }
    response, session_id = _mcp_post(endpoint, initialize, token=token)
    if response.get("error"):
        raise RuntimeError("initialisation MCP refusée")
    negotiated = (response.get("result") or {}).get(
        "protocolVersion", MCP_PROTOCOL_VERSION
    )

    initialized = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    _, session_id = _mcp_post(
        endpoint,
        initialized,
        token=token,
        session_id=session_id,
        protocol_version=negotiated,
    )

    call = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    response, _ = _mcp_post(
        endpoint,
        call,
        token=token,
        session_id=session_id,
        protocol_version=negotiated,
    )
    if response.get("error"):
        raise RuntimeError("appel de l'outil MCP refusé")
    result = response.get("result") or {}
    if result.get("isError"):
        raise RuntimeError("l'outil MCP a signalé une erreur")
    return result


def _mcp_job_rows(result):
    """Extrait les annonces des formes MCP structurées ou textuelles usuelles."""
    candidates = [result]
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        candidates.insert(0, structured)

    def rows_from(value, depth=0):
        if depth > 4:
            return []
        if isinstance(value, list):
            if value and all(
                isinstance(item, dict)
                and any(key in item for key in ("title", "job_title", "jobTitle", "card", "job", "offer"))
                for item in value
            ):
                return value
            for item in value:
                found = rows_from(item, depth + 1)
                if found:
                    return found
            return []
        if not isinstance(value, dict):
            return []
        for key in ("jobs", "items", "job_cards", "results", "offers", "data"):
            nested = value.get(key)
            found = rows_from(nested, depth + 1)
            if found:
                return found
        for key, nested in value.items():
            if key == "content":
                continue
            if isinstance(nested, (dict, list)):
                found = rows_from(nested, depth + 1)
                if found:
                    return found
        return []

    for candidate in candidates:
        rows = rows_from(candidate)
        if rows:
            return rows

    for block in result.get("content", []):
        if not isinstance(block, dict) or block.get("type") != "text":
            continue
        try:
            decoded = json.loads(block.get("text", ""))
        except (json.JSONDecodeError, TypeError):
            continue
        rows = rows_from(decoded)
        if rows:
            return rows
    return []


def _unwrap_job_row(row):
    """Déplie les cartes d'annonce renvoyées par certains serveurs MCP."""
    if not isinstance(row, dict):
        return {}
    for key in ("card", "job", "offer"):
        if isinstance(row.get(key), dict):
            return row[key]
    return row


def _is_france_idf_location(location):
    """Refuse les homonymes étrangers, notamment les nombreux « Paris » US."""
    raw = str(location or "").strip()
    normalized = norm_text(raw)
    if not raw:
        return False
    if any(marker in normalized for marker in (
        "unitedstates", "usa", "virginia", "tennessee", "mississippi",
        "kentucky", "maine", "ohio", "michigan", "california", "texas",
        "florida", "newyork", "canada", "india", "australia", "unitedkingdom",
    )):
        return False
    if "france" in normalized or "iledefrance" in normalized or "idf" in normalized:
        return True
    if re.search(r"\bFR\s*$", raw, re.I):
        return True
    if re.search(r"\b(?:75|77|78|91|92|93|94|95)\d{3}\b", raw):
        return True
    # Un nom de ville seul ne suffit pas : le serveur doit préciser un indice
    # français pour éviter de publier une annonce d'un homonyme étranger.
    return False


def _row_value(row, *keys):
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return value
    return ""


def _fetch_mcp_search(endpoint, tool_name, arguments, source, category, token=""):
    """Mappe une réponse MCP de recherche vers le format commun du site."""
    result = mcp_tool_call(endpoint, tool_name, arguments, token=token)
    offers = []
    for raw_row in _mcp_job_rows(result):
        row = _unwrap_job_row(raw_row)
        title = _row_value(row, "title", "job_title", "jobTitle", "position")
        company = _row_value(row, "company", "company_name", "companyName", "employer")
        location = _row_value(row, "location", "city", "location_name", "locationName")
        text = _row_value(row, "summary", "description", "snippet", "job_description")
        url = _row_value(
            row, "apply_url", "applyUrl", "apply_link", "applyLink",
            "url", "jobletUrl", "job_url", "jobUrl",
        )
        if not _is_france_idf_location(location):
            continue
        # Les recherches d'emploi peuvent renvoyer des catégories voisines.
        # On ne garde que les annonces dont le titre/texte confirme le métier.
        if classify_category(str(title)) != category:
            continue
        offer = make_offer(
            title=str(title),
            company=str(company),
            location=str(location),
            text=str(text),
            url=str(url).strip(),
            date=_row_value(row, "posted_date", "postedDate", "date", "posted_at", "postedAt"),
            source=source,
            category=category,
        )
        if not offer:
            continue
        # Ne republie pas les descriptions longues du fournisseur : le site ne
        # garde que les champs utiles et renvoie vers l'annonce d'origine.
        offer["notes"] = "Ouvre le lien de candidature pour vérifier les détails."
        remote_id = _row_value(row, "id", "job_id", "jobId")
        if remote_id:
            safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(remote_id))[:80]
            if safe_id:
                offer["id"] = f"{source.lower()}_{safe_id}"
        employment_type = _row_value(row, "employment_type", "employmentType", "type")
        salary = _row_value(row, "salary")
        extras = []
        if employment_type:
            extras.append("Type indiqué : " + str(employment_type))
        if salary:
            extras.append("Salaire indiqué : " + str(salary))
        if extras:
            offer["notes"] = (offer["notes"] + "\n" + " | ".join(extras)).strip()
        offers.append(offer)
    return offers


def fetch_joblet(cfg):
    """Recherche Joblet via son connecteur MCP public, sans clé ni scraping."""
    if not cfg.get("enabled", True):
        return []
    queries = cfg.get("queries") or []
    offers = []
    for query in queries:
        if not query.get("enabled", True) or not query.get("keywords"):
            continue
        category = query.get("category")
        if category not in TARGET_CATEGORIES:
            continue
        arguments = {
            "query": str(query["keywords"]),
            "location": str(query.get("location") or "Île-de-France, France"),
        }
        try:
            found = _fetch_mcp_search(
                JOBLET_MCP_URL,
                "search_jobs",
                arguments,
                "Joblet",
                category,
            )
            offers.extend(found)
            print(f"Joblet [{query.get('name', '?')}] : {len(found)} offres France/IDF pertinentes.")
        except Exception as exc:
            print(f"Joblet [{query.get('name', '?')}] : source ignorée ({type(exc).__name__}).")
        time.sleep(1)
    return offers


def workopia_access_token():
    """Échange un refresh token OAuth stocké dans les secrets GitHub."""
    client_id = os.environ.get("WORKOPIA_CLIENT_ID", "").strip()
    refresh_token = os.environ.get("WORKOPIA_REFRESH_TOKEN", "").strip()
    if not client_id or not refresh_token:
        print("Workopia ignoré : secrets OAuth WORKOPIA_CLIENT_ID / WORKOPIA_REFRESH_TOKEN absents.")
        return ""
    body = urlencode({
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }).encode("utf-8")
    request = Request(
        WORKOPIA_TOKEN_URL,
        data=body,
        headers={
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        token_data = http_json(request, timeout=30)
    except HTTPError as exc:
        print(f"Workopia : renouvellement OAuth refusé (HTTP {exc.code}).")
        return ""
    except (URLError, TimeoutError, ValueError) as exc:
        print(f"Workopia : renouvellement impossible ({type(exc).__name__}).")
        return ""
    access_token = str(token_data.get("access_token") or "").strip()
    new_refresh_token = str(token_data.get("refresh_token") or "").strip()
    if new_refresh_token and new_refresh_token != refresh_token:
        print("Workopia a renouvelé le jeton durable ; actualisez le secret GitHub WORKOPIA_REFRESH_TOKEN après cette collecte.")
    if not access_token:
        print("Workopia : réponse OAuth sans jeton d'accès.")
    return access_token


def fetch_workopia(cfg):
    """Recherche Workopia via MCP, avec OAuth conservé uniquement en mémoire."""
    if not cfg.get("enabled", True):
        return []
    token = workopia_access_token()
    if not token:
        return []
    queries = cfg.get("queries") or []
    offers = []
    for query in queries:
        if not query.get("enabled", True) or not query.get("keywords"):
            continue
        category = query.get("category")
        if category not in TARGET_CATEGORIES:
            continue
        arguments = {
            "action": "search",
            "search_jobs": {
                "job_title": str(query["keywords"]),
                "city": str(query.get("city") or "Paris, France"),
            },
        }
        try:
            found = _fetch_mcp_search(
                WORKOPIA_MCP_URL,
                "job_tool",
                arguments,
                "Workopia",
                category,
                token=token,
            )
            offers.extend(found)
            print(f"Workopia [{query.get('name', '?')}] : {len(found)} offres France/IDF pertinentes.")
        except Exception as exc:
            print(f"Workopia [{query.get('name', '?')}] : source ignorée ({type(exc).__name__}).")
        time.sleep(1)
    return offers


def fetch_adzuna(cfg):
    """Recherche généraliste Adzuna France (app_id/app_key dans les secrets)."""
    if not cfg.get("enabled", True):
        return []
    app_id = os.environ.get("ADZUNA_APP_ID", "").strip()
    app_key = os.environ.get("ADZUNA_APP_KEY", "").strip()
    if not app_id or not app_key:
        print("Adzuna ignoré : secrets ADZUNA_APP_ID / ADZUNA_APP_KEY absents.")
        return []

    queries = cfg.get("queries") or DEFAULT_ADZUNA_QUERIES
    country = quote(str(cfg.get("country") or "fr").strip().lower(), safe="")
    location = cfg.get("location") or "Paris"
    # Adzuna limite par défaut la recherche à 5 km ; le rayon configurable
    # couvre ici l'Île-de-France autour de Paris.
    distance = max(1, int(cfg.get("distance", 80)))
    per_page = min(max(int(cfg.get("resultsPerPage", 50)), 1), 50)
    max_pages = max(1, int(cfg.get("maxPages", 1)))
    # Quota gratuit Adzuna : 25 requêtes/min, 250/jour, 1 000/semaine, 2 500/mois.
    # 4 collectes par jour → au plus ~20 requêtes par collecte.
    budget = max(1, int(cfg.get("maxRequestsPerRun", 18)))
    used = 0
    title_supported = True
    offers = []

    # Recherches « priorite » (stockiste) à chaque collecte ; pour les autres, plus nombreuses que
    # les requêtes permises, le point de départ tourne d'une collecte à l'autre (toutes les 6 h),
    # pour que chaque recherche passe à son tour.
    queries = [q for q in queries if q.get("enabled", True) and q.get("keywords")]
    first = [q for q in queries if q.get("priorite")]
    rest = [q for q in queries if not q.get("priorite")]
    room = max(1, budget - len(first) * max_pages)
    if len(rest) > room:
        start = (int(time.time() // (6 * 3600)) * room) % len(rest)
        rest = rest[start:] + rest[:start]
    queries = first + rest

    for query in queries:
        if used >= budget:
            print(f"Adzuna : quota de la collecte atteint ({budget} requêtes), recherches suivantes reportées.")
            break
        results, api_count, pages = [], 0, 0
        # "titleOnly" : mots cherchés dans le titre seulement (sinon Adzuna les
        # trouve dans les descriptions et ramène des postes hors sujet).
        title_only = bool(query.get("titleOnly")) and title_supported
        for page in range(1, max_pages + 1):
            if used >= budget:
                break
            if title_only:
                search = {"title_only": query["keywords"]}
            elif query.get("phrase"):
                search = {"what_phrase": query["keywords"]}  # expression exacte
            else:
                search = {"what_or": query["keywords"]}  # métiers synonymes
            params = urlencode(
                {
                    "app_id": app_id,
                    "app_key": app_key,
                    "results_per_page": per_page,
                    **search,
                    "where": query.get("location") or location,
                    "distance": max(1, int(query.get("distance", distance))),
                    "max_days_old": int(query.get("maxDaysOld") or cfg.get("maxDaysOld", 60)),  # 15 j : stockistes
                    "sort_by": "date",
                    "content-type": "application/json",
                }
            )
            url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?{params}"
            used += 1
            try:
                data = api_json(url, f"Adzuna [{query.get('name', '?')}] page {page}")
            except HTTPError as exc:
                if exc.code == 400 and title_only and used < budget:
                    # Paramètre non reconnu : on retombe sur la recherche classique.
                    print(f"Adzuna [{query.get('name', '?')}] : recherche dans le titre refusée, repli.")
                    title_only = title_supported = False  # inutile de réessayer cette collecte
                    used += 1
                    try:
                        data = api_json(url.replace("title_only=", "what_or="),
                                        f"Adzuna [{query.get('name', '?')}] page {page}")
                    except Exception:
                        break
                else:
                    print(f"Adzuna [{query.get('name', '?')}] page {page} : requête ignorée (HTTP {exc.code}).")
                    break
            except Exception as exc:
                print(f"Adzuna [{query.get('name', '?')}] page {page} : requête ignorée ({type(exc).__name__}).")
                break
            page_results = data.get("results") or []
            api_count = int(data.get("count") or api_count or 0)
            results.extend(page_results)
            pages = page
            time.sleep(2.6)  # < 25 requêtes par minute
            if len(page_results) < per_page or len(results) >= api_count:
                break

        count = 0
        for job in results:
            location_data = job.get("location") or {}
            location_text = location_data.get("display_name") or ", ".join(
                location_data.get("area") or []
            )
            url = (job.get("redirect_url") or "").strip()
            offer = make_offer(
                title=job.get("title") or "",
                company=(job.get("company") or {}).get("display_name") or "",
                location=location_text,
                text=job.get("description") or "",
                url=url,
                date=job.get("created") or "",
                source="Adzuna",
                category=query.get("category"),
            )
            if not offer:
                continue
            offer["id"] = f"adz_{job.get('id') or stable_id(url)}"
            # Contrat structuré fourni par Adzuna quand le texte ne le dit pas.
            if offer["contract"] == "À vérifier":
                offer["contract"] = {"permanent": "CDI", "contract": "CDD"}.get(job.get("contract_type"), "À vérifier")
            extra = []
            # Valeurs Adzuna en anglais (permanent, part_time…) traduites pour la fiche.
            if job.get("contract_type"):
                kind = str(job["contract_type"])
                extra.append("Contrat indiqué : " + {"permanent": "CDI", "contract": "CDD ou mission"}.get(kind, kind))
            if job.get("contract_time"):
                hours = str(job["contract_time"])
                extra.append("Temps indiqué : " + {"full_time": "temps plein", "part_time": "temps partiel"}.get(hours, hours))
            if job.get("salary_min") or job.get("salary_max"):
                minimum = job.get("salary_min")
                maximum = job.get("salary_max")
                if minimum and maximum:
                    salary = f"{minimum}–{maximum}"
                else:
                    salary = str(minimum or maximum)
                extra.append("Salaire affiché par l’annonce : " + salary)
            if extra:
                offer["notes"] = (offer["notes"] + "\n" + " | ".join(extra)).strip()
            offers.append(offer)
            count += 1
        print(
            f"Adzuna [{query.get('name', '?')}] : {api_count} résultats dans l’API, "
            f"{len(results)} reçus ({pages} page(s)), {count} offres retenues après filtrage."
        )
        record_stats("Adzuna", query.get("name", "?"), api_count, len(results), count, pages)
    return offers


def fetch_greenhouse(cfg):
    """Récupère les offres publiques des tableaux d'employeurs configurés."""
    if not cfg.get("enabled", True):
        return []
    boards = [b for b in cfg.get("boards", []) if b.get("enabled", True) and b.get("token")]
    if not boards:
        print("Greenhouse ignoré : aucun tableau d’employeur configuré.")
        return []
    offers = []
    for board in boards:
        token = quote(str(board["token"]).strip(), safe="")
        name = board.get("name") or board["token"]
        try:
            data = api_json(
                f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true",
                f"Greenhouse [{name}]",
            )
        except Exception:
            continue
        count = 0
        for job in data.get("jobs", []):
            location = (job.get("location") or {}).get("name") or ""
            if not location and job.get("offices"):
                location = (job["offices"][0].get("location")
                            or job["offices"][0].get("name") or "")
            url = (job.get("absolute_url") or "").strip()
            offer = make_offer(
                title=job.get("title") or "",
                company=name,
                location=location,
                text=job.get("content") or "",
                url=url,
                date=job.get("first_published") or job.get("updated_at") or "",
                source="Greenhouse",
            )
            if offer:
                offer["id"] = f"gh_{token}_{job.get('id') or stable_id(url)}"
                offers.append(offer)
                count += 1
        print(f"Greenhouse [{name}] : {count} offres pertinentes.")
        time.sleep(0.5)
    return offers


def fetch_lever(cfg):
    """Récupère les offres publiées sur les sites Lever configurés."""
    if not cfg.get("enabled", True):
        return []
    sites = [s for s in cfg.get("sites", []) if s.get("enabled", True) and s.get("slug")]
    if not sites:
        print("Lever ignoré : aucun site d’employeur configuré.")
        return []
    offers = []
    for site in sites:
        slug = quote(str(site["slug"]).strip(), safe="")
        name = site.get("name") or site["slug"]
        host = "api.eu.lever.co" if str(site.get("region", "global")).lower() == "eu" else "api.lever.co"
        try:
            data = api_json(
                f"https://{host}/v0/postings/{slug}?mode=json&limit=100",
                f"Lever [{name}]",
            )
        except Exception:
            continue
        count = 0
        for job in data if isinstance(data, list) else []:
            categories = job.get("categories") or {}
            locations = categories.get("allLocations") or []
            if isinstance(locations, str):
                locations = [locations]
            location = categories.get("location") or ", ".join(locations)
            url = (job.get("hostedUrl") or job.get("applyUrl") or "").strip()
            description = job.get("descriptionPlain") or job.get("description") or ""
            offer = make_offer(
                title=job.get("text") or "",
                company=name,
                location=location,
                text=description,
                url=url,
                date=job.get("createdAt") or "",
                source="Lever",
            )
            # Lieu précis chez Lever : sans département d'Île-de-France reconnu, l'offre est à l'étranger
            # ou en province (« Crans-Montana », boutiques à l'étranger) : écartée.
            if offer and offer.get("dept") not in IDF_DEPTS:
                note_reject("employeur : hors Île-de-France", offer["title"])
                offer = None
            if offer:
                offer["id"] = f"lever_{slug}_{job.get('id') or stable_id(url)}"
                if categories.get("commitment"):
                    offer["notes"] += "\nType indiqué : " + str(categories["commitment"])
                offers.append(offer)
                count += 1
        print(f"Lever [{name}] : {count} offres pertinentes.")
        time.sleep(0.5)
    return offers


def fetch_smartrecruiters(cfg):
    """Recherche les offres publiques SmartRecruiters, puis charge leurs détails."""
    if not cfg.get("enabled", True):
        return []
    companies = [c for c in cfg.get("companies", [])
                 if c.get("enabled", True) and c.get("identifier")]
    if not companies:
        print("SmartRecruiters ignoré : aucune entreprise configurée.")
        return []
    max_postings = min(max(int(cfg.get("maxPostingsPerCompany", 500)), 1), 2000)
    max_details = min(max(int(cfg.get("maxDetailsPerCompany", 60)), 1), 200)
    offers = []
    for company_cfg in companies:
        identifier = quote(str(company_cfg["identifier"]).strip(), safe="")
        company_name = company_cfg.get("name") or company_cfg["identifier"]
        # Toutes les offres de la région, puis tri par métier sur le titre :
        # la recherche plein texte de SmartRecruiters exige tous les mots
        # (« vendeur vente boutique ») et rate « Conseiller de vente ».
        candidates = {}
        offset = 0
        while offset < max_postings:
            params = urlencode({
                "limit": 100,
                "offset": offset,
                # En majuscules (« FR »), l'API ne renvoie aucune offre.
                "country": str(cfg.get("country", "fr")).lower(),
                **({"region": cfg["region"]} if cfg.get("region") else {}),
            })
            try:
                data = api_json(
                    f"https://api.smartrecruiters.com/v1/companies/{identifier}/postings?{params}",
                    f"SmartRecruiters [{company_name}]",
                )
            except Exception:
                break
            page = data.get("content", [])
            for posting in page:
                posting_id = str(posting.get("id") or posting.get("uuid") or "")
                title = posting.get("name") or ""
                category = classify_category(title)
                if posting_id and category and not STAGE_RE.search(title):
                    candidates.setdefault(posting_id, (posting, category))
            offset += len(page)
            if len(page) < 100 or offset >= int(data.get("totalFound") or 0):
                break
            time.sleep(0.25)

        count = 0
        for posting_id, (posting, category) in list(candidates.items())[:max_details]:
            try:
                detail = api_json(
                    f"https://api.smartrecruiters.com/v1/companies/{identifier}/postings/{quote(posting_id, safe='')}",
                    f"SmartRecruiters [{company_name}/détail]",
                )
            except Exception:
                continue
            sections = ((detail.get("jobAd") or {}).get("sections") or {})
            description = "\n".join(
                f"<p>{section.get('title') or ''}</p>{section.get('text') or ''}"
                for section in sections.values()
                if isinstance(section, dict) and section.get("text")
            )
            location_data = detail.get("location") or posting.get("location") or {}
            location = ", ".join(
                str(location_data.get(key, ""))
                for key in ("city", "region", "country")
                if location_data.get(key)
            )
            url = (detail.get("applyUrl") or "").strip()
            offer = make_offer(
                title=detail.get("name") or posting.get("name") or "",
                company=(detail.get("company") or {}).get("name") or company_name,
                location=location,
                text=description,
                url=url,
                date=detail.get("releasedDate") or posting.get("releasedDate") or "",
                source="SmartRecruiters",
                category=category,
            )
            if offer:
                offer["id"] = f"sr_{identifier}_{posting_id}"
                employment = (detail.get("typeOfEmployment") or {}).get("label")
                if employment:
                    offer["notes"] += "\nType indiqué : " + str(employment)
                offers.append(offer)
                count += 1
            time.sleep(0.25)
        print(f"SmartRecruiters [{company_name}] : {offset} offres en IDF, {len(candidates)} du bon métier, "
              f"{count} retenues.")
        record_stats("SmartRecruiters", company_name, offset, len(candidates), count, 0)
        time.sleep(0.5)
    return offers


def fetch_ashby(cfg):
    """Récupère les offres listées sur les job boards Ashby configurés."""
    if not cfg.get("enabled", True):
        return []
    boards = [b for b in cfg.get("boards", [])
              if b.get("enabled", True) and b.get("name")]
    if not boards:
        print("Ashby ignoré : aucun tableau d’employeur configuré.")
        return []
    offers = []
    for board in boards:
        board_name = quote(str(board["name"]).strip(), safe="")
        company_name = board.get("company") or board["name"]
        try:
            data = api_json(
                f"https://api.ashbyhq.com/posting-api/job-board/{board_name}",
                f"Ashby [{company_name}]",
            )
        except Exception:
            continue
        count = 0
        for job in data.get("jobs", []):
            if job.get("isListed") is False:
                continue
            address = ((job.get("address") or {}).get("postalAddress") or {})
            location = job.get("location") or ", ".join(
                str(address.get(key, ""))
                for key in ("addressLocality", "addressRegion", "addressCountry")
                if address.get(key)
            )
            description = job.get("descriptionPlain") or job.get("descriptionHtml") or ""
            url = (job.get("jobUrl") or job.get("applyUrl") or "").strip()
            offer = make_offer(
                title=job.get("title") or "",
                company=company_name,
                location=location,
                text=description,
                url=url,
                date=job.get("publishedAt") or "",
                source="Ashby",
            )
            if offer:
                offer["id"] = f"ashby_{board_name}_{stable_id(url)}"
                if job.get("employmentType"):
                    offer["notes"] += "\nType indiqué : " + str(job["employmentType"])
                offers.append(offer)
                count += 1
        print(f"Ashby [{company_name}] : {count} offres pertinentes.")
        time.sleep(0.5)
    return offers


def child_text(node, names):
    for element in node.iter():
        tag = element.tag.rsplit("}", 1)[-1].lower()
        if tag in names and element.text and element.text.strip():
            return element.text.strip()
    return ""


def entry_link(node):
    for element in node.iter():
        if element.tag.rsplit("}", 1)[-1].lower() == "link":
            href = element.attrib.get("href")
            if href and element.attrib.get("rel", "alternate") == "alternate":
                return href.strip()
            if element.text and element.text.strip().startswith("http"):
                return element.text.strip()
    return ""


def fetch_feed(feed):
    req = Request(
        feed["url"],
        headers={
            "User-Agent": UA,
            "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml",
        },
    )
    with urlopen(req, timeout=25) as response:
        raw = response.read(8_000_000)

    root = ET.fromstring(raw)
    nodes = [
        node for node in root.iter()
        if node.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}
    ]
    results = []

    for node in nodes:
        title = child_text(node, {"title"})
        url = entry_link(node)
        summary = strip_html(
            child_text(node, {"description", "summary", "content", "encoded"})
        )
        offer = make_offer(
            title=title,
            company=child_text(node, {"author", "creator", "company", "employer"}),
            location="",
            text=summary,
            url=url,
            date=child_text(node, {"pubdate", "published", "updated", "date", "issued"}),
            source=feed.get("name", "Flux partenaire"),
        )
        if offer:
            results.append(offer)

    print(f"{feed.get('name', 'Flux RSS')} : {len(results)} offres pertinentes.")
    return results


def load_previous():
    """Charge l'historique. S'il est illisible, on s'arrête plutôt que de
    l'écraser avec les seules offres du jour."""
    if not OUT.exists():
        return []
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        raise SystemExit(
            f"ERREUR : {OUT.name} est illisible ({type(exc).__name__}). "
            "Collecte arrêtée sans rien écrire : restaure le fichier depuis l'historique Git."
        )
    if not isinstance(previous, list):
        raise SystemExit(
            f"ERREUR : {OUT.name} ne contient pas une liste d'offres. "
            "Collecte arrêtée sans rien écrire."
        )
    return [item for item in previous if isinstance(item, dict)]


def write_offers(offers):
    """Écriture atomique : un arrêt brutal ne laisse jamais un fichier tronqué."""
    tmp = OUT.with_name(OUT.name + ".tmp")
    tmp.write_text(json.dumps(offers, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, OUT)


def refresh_offer(offer):
    """Réapplique les règles actuelles à une offre déjà enregistrée.

    Renvoie la raison du retrait (texte) si l'offre sort du périmètre, sinon "".
    Les offres suivies par l'utilisateur ne sont jamais retirées.
    """
    title = offer.get("title") or ""
    notes = offer.get("notes") or ""
    tracked = is_tracked(offer)

    # Ancien format Jooble : la date de mise à jour était stockée comme date
    # de publication.
    if offer.get("source") == "Jooble" and "updated" not in offer:
        offer["updated"] = offer.get("date") or ""
        offer["date"] = ""

    contract = classify_contract(title, notes)
    if contract is None and not tracked:
        return "stage / alternance"
    if contract and offer.get("contract") in (None, "", "À vérifier"):
        offer["contract"] = contract

    dept = detect_dept(offer.get("location")) or detect_dept(title, postal=False)
    if offer.get("source") == "France Travail" and offer.get("dept") in IDF_DEPTS and dept in ("", "IDF"):
        dept = offer["dept"]  # département de la requête France Travail
    if dept == "HORS":
        if not tracked:
            return "hors Île-de-France"
        dept = ""
    if is_excluded_company(offer.get("company")) and not tracked:
        return "entreprise exclue"
    if is_school(title, offer.get("company")) and not tracked:
        return "école ou formation"
    if dept in EXCLUDED_DEPTS and not tracked:
        return "département exclu (" + dept + ")"
    offer["dept"] = dept

    if caces_required(title, notes) and not tracked:
        return "CACES obligatoire"
    category = classify_category(title)
    if category is None:
        if not tracked:
            return "métier non recherché"
    else:
        offer["category"] = category
    return ""


IDENTITY_FIELDS = ("title", "company", "location", "url")


def merge_into(match, item):
    """Complète une offre existante avec une version revue d'une autre source.

    - titre, entreprise, lieu et URL ne sont remplis que s'ils manquent (sinon
      les clés de déduplication changeraient d'une collecte à l'autre) ;
    - la date de publication d'origine est conservée ;
    - un contrat connu n'est jamais remplacé par « À vérifier » ;
    - les notes modifiées par l'utilisateur ne sont jamais écrasées.
    """
    linked = match.get("sources")
    if not isinstance(linked, list):
        linked = [match["source"]] if match.get("source") else []
    for source in [item.get("source")] + list(item.get("sources") or []):
        if source and source not in linked:
            linked.append(source)
    if linked:
        match["sources"] = linked

    seen = max(str(match.get("lastSeen") or ""), str(item.get("lastSeen") or ""))
    if seen:
        match["lastSeen"] = seen

    for field in IDENTITY_FIELDS:
        current = match.get(field)
        if item.get(field) and (not current or current in (PLACEHOLDER_COMPANY, PLACEHOLDER_LOCATION)):
            match[field] = item[field]
    # Lieu réduit au département (EURES) : la ville donnée par une autre source le précise.
    if (item.get("location") and dept_only(match) and not dept_only(item)
            and str(item.get("dept") or "") == str(match.get("dept") or "")):
        match["location"] = item["location"]
    for field in ("date", "updated", "created"):
        if item.get(field) and not match.get(field):
            match[field] = item[field]
    if field_newer(item.get("updated"), match.get("updated")):
        match["updated"] = item["updated"]
    if item.get("contract") and item["contract"] != "À vérifier":
        match["contract"] = item["contract"]
    elif not match.get("contract"):
        match["contract"] = item.get("contract") or "À vérifier"
    for field in ("dept", "category"):
        if item.get(field) and not match.get(field):
            match[field] = item[field]
    # Une source qui n'envoie qu'un extrait ne remplace pas une description plus complète.
    if (item.get("notes") and not match.get("notesEdited")
            and len(item["notes"]) >= 0.8 * len(match.get("notes") or "")):
        match["notes"] = item["notes"]
    # Le suivi utilisateur d'un doublon n'est jamais perdu.
    if is_tracked(item) and not is_tracked(match):
        match["status"] = item.get("status")
    for field in ("appliedDate", "notesEdited"):
        if item.get(field) and not match.get(field):
            match[field] = item[field]


def field_newer(candidate, current):
    a, b = parse_date(candidate), parse_date(current)
    if a is None or b is None:
        return False
    if a.tzinfo is None:
        a = a.replace(tzinfo=timezone.utc)
    if b.tzinfo is None:
        b = b.replace(tzinfo=timezone.utc)
    return a > b


def dedupe(offers):
    """Fusionne les doublons (URL ou poste + entreprise + ville). La première
    offre rencontrée est conservée et absorbe les informations des suivantes."""
    result, index = [], {}
    merged_count = 0
    for offer in offers:
        keys = lookup_keys(offer)
        match = next((index[k] for k in keys if k in index), None)
        if match is None:
            result.append(offer)
            match = offer
        else:
            merge_into(match, offer)
            merged_count += 1
        for key in offer_keys(offer) | index_keys(match):
            index.setdefault(key, match)
    return result, merged_count


def should_keep(offer, today):
    """Purge : publication trop ancienne ET plus revue depuis MAX_UNSEEN_DAYS."""
    # Ne jamais supprimer l'historique de candidature ni les modifications utilisateur.
    if is_tracked(offer):
        return True

    pub = parse_date(offer.get("date"))
    seen = parse_date(offer.get("lastSeen") or offer.get("collectedAt"))
    if pub is not None and (today - pub.date()).days > MAX_AGE_DAYS:
        if seen is not None and (today - seen.date()).days > MAX_UNSEEN_DAYS:
            return False
    if pub is None and seen is not None and (today - seen.date()).days > MAX_UNSEEN_DAYS:
        return False
    return True


def main():
    previous = load_previous()
    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc).isoformat()

    # Les offres déjà enregistrées sont revues avec les règles actuelles
    # (département, métier, stage, date Jooble), puis dédoublonnées.
    removed_by_rule = {}
    merged = []
    for item in previous:
        reason = refresh_offer(item)
        if reason:
            removed_by_rule[reason] = removed_by_rule.get(reason, 0) + 1
        else:
            merged.append(item)
    merged, merged_previous = dedupe(merged)

    index = {}
    for item in merged:
        for key in index_keys(item):
            index.setdefault(key, item)

    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    except (json.JSONDecodeError, OSError):
        config = {}

    errors = []
    fresh = []

    # Jooble : une requête par métier visé (configurable dans sources.json), dans la limite du quota.
    api_key = os.environ.get("JOOBLE_API_KEY", "").strip()
    JOOBLE_STATE["suite"] = previous_jooble_suite()
    JOOBLE_STATE["rendement"] = previous_jooble_yield()
    if not api_key:
        print("Jooble ignoré : secret JOOBLE_API_KEY absent.")
    else:
        fresh.extend(fetch_jooble_all(api_key, config, errors))

    # API France Travail (offre d'emploi v2), source officielle et autorisée.
    ft_cfg = config.get("franceTravail") or {}
    if ft_cfg.get("enabled", True):
        try:
            fresh.extend(fetch_francetravail(ft_cfg))
        except Exception as exc:
            errors.append({"source": "France Travail", "error": type(exc).__name__})

    # EURES : offres France Travail rediffusées sans clé (ignoré quand l'API France Travail est active).
    try:
        fresh.extend(fetch_eures(config.get("eures") or {}))
    except Exception as exc:
        errors.append({"source": "EURES", "error": type(exc).__name__})

    # API généraliste Adzuna ; nécessite deux secrets GitHub facultatifs.
    try:
        fresh.extend(fetch_adzuna(config.get("adzuna") or {}))
    except Exception as exc:
        errors.append({"source": "Adzuna", "error": type(exc).__name__})

    # Alertes e-mail HelloWork et Meteojob (pas d'API publique) lues dans Gmail.
    if (config.get("alertesMail") or {}).get("enabled", True):
        try:
            from alertes import fetch_alert_offers
            for raw in fetch_alert_offers(int((config.get("alertesMail") or {}).get("days", 4))):
                # Le département est donné par l'alerte : « Lagny-le-Sec (60) » est dans l'Oise,
                # même si le nom ressemble à une ville d'Île-de-France.
                given = re.search(r"\((\d{2}|2[AB])\)", raw["location"])
                if given and given.group(1) not in IDF_DEPTS:
                    continue
                text = " · ".join(x for x in (raw["contract"], raw["salary"]) if x)
                offer = make_offer(raw["title"], raw["company"], raw["location"],
                                   f"{text} — offre reçue par alerte {raw['source']}.",
                                   raw["url"], raw["date"], raw["source"])
                if offer:
                    fresh.append(offer)
        except Exception as exc:
            errors.append({"source": "Alertes e-mail", "error": type(exc).__name__})

    # Joblet est un connecteur MCP public en lecture seule, sans clé API.
    try:
        fresh.extend(fetch_joblet(config.get("joblet") or {}))
    except Exception as exc:
        errors.append({"source": "Joblet", "error": type(exc).__name__})

    # Workopia est un connecteur MCP OAuth ; ses jetons restent dans les secrets.
    try:
        fresh.extend(fetch_workopia(config.get("workopia") or {}))
    except Exception as exc:
        errors.append({"source": "Workopia", "error": type(exc).__name__})

    # Les quatre API ATS ci-dessous sont publiques en lecture, mais chaque
    # employeur doit avoir un identifiant de tableau configuré dans sources.json.
    for config_key, source_name, fetcher in (
        ("greenhouse", "Greenhouse", fetch_greenhouse),
        ("lever", "Lever", fetch_lever),
        ("smartRecruiters", "SmartRecruiters", fetch_smartrecruiters),
        ("ashby", "Ashby", fetch_ashby),
    ):
        try:
            fresh.extend(fetcher(config.get(config_key) or {}))
        except Exception as exc:
            errors.append({"source": source_name, "error": type(exc).__name__})

    # Flux RSS/Atom explicitement configurés et autorisés.
    feeds = config.get("feeds") or []
    for feed in feeds:
        if not feed.get("enabled") or not feed.get("url"):
            continue
        try:
            fresh.extend(fetch_feed(feed))
            time.sleep(1)
        except Exception as exc:
            errors.append(
                {"source": feed.get("name", "Flux RSS"), "error": type(exc).__name__}
            )

    # Fusion : déduplication par URL nettoyée puis par contenu ; les statuts
    # et dates de candidature existants sont toujours conservés.
    new_count = 0
    updated_count = 0
    new_items = []
    for item in fresh:
        item["collectedAt"] = now
        item["lastSeen"] = today.isoformat()
        keys = lookup_keys(item)
        match = next((index[k] for k in keys if k in index), None)
        if match is not None:
            updated_count += 1
            merge_into(match, item)
            match["collectedAt"] = now
        else:
            new_count += 1
            item.setdefault("created", today.isoformat())
            if item.get("source"):
                item.setdefault("sources", [item["source"]])
            merged.append(item)
            new_items.append(item)
            match = item
        # Index recalculé : les variantes déjà vues pointent vers la même offre.
        for key in offer_keys(item) | index_keys(match):
            index.setdefault(key, match)

    kept = [item for item in merged if should_keep(item, today)]
    removed = len(merged) - len(kept)

    if previous and not kept:
        raise SystemExit(
            "ERREUR : le résultat serait vide alors que l'historique contenait "
            f"{len(previous)} offres. Collecte arrêtée sans rien écrire."
        )

    def sort_key(offer):
        parsed = parse_date(offer.get("date") or offer.get("updated"))
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            pub_ts = parsed.timestamp()
        else:
            pub_ts = 0
        return (pub_ts, offer.get("collectedAt", ""))

    offers = sorted(kept, key=sort_key, reverse=True)
    travel_cfg = config.get("trajets") or {}
    try:
        add_travel_info(offers, travel_cfg)
    except Exception as exc:  # un problème de trajets ne bloque jamais la collecte
        print(f"Trajets ignorés ({type(exc).__name__}).")

    # Trop loin du domicile : retirée, sauf offre suivie ou lieu inconnu.
    max_km = travel_cfg.get("distanceMaxKm")
    if max_km:
        too_far = [o for o in offers
                   if isinstance(o.get("km"), (int, float)) and o["km"] > max_km and not is_tracked(o)]
        if too_far:
            # Comparaison par identité (et non par contenu) : linéaire au lieu de quadratique.
            gone = {id(o) for o in too_far}
            offers = [o for o in offers if id(o) not in gone]
            removed_by_rule[f"à plus de {max_km} km"] = len(too_far)

    def published_days(offer):
        pub = parse_date(offer.get("date") or offer.get("updated"))
        if pub is None:
            return None
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - pub).days

    too_old = [o for o in offers
               if (published_days(o) or 0) > max_publication_days(o.get("title")) and not is_tracked(o)]
    if too_old:
        gone = {id(o) for o in too_old}
        offers = [o for o in offers if id(o) not in gone]
        removed_by_rule[f"publiées il y a plus de {MAX_PUBLICATION_DAYS} jours "
                        f"({MAX_STOCKISTE_DAYS} pour les stockistes)"] = len(too_old)

    # Rendement Jooble : offres nouvelles réellement gardées, par recherche.
    final = {id(o) for o in offers}
    new_by_query = {}
    for item in new_items:
        if id(item) in final and item.get("_q"):
            new_by_query[item["_q"]] = new_by_query.get(item["_q"], 0) + 1
    update_jooble_yield(new_by_query, today)
    for item in merged:
        item.pop("_q", None)

    write_offers(offers)
    save_pending_alert([item for item in new_items if item in offers])
    write_stats(offers, new_count, removed_by_rule, now)

    print(f"Offres conservées : {len(offers)} (nouvelles : {new_count}, mises à jour : {updated_count})")
    print(f"Offres purgées (obsolètes) : {removed}")
    for reason, count in sorted(removed_by_rule.items()):
        print(f"Offres retirées ({reason}) : {count}")
    print(f"Doublons fusionnés dans l'historique : {merged_previous}")
    print(f"Flux RSS activés : {sum(bool(f.get('enabled')) for f in feeds)}")
    if errors:
        print("Sources en erreur : " + json.dumps(errors, ensure_ascii=False))
    if not fresh:
        # Échec visible dans GitHub Actions (et notification par e-mail).
        raise SystemExit("ERREUR : aucune source n'a renvoyé d'offre lors de cette collecte.")


STATS_FILE = ROOT / "stats.json"


def write_stats(offers, new_count, removed_by_rule, now):
    """Bilan de la collecte : volume par recherche et offres finales par source."""
    by_source = {}
    for offer in offers:
        by_source[offer.get("source") or "?"] = by_source.get(offer.get("source") or "?", 0) + 1
    STATS_FILE.write_text(json.dumps({
        "collecte": now,
        "offres_finales": len(offers),
        "nouvelles": new_count,
        "offres_finales_par_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "retirees": removed_by_rule,
        # Annonces reçues puis écartées, par raison, avec leurs titres les plus fréquents.
        "rejets": {
            reason: {
                "nombre": sum(titles.values()),
                "exemples": [f"{t} (×{n})" if n > 1 else t
                             for t, n in sorted(titles.items(), key=lambda kv: -kv[1])[:REJECT_EXAMPLES]],
            }
            for reason, titles in sorted(REJECTS.items(), key=lambda kv: -sum(kv[1].values()))
        },
        "recherches": SOURCE_STATS,
        "joobleSuite": JOOBLE_STATE["suite"],  # reprise des recherches Jooble à la collecte suivante
        "joobleRendement": JOOBLE_STATE["rendement"],
    }, ensure_ascii=False, indent=1), encoding="utf-8")


PLACES_FILE = ROOT / "lieux.json"  # cache des positions et trajets, commité avec les offres
GEOCODE_URL = "https://data.geopf.fr/geocodage/search"
PRIM_JOURNEYS_URL = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys"
TRAVEL_REFRESH_DAYS = 30
TRAVEL_MAX_PER_RUN = 60  # le reste est calculé aux collectes suivantes
TRAVEL_PAUSE = 4.5  # PRIM accepte environ 15 calculs par minute
ARROND_RE = re.compile(r"\b(\d{1,2})\s*(?:e|er|ème|eme)\b", re.I)


def place_query(location, dept=""):
    """Commune (et code postal pour un arrondissement de Paris) d'un libellé libre.
    « Hauts-de-Seine, Ile-de-France » ne donne rien : seul le département est connu."""
    raw = (location or "").strip()
    if not raw or raw == PLACEHOLDER_LOCATION:
        return None
    first = re.split(r"[,(]", raw, maxsplit=1)[0].strip()
    postcode = (re.search(r"\b(\d{5})\b", raw) or [None, None])[1]
    in_paris = dept in ("75", "") and (
        slug(first).startswith("paris") or (slug(first)[:1].isdigit() and "paris" in slug(raw))
    )
    if in_paris:
        m = ARROND_RE.search(raw)
        if m and 1 <= int(m.group(1)) <= 20:
            n = int(m.group(1))
            return (f"Paris {n}{'er' if n == 1 else 'e'} Arrondissement", f"750{n:02d}")
        return ("Paris", None)
    city = re.sub(r"\b\d{5}\b", " ", first).strip(" -")
    if not city or slug(city) in {slug(p) for p in DEPT_NAMES_ONLY}:
        return None
    return (city, postcode)


DEPT_NAMES_ONLY = ["seine-et-marne", "yvelines", "essonne", "hauts-de-seine", "seine-saint-denis",
                   "val-de-marne", "val-d'oise", "ile-de-france", "île-de-france"]


PLACE_ALIASES = {  # lieux qui ne sont pas des communes
    "la-defense": ("Puteaux", "92800"), "paris-la-defense": ("Puteaux", "92800"),
    "charles-de-gaulle-aeroport": ("Roissy-en-France", "95700"),
    "charles-de-gaulles-aeroport": ("Roissy-en-France", "95700"),
    "aeroport-charles-de-gaulle": ("Roissy-en-France", "95700"),
    "orly-aeroport": ("Orly", "94310"),
}


def geocode(city, postcode, dept):
    """Coordonnées d'une commune via le service public de géocodage (sans clé).
    Un code postal faux (« Vauhallan, 89160 ») est ignoré au second essai."""
    city, postcode = PLACE_ALIASES.get(slug(city), (city, postcode))
    for code in ([postcode, None] if postcode else [None]):
        params = {"q": city, "type": "municipality", "limit": 5}
        if code:
            params["postcode"] = code
        data = http_json(Request(f"{GEOCODE_URL}?{urlencode(params)}", headers={"User-Agent": UA}), timeout=15)
        found = _pick_place(data, city, dept)
        if found:
            return found
    return None


def _pick_place(data, city, dept):
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        code = str(props.get("postcode") or props.get("citycode") or "")
        # Homonymes : on garde la commune du bon département quand il est connu,
        # sinon une commune d'Île-de-France.
        if dept in IDF_DEPTS and not code.startswith(dept):
            continue
        if dept not in IDF_DEPTS and code[:2] not in IDF_DEPTS:
            continue
        lon, lat = feature["geometry"]["coordinates"]
        return {"lat": round(lat, 5), "lon": round(lon, 5), "label": props.get("label", city),
                "dept": code[:2]}
    return None


def distance_km(a, b):
    from math import radians, sin, cos, asin, sqrt
    dlat, dlon = radians(b["lat"] - a["lat"]), radians(b["lon"] - a["lon"])
    h = sin(dlat / 2) ** 2 + cos(radians(a["lat"])) * cos(radians(b["lat"])) * sin(dlon / 2) ** 2
    return round(2 * 6371 * asin(sqrt(h)), 1)


def transit_minutes(origin, place, api_key):
    """Durée en transports (calculateur Île-de-France Mobilités), un mardi à 8 h 30."""
    from datetime import timedelta
    day = datetime.now(timezone.utc).date()
    day += timedelta(days=(1 - day.weekday()) % 7 or 7)  # prochain mardi
    params = urlencode({
        "from": f"{origin['lon']};{origin['lat']}",
        "to": f"{place['lon']};{place['lat']}",
        "datetime": day.strftime("%Y%m%d") + "T083000",
    })
    data = http_json(Request(f"{PRIM_JOURNEYS_URL}?{params}",
                             headers={"User-Agent": UA, "apikey": api_key, "Accept": "application/json"}),
                     timeout=20)
    durations = [j.get("duration") for j in data.get("journeys", []) if j.get("duration")]
    return round(min(durations) / 60) if durations else None


def transit_minutes_retry(origin, place, api_key):
    """Une seconde tentative après une pause si PRIM limite le débit (HTTP 429)."""
    try:
        return transit_minutes(origin, place, api_key)
    except HTTPError as exc:
        if exc.code != 429:
            raise
        time.sleep(60)  # la limite de PRIM est comptée par minute
        return transit_minutes(origin, place, api_key)


def add_travel_info(offers, cfg):
    """Ajoute à chaque offre la distance depuis le domicile (km) et, si le secret
    PRIM_API_KEY est configuré, le temps de trajet en transports (min)."""
    if not cfg.get("enabled", True):
        return
    origin = cfg.get("origine") or {"lat": 48.903653, "lon": 2.48526}
    try:
        cache = json.loads(PLACES_FILE.read_text(encoding="utf-8")) if PLACES_FILE.exists() else {}
    except (json.JSONDecodeError, OSError):
        cache = {}
    api_key = os.environ.get("PRIM_API_KEY", "").strip()
    today = datetime.now(timezone.utc).date()
    geocoded = timed = no_route = 0
    used = set()
    for offer in offers:
        query = place_query(offer.get("location"), offer.get("dept") or "")
        if not query:
            continue
        key = "|".join([query[0].lower(), query[1] or "", offer.get("dept") or ""])
        used.add(key)
        place = cache.get(key)
        if place is None:
            try:
                place = geocode(query[0], query[1], offer.get("dept") or "") or {}
            except (HTTPError, URLError, TimeoutError, ValueError):
                continue  # réessayé à la prochaine collecte
            if place:
                place["km"] = distance_km(origin, place)
            cache[key] = place
            geocoded += 1
            time.sleep(0.05)
        if not place:
            continue
        stale = not place.get("minAt") or (today - datetime.fromisoformat(place["minAt"]).date()).days > TRAVEL_REFRESH_DAYS
        if api_key and stale and timed < TRAVEL_MAX_PER_RUN:
            try:
                minutes = transit_minutes_retry(origin, place, api_key)
                place["min"], place["minAt"] = minutes, today.isoformat()
                timed += 1
                time.sleep(TRAVEL_PAUSE)
            except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                code = getattr(exc, "code", "")
                if code in (400, 404):
                    # Pas d'itinéraire pour ce lieu (point hors réseau ou mal placé) : on note
                    # l'essai (réessayé dans TRAVEL_REFRESH_DAYS jours) et on passe au suivant.
                    # Avant, cette seule erreur arrêtait le calcul pour toutes les autres offres.
                    place["min"], place["minAt"] = None, today.isoformat()
                    timed += 1
                    no_route += 1
                    time.sleep(TRAVEL_PAUSE)
                else:
                    print(f"Trajet non calculé ({type(exc).__name__} {code}).".replace(" )", ")"))
                    api_key = ""  # quota ou clé refusée : on reprendra à la prochaine collecte
        offer["km"] = place.get("km")
        if offer.get("dept") in ("", "IDF", None) and place.get("dept") in IDF_DEPTS:
            offer["dept"] = place["dept"]  # « Maulette, IDF » → 78
        if place.get("min") is not None:
            offer["trajetMin"] = place["min"]
        else:
            offer.pop("trajetMin", None)  # ancienne valeur d'un lieu mal situé
    # Seuls les lieux des offres actuelles sont gardés : le cache ne grossit pas indéfiniment.
    cache = {k: v for k, v in cache.items() if k in used}
    PLACES_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"Trajets : {geocoded} lieu(x) géolocalisé(s), {timed - no_route} temps de trajet calculé(s), "
          f"{no_route} lieu(x) sans itinéraire"
          + ("" if os.environ.get("PRIM_API_KEY") else " (secret PRIM_API_KEY absent : distance seulement)."))


ALERT_FILE = ROOT / ".alerte.json"  # jamais commité : le workflow n'ajoute que offres.json
ALERT_MAX = 5
NEAR_10E_RE = re.compile(r"(^|[\s,(])(pantin|aubervilliers|saint-denis)\b", re.I)
ARRONDISSEMENTS_RE = re.compile(r"(^|\D)(2|9|10|11|19)\s*(e|er|ème|eme)\b", re.I)


def alert_priority(offer):
    """Même logique que le score du site : Paris 10e et alentours, Paris, 93,
    reste de l'Île-de-France, puis le type de contrat."""
    location = offer.get("location") or ""
    dept = offer.get("dept") or ""
    if (dept == "75" and ARRONDISSEMENTS_RE.search(location)) or NEAR_10E_RE.search(location):
        score = 40
    elif dept == "75":
        score = 30
    elif dept == "93":
        score = 20
    else:
        score = 10 if dept else 5
    return score + {"CDI": 15, "CDD": 10, "Intérim": 8}.get(offer.get("contract"), 4)


# Mêmes règles que le masquage du site (pilot.js) : types de postes masqués par
# défaut et trajet de plus de 60 min hors Paris et 93. L'alerte ne compte que
# les offres qui resteront visibles.
ALERT_HIDDEN_TITLE_RE = re.compile(
    r"luxe|luxury|bijou|joaill|horlog|maroquin"
    r"|bouch|charcut|poisson|fromag|traiteur|cr[eè]merie|boulangerie|p[aâ]tiss|viennois|\bcoupe\b"
    r"|cosm[eé]t|parfum|beaut[eé]|animal|automobile|v[eé]hicule|pneu|\bauto\b"
    r"|cariste|caces|chariot|week.?end|samedi|dimanche|[eé]tudiant|caiss"
    r"|directeur|directrice|\bdirection\b|head of",
    re.I,
)
ALERT_MAX_TRAJET = 60
ALERT_ZONES_TOUJOURS = {"75", "93"}


# L'alerte ntfy est celle du profil de Ryan : ses métiers (logistique et onglets voisins).
ALERT_CATEGORIES = {"stock", "preparation", "aeroport", "tri", "encadrement"}


def alert_visible(offer):
    if offer.get("category") not in ALERT_CATEGORIES:
        return False
    if ALERT_HIDDEN_TITLE_RE.search(offer.get("title") or ""):
        return False
    if offer.get("dept") in ALERT_ZONES_TOUJOURS:
        return True
    minutes = offer.get("trajetMin")
    if not isinstance(minutes, (int, float)) and isinstance(offer.get("km"), (int, float)):
        minutes = offer["km"] * 3
    return not (isinstance(minutes, (int, float)) and minutes > ALERT_MAX_TRAJET)


def alert_enabled():
    """Alerte des nouvelles offres en pause si "alerteNouvellesOffres": {"enabled": false}
    dans sources.json. Les alertes de réponses d'entreprise (mail.py) ne changent pas."""
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    except (json.JSONDecodeError, OSError):
        config = {}
    return (config.get("alerteNouvellesOffres") or {}).get("enabled", True)


def save_pending_alert(new_items):
    """Prépare l'alerte des meilleures nouvelles offres ; elle est envoyée par
    `python collect.py --alerte` une fois le site mis à jour."""
    if not alert_enabled():
        ALERT_FILE.unlink(missing_ok=True)
        return
    new_items = [o for o in new_items if alert_visible(o)]
    if not new_items:
        ALERT_FILE.unlink(missing_ok=True)
        return
    best = sorted(new_items, key=alert_priority, reverse=True)[:ALERT_MAX]
    ALERT_FILE.write_text(json.dumps({
        "count": len(new_items),
        "offers": [
            {k: o.get(k, "") for k in ("title", "company", "location", "contract")}
            for o in best
        ],
    }, ensure_ascii=False), encoding="utf-8")


def send_alert():
    """Notification ntfy (appli gratuite) : sujet lu dans le secret NTFY_TOPIC.
    Une alerte qui échoue ne fait jamais échouer la collecte."""
    if not alert_enabled():
        ALERT_FILE.unlink(missing_ok=True)
        print("Alerte des nouvelles offres en pause (sources.json).")
        return
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not ALERT_FILE.exists():
        print("Alerte : rien à envoyer." if topic else "Alerte ignorée : secret NTFY_TOPIC absent.")
        return
    data = json.loads(ALERT_FILE.read_text(encoding="utf-8"))
    count = data.get("count", 0)
    lines = []
    for o in data.get("offers", []):
        place = re.split(r"[,(]", o.get("location") or "", maxsplit=1)[0].strip()
        # Les valeurs inconnues (« Entreprise à vérifier », « À vérifier ») sont omises.
        company = "" if o.get("company") == PLACEHOLDER_COMPANY else o.get("company")
        contract = "" if o.get("contract") == "À vérifier" else o.get("contract")
        place = "" if place == PLACEHOLDER_LOCATION else place
        details = " · ".join(x for x in (company, place, contract) if x)
        lines.append(f"• {o.get('title')} — {details}")
    if count > len(lines):
        lines.append(f"… et {count - len(lines)} autre(s).")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    owner, _, name = repo.partition("/")
    payload = {
        "topic": topic,
        "title": f"ZCRT : {count} nouvelle(s) offre(s)",
        "message": "\n".join(lines),
        "tags": ["briefcase"],
    }
    if owner and name:
        payload["click"] = f"https://{owner}.github.io/{name}/#trier"
    request = Request(
        "https://ntfy.sh/",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20):
            pass
        print(f"Alerte envoyée ({count} nouvelle(s) offre(s)).")
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"Alerte non envoyée ({type(exc).__name__}).")


if __name__ == "__main__":
    import sys
    if "--alerte" in sys.argv:
        send_alert()
    else:
        main()
