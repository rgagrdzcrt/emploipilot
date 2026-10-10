#!/usr/bin/env python3
"""Collecteur RSS/Atom simple. N'utilise que les flux explicitement configurés et autorisés."""
from __future__ import annotations
import hashlib, html, json, re, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "sources.json"
OUT = ROOT / "data" / "offres.json"
UA = "EmploiPilot/0.1 (+personal job-search tool; RSS/API feed reader)"

STAGE_RE = re.compile(r"\b(stage|stagiaire|alternance|alternant|apprentissage|apprenti)\b", re.I)
INTERIM_RE = re.compile(r"\b(int[eé]rim|int[eé]rimaire|mission temporaire)\b", re.I)
CDI_RE = re.compile(r"\b(CDI|contrat [àa] dur[eé]e ind[eé]termin[eé]e)\b", re.I)
CDD_RE = re.compile(r"\b(CDD|contrat [àa] dur[eé]e d[eé]termin[eé]e)\b", re.I)


def strip_html(value: str) -> str:
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value or "")
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def child_text(node, names):
    for el in node.iter():
        tag = el.tag.rsplit("}", 1)[-1].lower()
        if tag in names and el.text and el.text.strip():
            return el.text.strip()
    return ""


def entry_link(node):
    for el in node.iter():
        if el.tag.rsplit("}", 1)[-1].lower() == "link":
            href = el.attrib.get("href")
            if href and (el.attrib.get("rel", "alternate") == "alternate"):
                return href.strip()
            if el.text and el.text.strip().startswith("http"):
                return el.text.strip()
    return ""


def parse_date(node):
    return child_text(node, {"pubdate", "published", "updated", "date", "issued"})[:100]


def classify_contract(text):
    if STAGE_RE.search(text):
        return None
    # Prefer explicit interim mentions, but do not confuse a permanent contract's body text.
    if INTERIM_RE.search(text):
        return "Intérim"
    if CDI_RE.search(text):
        return "CDI"
    if CDD_RE.search(text):
        return "CDD"
    return None


def classify_category(text, contract):
    t = text.lower()
    # L’intérim reste dans un onglet séparé, conformément aux critères de recherche.
    if contract == "Intérim":
        return "interim"
    if re.search(r"vendeur|vente|boutique|pr[eê]t[- ]?[àa][- ]?porter|conseiller de vente", t): return "vente"
    if re.search(r"mise en rayon|employ[eé].{0,12}rayon|libre.?service|r[eé]assort|grande distribution", t): return "rayon"
    if re.search(r"stock|logistique|magasinier|pr[eé]parateur de commandes|approvision|stockiste", t): return "stock"
    return None


def fetch_feed(feed):
    req = Request(feed["url"], headers={"User-Agent": UA, "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml"})
    with urlopen(req, timeout=25) as resp:
        raw = resp.read(8_000_000)
    root = ET.fromstring(raw)
    nodes = [n for n in root.iter() if n.tag.rsplit("}", 1)[-1].lower() in {"item", "entry"}]
    results = []
    for node in nodes:
        title = child_text(node, {"title"})
        url = entry_link(node)
        summary = child_text(node, {"description", "summary", "content", "encoded"})
        summary = strip_html(summary)
        if not title or not url or urlparse(url).scheme not in {"http", "https"}:
            continue
        blob = f"{title} {summary}"
        contract = classify_contract(blob)
        category = classify_category(blob, contract or "")
        # Unknown job families/contracts are omitted rather than guessed.
        if not contract or not category:
            continue
        published = parse_date(node)
        ident = hashlib.sha256(url.split("#", 1)[0].rstrip("/").encode()).hexdigest()[:16]
        results.append({
            "id": "feed_" + ident,
            "title": strip_html(title),
            "company": child_text(node, {"author", "creator", "company", "employer"}) or "Entreprise à vérifier",
            "location": "À vérifier dans l’annonce",
            "contract": contract,
            "category": category,
            "date": published or "Date non fournie par le flux",
            "url": url,
            "notes": summary[:1200] or "Description non fournie par le flux. Ouvre l’annonce pour vérifier le lieu et le contrat.",
            "status": "À examiner",
            "source": feed.get("name", "Flux partenaire"),
            "collectedAt": datetime.now(timezone.utc).isoformat(),
            "demo": False
        })
    return results


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {"feeds": []}
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    by_url = {}
    for item in previous:
        if item.get("url"):
            by_url[item["url"].split("#", 1)[0].rstrip("/")] = item
    errors = []
    for feed in config.get("feeds", []):
        if not feed.get("enabled") or not feed.get("url"):
            continue
        try:
            for item in fetch_feed(feed):
                key = item["url"].split("#", 1)[0].rstrip("/")
                # Keep user's application status and first-seen metadata across runs.
                if key in by_url:
                    old = by_url[key]
                    item["status"] = old.get("status", "À examiner")
                    if old.get("appliedDate"): item["appliedDate"] = old["appliedDate"]
                    if old.get("created"): item["created"] = old["created"]
                else:
                    item["created"] = datetime.now(timezone.utc).date().isoformat()
                by_url[key] = item
            time.sleep(1)
        except Exception as exc:
            errors.append({"source": feed.get("name", feed.get("url", "source")), "error": str(exc)[:300]})
    # Keep records newest first; stable URL-based deduplication.
    offers = sorted(by_url.values(), key=lambda x: x.get("collectedAt", ""), reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(offers, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Offres conservées : {len(offers)} ; sources activées : {sum(bool(f.get('enabled')) for f in config.get('feeds', []))}")
    if errors:
        print("Sources en erreur : " + json.dumps(errors, ensure_ascii=False))

if __name__ == "__main__":
    main()
