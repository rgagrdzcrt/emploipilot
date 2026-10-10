
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
from urllib.parse import urlparse, urlencode
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
        match = next((index[key] for key in keys if key in index), None)
        if match is not None:
            updated_count += 1
            match["lastSeen"] = today.isoformat()
            for field in ("title", "company", "location", "dept", "contract",
                          "category", "date", "notes", "url"):
                if item.get(field):
                    match[field] = item[field]
        else:
            new_count += 1
            item.setdefault("created", today.isoformat())
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
