
#!/usr/bin/env python3
"""EmploiPilot : collecte Jooble et flux RSS/Atom autorisés."""
import os
import re
import json
import html
import time
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "sources.json"
OUT = ROOT / "offres.json"
UA = "EmploiPilot/0.2 (job-search tool)"

STAGE_RE = re.compile(
    r"\b(stage|stagiaire|alternance|alternant|apprentissage|apprenti)\b", re.I
)
INTERIM_RE = re.compile(r"\b(int[eé]rim|int[eé]rimaire|mission temporaire)\b", re.I)
CDI_RE = re.compile(r"\b(CDI|contrat [àa] dur[eé]e ind[eé]termin[eé]e)\b", re.I)
CDD_RE = re.compile(r"\b(CDD|contrat [àa] dur[eé]e d[eé]termin[eé]e)\b", re.I)


def strip_html(value):
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


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
        r"vendeur|vente|boutique|pr[eê]t[- ]?[àa][- ]?porter|conseiller de vente",
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


def make_offer(title, company, location, text, url, date, source):
    if not title or not url or urlparse(url).scheme not in {"http", "https"}:
        return None

    full_text = f"{title} {text}"
    contract = classify_contract(full_text)
    category = classify_category(full_text)

    # On exclut les stages/alternances et les offres hors catégories recherchées.
    if contract is None or category is None:
        return None

    return {
        "id": f"{source.lower()}_{stable_id(url)}",
        "title": strip_html(title),
        "company": strip_html(company) or "Entreprise à vérifier",
        "location": strip_html(location) or "Lieu à vérifier dans l’annonce",
        "contract": contract,
        "category": category,
        "date": date or "Date non fournie",
        "url": url,
        "notes": strip_html(text)[:1200]
        or "Ouvre l’annonce pour vérifier les détails.",
        "status": "À examiner",
        "source": source,
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "demo": False,
    }


def fetch_jooble():
    api_key = os.environ.get("JOOBLE_API_KEY", "").strip()
    if not api_key:
        print("Jooble ignoré : secret JOOBLE_API_KEY absent.")
        return []

    endpoint = f"https://fr.jooble.org/api/{api_key}"
    payload = {
        "keywords": (
            "magasinier, stockiste, logistique, préparateur de commandes, "
            "approvisionnement, mise en rayon, vendeur, prêt-à-porter"
        ),
        "location": "Île-de-France",
        "radius": "80",
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
        with urlopen(req, timeout=35) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Ne jamais afficher l'URL complète : elle contient la clé API.
        print(f"Jooble : erreur HTTP {exc.code}. Vérifie l'accès API et le quota.")
        return []
    except (URLError, TimeoutError, ValueError) as exc:
        print(f"Jooble : erreur de connexion ou réponse invalide ({type(exc).__name__}).")
        return []

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

    print(f"Jooble : {len(offers)} offres pertinentes après filtrage.")
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
            offer["id"] = "feed_" + stable_id(url)
            results.append(offer)

    return results


def main():
    previous = []
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
            if not isinstance(previous, list):
                previous = []
        except (json.JSONDecodeError, OSError):
            print("Attention : ancien offres.json illisible ; sauvegarde à vérifier.")
            previous = []

    # Conserver les statuts de candidature et les annonces déjà connues.
    by_url = {}
    for item in previous:
        if item.get("url"):
            key = item["url"].split("#", 1)[0].rstrip("/")
            by_url[key] = item

    errors = []
    fresh = []

    # Une seule requête Jooble par exécution pour préserver le quota.
    try:
        fresh.extend(fetch_jooble())
    except Exception as exc:
        errors.append({"source": "Jooble", "error": type(exc).__name__})

    # Flux RSS/Atom explicitement configurés et autorisés.
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {"feeds": []}
    except (json.JSONDecodeError, OSError):
        config = {"feeds": []}
        errors.append({"source": "sources.json", "error": "Configuration illisible"})

    for feed in config.get("feeds", []):
        if not feed.get("enabled") or not feed.get("url"):
            continue
        try:
            fresh.extend(fetch_feed(feed))
            time.sleep(1)
        except Exception as exc:
            errors.append({
                "source": feed.get("name", "Flux RSS"),
                "error": type(exc).__name__,
            })

    now = datetime.now(timezone.utc).isoformat()
    for item in fresh:
        key = item["url"].split("#", 1)[0].rstrip("/")
        old = by_url.get(key)
        if old:
            item["status"] = old.get("status", "À examiner")
            for field in ("appliedDate", "created", "notes", "applicationNotes"):
                if old.get(field):
                    item[field] = old[field]
        else:
            item["created"] = datetime.now(timezone.utc).date().isoformat()
        item["collectedAt"] = now
        by_url[key] = item

    # Si une source échoue, les anciennes offres restent conservées.
    offers = sorted(
        by_url.values(),
        key=lambda item: item.get("collectedAt", ""),
        reverse=True,
    )
    OUT.write_text(
        json.dumps(offers, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Offres conservées : {len(offers)}")
    print(f"Nouvelles annonces traitées : {len(fresh)}")
    print(f"Flux RSS activés : {sum(bool(f.get('enabled')) for f in config.get('feeds', []))}")
    if errors:
        print("Sources en erreur : " + json.dumps(errors, ensure_ascii=False))


if __name__ == "__main__":
    main()
