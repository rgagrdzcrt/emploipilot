
#!/usr/bin/env python3
"""EmploiPilot : collecte Jooble, API France Travail et flux RSS/Atom autorisés.

- Aucune candidature automatique : ce script ne fait que collecter et organiser.
- Les clés API restent dans les secrets GitHub Actions (jamais imprimées ici).
"""
import os
import re
import json
import html
import time
import hashlib
import unicodedata
from datetime import datetime, timezone
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
MAX_UNSEEN_DAYS = 30

STAGE_RE = re.compile(
    r"\b(stage|stagiaire|alternance|alternant|apprentissage|apprenti)\b", re.I
)
INTERIM_RE = re.compile(r"\b(int[eé]rim|int[eé]rimaire|mission temporaire)\b", re.I)
CDI_RE = re.compile(r"\b(CDI|contrat [àa] dur[eé]e ind[eé]termin[eé]e)\b", re.I)
CDD_RE = re.compile(r"\b(CDD|contrat [àa] dur[eé]e d[eé]termin[eé]e)\b", re.I)

CATEGORIES = {"stock", "rayon", "vente"}

# Requêtes Jooble par défaut : une par métier visé pour améliorer la couverture
# (personnalisables via "joobleQueries" dans sources.json).
DEFAULT_JOOBLE_QUERIES = [
    {
        "name": "stock-logistique",
        "enabled": True,
        "category": "stock",
        "keywords": "magasinier, stockiste, gestionnaire de stock, logistique, "
        "préparateur de commandes, approvisionnement",
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
FT_SEARCH_URL = "https://api.francetravail.io/v2/offres/search"
FT_SCOPE = "api_offresdemploiv2 o2dsoffre"
DEFAULT_FT_QUERIES = [
    {
        "name": "stock-logistique",
        "category": "stock",
        "keywords": "magasinier, gestionnaire de stock, logistique, préparateur de commandes",
    },
    {
        "name": "rayon",
        "category": "rayon",
        "keywords": "mise en rayon, employé libre-service, rayoniste",
    },
    {
        "name": "vente",
        "category": "vente",
        "keywords": "vendeur, conseiller de vente, prêt-à-porter",
    },
]
FT_CONTRACTS = {"CDI": "CDI", "CDD": "CDD", "MIS": "Intérim"}

# Adzuna fournit une recherche nationale généraliste. Les identifiants ne sont
# lus que dans les secrets de GitHub Actions (jamais dans sources.json).
DEFAULT_ADZUNA_QUERIES = [
    {
        "name": "stock-logistique",
        "category": "stock",
        "keywords": "magasinier stockiste gestionnaire stock logistique préparateur commandes approvisionnement",
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

DEFAULT_SMARTRECRUITERS_QUERIES = [
    {"name": "stock-logistique", "category": "stock", "keywords": "magasinier logistique stock"},
    {"name": "rayon", "category": "rayon", "keywords": "employé rayon libre-service"},
    {"name": "vente", "category": "vente", "keywords": "vendeur vente boutique"},
]

# Villes connues pour déduire le département depuis un libellé de lieu libre.
# Sert aussi au front via le champ "dept" stocké sur chaque offre.
DEPT_CITIES = {
    "75": ["paris"],
    "77": ["meaux", "melun", "torcy", "chelles", "chessy", "bussy", "marne-la-vallée",
           "lagny", "coulommiers", "provins", "fontainebleau", "dammarie"],
    "78": ["versailles", "saint-quentin-en-yvelines", "mantes", "poissy", "sartrouville",
           "plasir", "rambouillet", "trappes", "guyancourt", "chatou", "houilles",
           "conflans", "achères", "andresy", "le chesnay"],
    "91": ["evry", "massy", "palaiseau", "longjumeau", "draveil", "ris-orangis",
           "savigny-sur-orge", "athis-mons", "juvisy", "bretigny",
           "sainte-genevieve-des-bois", "gif-sur-yvette", "orsay", "bondoufle"],
    "92": ["nanterre", "courbevoie", "boulogne-billancourt", "puteaux", "asnières",
           "colombes", "levallois", "neuilly-sur-seine", "clichy", "montrouge",
           "antony", "gennevilliers", "issy-les-moulineaux", "clamart", "suresnes",
           "rueil", "bagneux", "malakoff", "chatenay-malabry", "villeneuve-la-garenne"],
    "93": ["bondy", "saint-denis", "montreuil", "pantin", "aubervilliers", "bobigny",
           "noisy-le-sec", "romainville", "rosny-sous-bois", "aulnay", "drancy",
           "bagnolet", "pierrefitte", "saint-ouen", "l'île-saint-denis",
           "fontenay-sous-bois", "villemomble", "gagny", "blanc-mesnil", "livry-gargan",
           "neuilly-sur-marne", "neuilly-plaisance", "clichy-sous-bois", "coubron",
           "vaujours", "sevran", "le pré-saint-gervais", "noisy-le-grand",
           "montfermeil", "stains", "pierrefitte-sur-seine"],
    "94": ["créteil", "vincennes", "ivry", "vitry", "villejuif", "joinville",
           "nogent-sur-marne", "le perreux", "champigny", "maisons-alfort",
           "saint-maur", "le kremlin-bicêtre", "fontenay-sous-bois", "bonneuil",
           "limeil", "saint-mandé", "chennevières", "villeneuve-le-roi",
           "villeneuve-saint-georges", "choisy-le-roi", "thiais", "chevilly"],
    "95": ["argenteuil", "cergy", "pontoise", "sarcelles", "garges", "enghien",
           "montmorency", "eaubonne", "franconville", "ermont", "goussainville",
           "villiers-le-bel", "montigny-lès-cormeilles", "herblay", "taverny"],
}


def strip_html(value):
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


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
    if parsed.query:
        key += "?" + parsed.query
    return key.rstrip("/")


def content_key(title, company, location):
    """Clé de déduplication sur le contenu : poste + entreprise + lieu normalisés."""
    return "|".join((norm_text(title), norm_text(company), norm_text(location)))


def offer_keys(offer):
    keys = {url_key(offer.get("url"))}
    keys.add(content_key(offer.get("title"), offer.get("company"), offer.get("location")))
    return {k for k in keys if k}


def detect_dept(text):
    """Déduit un département d'Île-de-France depuis un libellé libre."""
    raw = (text or "").strip()
    if not raw:
        return ""
    m = re.search(r"\b(7[5-8]|9[1-5])\b", raw)
    if m:
        return m.group(1)
    t = norm_text(raw)
    for dept, cities in DEPT_CITIES.items():
        if any(norm_text(city) in t for city in cities):
            return dept
    if "iledefrance" in t or t == "idf" or "idf" in t:
        return "IDF"
    return ""


def classify_contract(text):
    if STAGE_RE.search(text):
        return None
    if INTERIM_RE.search(text):
        return "Intérim"
    if CDI_RE.search(text):
        return "CDI"
    if CDD_RE.search(text):
        return "CDD"
    return "À vérifier"


def classify_category(text):
    t = text.lower()
    if re.search(
        r"vendeur|vendeuse|vente|boutique|pr[eê]t[- ]?[àa][- ]?porter|conseiller de vente",
        t,
    ):
        return "vente"
    if re.search(
        r"mise en rayon|employ[eé].{0,12}rayon|libre.?service|r[eé]assort|grande distribution",
        t,
    ):
        return "rayon"
    if re.search(
        r"stock|logistique|magasinier|pr[eé]parateur de commandes|approvision|stockiste",
        t,
    ):
        return "stock"
    return None


def stable_id(url):
    return hashlib.sha256(url.split("#", 1)[0].rstrip("/").encode()).hexdigest()[:16]


def make_offer(title, company, location, text, url, date, source, category=None):
    if not title or not url or urlparse(url).scheme not in {"http", "https"}:
        return None

    full_text = f"{title} {text}"
    contract = classify_contract(full_text)
    category = category if category in CATEGORIES else classify_category(full_text)

    # On exclut les stages/alternances et les offres hors catégories recherchées.
    if contract is None or category is None:
        return None

    parsed_date = parse_date(date)
    dept = detect_dept(location) or detect_dept(title)

    return {
        "id": f"{source.lower().replace(' ', '-')}_{stable_id(url)}",
        "title": strip_html(title),
        "company": strip_html(company) or "Entreprise à vérifier",
        "location": strip_html(location) or "Lieu à vérifier dans l’annonce",
        "dept": dept,
        "contract": contract,
        "category": category,
        "date": parsed_date.isoformat() if parsed_date else "",
        "url": url,
        "notes": strip_html(text)[:1200]
        or "Ouvre l’annonce pour vérifier les détails.",
        "status": "À examiner",
        "source": source,
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "demo": False,
    }


def http_json(request, timeout=35):
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_jooble(api_key, query):
    endpoint = f"https://fr.jooble.org/api/{api_key}"
    payload = {
        "keywords": query.get("keywords", ""),
        "location": query.get("location", "Île-de-France"),
        "radius": str(query.get("radius", "80")),
        "page": "1",
        "ResultOnPage": "50",
        "companysearch": False,
    }
    req = Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "User-Agent": UA,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        data = http_json(req)
    except HTTPError as exc:
        # Ne jamais afficher l'URL complète : elle contient la clé API.
        print(f"Jooble [{query.get('name')}] : erreur HTTP {exc.code}.")
        raise
    except (URLError, TimeoutError, ValueError) as exc:
        print(
            f"Jooble [{query.get('name')}] : erreur de connexion ou réponse invalide "
            f"({type(exc).__name__})."
        )
        raise

    offers = []
    for job in data.get("jobs", []):
        url = (job.get("link") or "").strip()
        text = job.get("snippet") or ""
        title = job.get("title") or ""
        offer = make_offer(
            title=title,
            company=job.get("company") or "",
            location=job.get("location") or "",
            text=text,
            url=url,
            date=job.get("updated") or "",
            source="Jooble",
            category=query.get("category"),
        )
        if offer:
            # Le type et la rémunération sont utiles pour examiner l'annonce.
            extra = []
            if job.get("type"):
                extra.append("Type indiqué : " + str(job["type"]))
            if job.get("salary"):
                extra.append("Salaire indiqué : " + str(job["salary"]))
            if extra:
                offer["notes"] = (offer["notes"] + "\n" + " | ".join(extra)).strip()
            offers.append(offer)

    print(f"Jooble [{query.get('name')}] : {len(offers)} offres pertinentes après filtrage.")
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
    queries = ft_cfg.get("queries") or DEFAULT_FT_QUERIES
    offers = []

    for dept in departements:
        for query in queries:
            if not query.get("enabled", True):
                continue
            params = urlencode(
                {
                    "motsCles": query.get("keywords", ""),
                    "departement": dept,
                    "range": f"0-{50 - 1}",
                }
            )
            req = Request(
                f"{FT_SEARCH_URL}?{params}",
                headers={
                    "User-Agent": UA,
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
            label = f"{query.get('name')} / {dept}"
            try:
                data = http_json(req, timeout=25)
            except HTTPError as exc:
                print(f"France Travail [{label}] : erreur HTTP {exc.code}.")
                raise
            except (URLError, TimeoutError, ValueError) as exc:
                print(f"France Travail [{label}] : erreur ({type(exc).__name__}).")
                raise

            count = 0
            for job in data.get("resultats", []):
                url = ((job.get("origineOffre") or {}).get("urlOrigine") or "").strip()
                contract = FT_CONTRACTS.get(job.get("typeContrat", ""), "À vérifier")
                parsed_date = parse_date(job.get("dateCreation") or "")
                location = (job.get("lieuTravail") or {}).get("libelle") or ""
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
            print(f"France Travail [{label}] : {count} offres pertinentes.")
            time.sleep(1)

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
        if classify_category(f"{title} {text}") != category:
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
        if category not in CATEGORIES:
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
        if category not in CATEGORIES:
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
    offers = []

    for query in queries:
        if not query.get("enabled", True) or not query.get("keywords"):
            continue
        params = urlencode(
            {
                "app_id": app_id,
                "app_key": app_key,
                "results_per_page": per_page,
                # Les termes d'une même requête sont des métiers synonymes :
                # what_or évite de demander qu'ils apparaissent tous ensemble.
                "what_or": query["keywords"],
                "where": query.get("location") or location,
                "distance": max(1, int(query.get("distance", distance))),
                "sort_by": "date",
                "content-type": "application/json",
            }
        )
        url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1?{params}"
        try:
            data = api_json(url, f"Adzuna [{query.get('name', '?')}]")
        except Exception as exc:
            print(f"Adzuna [{query.get('name', '?')}] : requête ignorée ({type(exc).__name__}).")
            continue

        results = data.get("results") or []
        api_count = data.get("count", len(results))
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
            extra = []
            if job.get("contract_type"):
                extra.append("Contrat indiqué : " + str(job["contract_type"]))
            if job.get("contract_time"):
                extra.append("Temps indiqué : " + str(job["contract_time"]))
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
            f"{len(results)} reçus, {count} offres retenues après filtrage."
        )
        time.sleep(1)
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
            description = job.get("descriptionPlain") or strip_html(job.get("description") or "")
            offer = make_offer(
                title=job.get("text") or "",
                company=name,
                location=location,
                text=description,
                url=url,
                date=job.get("createdAt") or "",
                source="Lever",
            )
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
    queries = cfg.get("queries") or DEFAULT_SMARTRECRUITERS_QUERIES
    limit = min(max(int(cfg.get("resultsPerQuery", 50)), 1), 100)
    max_details = min(max(int(cfg.get("maxDetailsPerCompany", 30)), 1), 100)
    offers = []
    for company_cfg in companies:
        identifier = quote(str(company_cfg["identifier"]).strip(), safe="")
        company_name = company_cfg.get("name") or company_cfg["identifier"]
        candidates = {}
        for query in queries:
            if not query.get("enabled", True) or not query.get("keywords"):
                continue
            params = urlencode({
                "q": query["keywords"],
                "limit": limit,
                "offset": 0,
                "country": cfg.get("country", "FR"),
                **({"region": cfg["region"]} if cfg.get("region") else {}),
            })
            try:
                data = api_json(
                    f"https://api.smartrecruiters.com/v1/companies/{identifier}/postings?{params}",
                    f"SmartRecruiters [{company_name}/{query.get('name', '?')}]",
                )
            except Exception:
                continue
            for posting in data.get("content", []):
                posting_id = str(posting.get("id") or posting.get("uuid") or "")
                if posting_id:
                    candidates.setdefault(posting_id, (posting, query.get("category")))

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
            description = " ".join(
                section.get("text", "")
                for section in sections.values()
                if isinstance(section, dict)
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
        print(f"SmartRecruiters [{company_name}] : {count} offres pertinentes.")
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
            description = job.get("descriptionPlain") or strip_html(job.get("descriptionHtml") or "")
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
    if not OUT.exists():
        return []
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
        return previous if isinstance(previous, list) else []
    except (json.JSONDecodeError, OSError):
        print("Attention : ancien offres.json illisible ; sauvegarde à vérifier.")
        return []


def should_keep(offer, today):
    """Purge : publication trop ancienne ET plus revue depuis MAX_UNSEEN_DAYS."""
    # Ne jamais supprimer l'historique de candidature ni les modifications utilisateur.
    status = str(offer.get("status") or "").strip().casefold()
    if offer.get("appliedDate") or offer.get("notesEdited"):
        return True
    if status and status != "à examiner":
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

    merged = []
    index = {}
    for item in previous:
        if not isinstance(item, dict):
            continue
        merged.append(item)
        for key in offer_keys(item):
            index.setdefault(key, item)

    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    except (json.JSONDecodeError, OSError):
        config = {}

    errors = []
    fresh = []

    # Jooble : une requête par métier visé (configurable dans sources.json).
    api_key = os.environ.get("JOOBLE_API_KEY", "").strip()
    if not api_key:
        print("Jooble ignoré : secret JOOBLE_API_KEY absent.")
    else:
        for query in config.get("joobleQueries") or DEFAULT_JOOBLE_QUERIES:
            if not query.get("enabled", True) or not query.get("keywords"):
                continue
            try:
                fresh.extend(fetch_jooble(api_key, query))
                time.sleep(2)
            except Exception as exc:
                errors.append(
                    {"source": f"Jooble/{query.get('name', '?')}", "error": type(exc).__name__}
                )

    # API France Travail (offre d'emploi v2), source officielle et autorisée.
    ft_cfg = config.get("franceTravail") or {}
    if ft_cfg.get("enabled", True):
        try:
            fresh.extend(fetch_francetravail(ft_cfg))
        except Exception as exc:
            errors.append({"source": "France Travail", "error": type(exc).__name__})

    # API généraliste Adzuna ; nécessite deux secrets GitHub facultatifs.
    try:
        fresh.extend(fetch_adzuna(config.get("adzuna") or {}))
    except Exception as exc:
        errors.append({"source": "Adzuna", "error": type(exc).__name__})

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
    for item in fresh:
        item["collectedAt"] = now
        item["lastSeen"] = today.isoformat()
        keys = offer_keys(item)
        match = index.get(url_key(item.get("url")))
        if match is None:
            match = index.get(content_key(item.get("title"), item.get("company"), item.get("location")))
        if match is not None:
            updated_count += 1
            match["lastSeen"] = today.isoformat()
            linked_sources = match.get("sources")
            if not isinstance(linked_sources, list):
                linked_sources = [match["source"]] if match.get("source") else []
            incoming_source = item.get("source")
            if incoming_source and incoming_source not in linked_sources:
                linked_sources.append(incoming_source)
            if linked_sources:
                match["sources"] = linked_sources
            for field in ("title", "company", "location", "dept", "contract",
                          "category", "date", "notes", "url"):
                if field == "notes" and match.get("notesEdited"):
                    continue
                if item.get(field):
                    match[field] = item[field]
        else:
            new_count += 1
            item.setdefault("created", today.isoformat())
            if item.get("source"):
                item.setdefault("sources", [item["source"]])
            merged.append(item)
            for key in keys:
                index.setdefault(key, item)

    kept = [item for item in merged if should_keep(item, today)]
    removed = len(merged) - len(kept)

    def sort_key(offer):
        parsed = parse_date(offer.get("date"))
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            pub_ts = parsed.timestamp()
        else:
            pub_ts = 0
        return (pub_ts, offer.get("collectedAt", ""))

    offers = sorted(kept, key=sort_key, reverse=True)
    OUT.write_text(
        json.dumps(offers, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Offres conservées : {len(offers)} (nouvelles : {new_count}, mises à jour : {updated_count})")
    print(f"Offres purgées (obsolètes) : {removed}")
    print(f"Flux RSS activés : {sum(bool(f.get('enabled')) for f in feeds)}")
    if errors:
        print("Sources en erreur : " + json.dumps(errors, ensure_ascii=False))


if __name__ == "__main__":
    main()
