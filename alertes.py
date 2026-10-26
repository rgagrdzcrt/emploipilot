#!/usr/bin/env python3
"""
ZCRT — offres reçues par e-mail (alertes HelloWork et Meteojob).

HelloWork et Meteojob n'ont pas d'API publique, mais envoient chaque jour des
alertes e-mail avec de nouvelles offres. collect.py les lit dans Gmail (mêmes
secrets que le robot de tri, lecture seule) et les ajoute aux offres collectées.

Le dépôt est public : de chaque offre on ne garde que le poste, l'entreprise,
le lieu, le contrat, le salaire et l'adresse publique de l'annonce. Les liens
des e-mails contiennent l'adresse e-mail ou un jeton de connexion : ils sont
décodés puis réduits à l'adresse de l'annonce, sans aucun paramètre.

Essai en local (sans Gmail) : python alertes.py message.json
(fichier JSON avec les champs htmlBody / plaintextBody d'un e-mail d'alerte).
"""

import re
import sys
import html
import json
import base64
from datetime import datetime, timezone

SOURCES = {
    "HelloWork": "from:notification@emails.hellowork.com",
    "Meteojob": "from:ne-pas-repondre@meteojob.com subject:(recrute OR offres)",
}
MAX_MAILS = 40  # par source et par collecte

DEPT_RE = re.compile(r"^(?P<ville>.+?)\s*[-–(]\s*(?P<dept>\d{2}|2[AB])\)?(?:\s*-\s*.+)?$")
CONTRACTS = ("CDI", "CDD", "Intérim", "Interim", "Alternance", "Stage", "Freelance", "Indépendant", "Saisonnier")


def _lines(markup):
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", markup)
    text = re.sub(r"<[^>]+>", "\n", text)
    return [l.strip() for l in html.unescape(text).replace("\xa0", " ").split("\n") if l.strip()]


# ---------------------------------------------------------------- HelloWork

def _hellowork_target(link):
    """Lien de suivi HelloWork → identifiant de l'annonce (le lien encode l'e-mail puis l'URL)."""
    segment = link.rstrip("/").split("/")[-1].split("?")[0]
    try:
        raw = base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)).decode("utf-8", "replace")
    except Exception:
        return None
    match = re.search(r"hellowork\.com/fr-fr/emplois/(\d+)\.html.*utm_content=([a-z0-9]+)", raw)
    if not match or "title" not in match.group(2):
        return None
    return match.group(1)


def parse_hellowork(markup):
    """Offres d'une alerte HelloWork, dans l'ordre de l'e-mail."""
    ids = []
    for link in re.findall(r'href="([^"]+)"', markup):
        job_id = _hellowork_target(html.unescape(link))
        if job_id and job_id not in ids:
            ids.append(job_id)

    # Chaque offre : poste, entreprise, [« Super recruteur »], « Ville - 93 », contrat, [salaire], « Voir l’offre ».
    blocks, current = [], []
    for line in _lines(markup):
        if line.lower().startswith("voir l") and "offre" in line.lower():
            if current:
                blocks.append(current)
            current = []
        else:
            current.append(line)

    offers = []
    for block in blocks:
        block = [l for l in block if l.lower() not in {"super recruteur", "nouveau", "urgent"}]
        where = next((i for i, l in enumerate(block) if DEPT_RE.match(l) and i >= 2), None)
        if where is None:
            continue
        after = block[where + 1:]
        contract = next((l for l in after if l in CONTRACTS), "")
        salary = next((l for l in after if "€" in l), "")
        place = DEPT_RE.match(block[where])
        offers.append({
            "title": block[where - 2], "company": block[where - 1],
            "location": f"{place.group('ville')} ({place.group('dept')})",  # « Bondy (93) » : format lu par collect.py
            "contract": contract, "salary": salary,
        })

    if len(offers) != len(ids):
        # Mise en page inattendue : mieux vaut ne rien importer que mélanger les liens.
        return []
    for offer, job_id in zip(offers, ids):
        offer["url"] = f"https://www.hellowork.com/fr-fr/emplois/{job_id}.html"
    return offers


# ---------------------------------------------------------------- Meteojob

def parse_meteojob(text):
    """Offres d'une alerte Meteojob (partie texte de l'e-mail)."""
    offers = []
    for block in re.split(r"\n\s*-{5,}\s*\n", html.unescape(text)):
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        link = next((i for i, l in enumerate(lines) if "meteojob.com/jobs/" in l), None)
        if link is None or link == 0:
            continue
        job_id = re.search(r"meteojob\.com/jobs/(\d+)", lines[link]).group(1)
        rest = [l.lstrip("- ").strip() for l in lines[link + 1:]]
        company = rest[0].rstrip(" -").strip() if rest else ""
        contract = next((l for l in rest if l in CONTRACTS), "")
        location = next((l for l in rest if re.search(r"\(\d{2}\)", l)), "")
        location = re.match(r".*?\(\d{2}\)", location).group(0) if location else ""  # « Bondy (93) », sans la région
        salary = next((l for l in rest if "€" in l), "")
        offers.append({
            "title": lines[link - 1], "company": company, "location": location,
            "contract": contract, "salary": salary,
            "url": f"https://www.meteojob.com/jobs/{job_id}",
        })
    return offers


# ---------------------------------------------------------------- Gmail

def _parts(payload):
    found = {}

    def walk(part):
        data = (part.get("body") or {}).get("data")
        mime = part.get("mimeType", "")
        if data and mime in ("text/html", "text/plain") and mime not in found:
            found[mime] = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "replace")
        for sub in part.get("parts") or []:
            walk(sub)

    walk(payload)
    return found


def fetch_alert_offers(days=4):
    """Offres des alertes reçues ces derniers jours, au format brut (pour collect.make_offer)."""
    import mail  # même authentification Gmail que le robot de tri

    token = mail.google_access_token()
    if not token:
        print("Alertes e-mail ignorées : secrets Gmail absents.")
        return []
    gmail = mail.Gmail(token)
    results = []
    for source, query in SOURCES.items():
        ids = gmail.message_ids(query=f"{query} newer_than:{days}d")[:MAX_MAILS]
        count = 0
        for message_id in ids:
            msg = gmail.message(message_id)
            parts = _parts(msg.get("payload", {}))
            received = datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, timezone.utc).isoformat()
            if source == "HelloWork":
                offers = parse_hellowork(parts.get("text/html", ""))
            else:
                offers = parse_meteojob(parts.get("text/plain", ""))
            for offer in offers:
                offer.update(source=source, date=received)
                results.append(offer)
                count += 1
        print(f"Alertes {source} : {len(ids)} e-mail(s), {count} offre(s).")
    return results


if __name__ == "__main__":
    for path in sys.argv[1:]:
        data = json.load(open(path, encoding="utf-8"))
        found = parse_hellowork(data.get("htmlBody", "")) or parse_meteojob(data.get("plaintextBody", ""))
        print(json.dumps(found, ensure_ascii=False, indent=1))
