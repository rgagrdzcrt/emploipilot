#!/usr/bin/env python3
"""
ZCRT — offres reçues par e-mail (alertes HelloWork, Meteojob, Indeed et LinkedIn).

Ces sites n'ont pas d'API publique, mais envoient chaque jour des alertes
e-mail avec de nouvelles offres. collect.py les lit dans Gmail (mêmes secrets
que le robot de tri, lecture seule) et les ajoute aux offres collectées.
Indeed et LinkedIn (26/11/2026) : une carte par lien d'offre (parse_job_cards) ;
un échantillon nettoyé des premières alertes est écrit dans le gist secret
(SAMPLE_FILE) pour vérifier la lecture de leur format.

Le dépôt est public : de chaque offre on ne garde que le poste, l'entreprise,
le lieu, le contrat, le salaire et l'adresse publique de l'annonce. Les liens
des e-mails contiennent l'adresse e-mail ou un jeton de connexion : ils sont
décodés puis réduits à l'adresse de l'annonce, sans aucun paramètre.

Essai en local (sans Gmail) : python alertes.py message.json
(fichier JSON avec les champs htmlBody / plaintextBody d'un e-mail d'alerte).
"""

import re
import sys
import gzip
import html
import json
import base64
from datetime import datetime, timezone
from urllib.parse import unquote

SOURCES = {
    "HelloWork": "from:notification@emails.hellowork.com",
    "Meteojob": "from:ne-pas-repondre@meteojob.com subject:(recrute OR offres)",
    # Alertes Indeed et LinkedIn (26/11/2026), lues par parse_job_cards. Les confirmations de
    # candidature et les suivis (« consultée », « viewed ») ne sont pas des alertes.
    "Indeed": "from:indeed.com -subject:(candidature OR finalisez OR finaliser OR consulté OR consultée)",
    "LinkedIn": "from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com OR jobs-listings@linkedin.com)"
                " -subject:(candidature OR application OR consulté OR consultée OR viewed)",
    # Autres alertes (26/11/2026), lues de la même façon. France Travail : l'API ne marche pas, mais
    # ses alertes e-mail donnent les offres avec leur ville ; elles se fondent avec les mêmes offres
    # venues d'EURES (même adresse d'annonce), qui gagnent ainsi la ville et le temps de trajet.
    "France Travail": "from:(francetravail.fr OR pole-emploi.fr) subject:(offre OR offres OR alerte)",
    "Service public": "from:choisirleservicepublic.gouv.fr",
    "Welcome to the Jungle": "from:welcometothejungle.com -subject:(candidature OR application)",
    "Leboncoin": "from:leboncoin.fr subject:(annonce OR annonces OR recherche OR emploi)",
    "Optioncarrière": "from:optioncarriere.com",
}
# Échantillons nettoyés des alertes Indeed et LinkedIn (liens sans paramètres, sans adresse e-mail),
# écrits dans le gist secret de synchronisation pour vérifier la lecture de leur format.
SAMPLE_FILE = "zcrt-alertes-echantillons.json"
SAMPLES_PER_SOURCE = 2
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


# ---------------------------------------------------------------- Indeed et LinkedIn

INDEED_JK_RE = re.compile(r"[?&;]jk=([0-9a-f]{16})\b", re.I)
LINKEDIN_JOB_RE = re.compile(r"linkedin\.com/(?:comm/)?jobs/view/(?:[^/?#\"'\s]*?-)?(\d{6,})", re.I)
# Textes de bouton, mentions et compteurs : jamais un poste, une entreprise ou un lieu.
GENERIC_RE = re.compile(
    r"^\W*(?:voir|postuler|candidat|en savoir|d[eé]couvr|enregistr|sauvegard|nouveau|nouvelle|urgent|sponsoris"
    r"|facile|simplifi|recrute|actively|il y a|publi[eé]|aujourd|today|new\b|view|apply|easy apply|promoted|plus de"
    r"|\d+\s*(?:candidat|ancien|relation|connexion|applicant|alumni)|r[eé]ponse|r[eé]pond|g[eé]rer|modifier|se d[eé]sabonner"
    r"|unsubscribe|toutes les|all jobs|see all|afficher|\W*$)",
    re.I,
)
PLACE_RE = re.compile(
    r"\(\d{2}\)|\b\d{5}\b|\bparis\b|[iî]le[- ]de[- ]france|\bfrance\b|seine|val[- ]d|hauts[- ]de|essonne|yvelines"
    r"|\bmarne\b|t[eé]l[eé]travail|\bremote\b|hybride"
    r"|\b(?:bondy|montreuil|saint[- ]denis|saint[- ]ouen|aubervilliers|pantin|bobigny|rosny|noisy|cr[eé]teil|nanterre"
    r"|roissy|orly|rungis|ivry|vitry|villepinte|aulnay|gonesse|cergy|argenteuil|boulogne|courbevoie|levallois|clichy"
    r"|vincennes|la d[eé]fense|puteaux|issy|massy|marne[- ]la[- ]vall[eé]e|serris|chessy|meaux|torcy|tremblay)\b",
    re.I,
)
CONTRACT_RE = re.compile(r"\b(CDI|CDD|Int[eé]rim|Alternance|Stage|Freelance|Ind[eé]pendant|Saisonnier)\b", re.I)


def _decoded(link):
    """Texte des segments encodés d'un lien de suivi (cts.indeed.com/v3/…, base64 éventuellement gzip)."""
    out = []
    for segment in re.split(r"[/?&=]", link):
        if len(segment) < 24:
            continue
        try:
            raw = base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
        except Exception:
            continue
        text = raw.decode("utf-8", "replace")
        # Segment chiffré (liens « engage.indeed.com » des e-mails promotionnels) : octets illisibles,
        # ignorés ; ils abîmaient l'échantillon écrit dans le gist (27/11/2026).
        if text and sum(ch.isprintable() for ch in text) >= 0.95 * len(text):
            out.append(text)
    return " ".join(out)


# Liens d'offre des autres sites d'alertes : (source, motif, adresse publique de l'annonce).
OTHER_JOB_LINKS = (
    ("France Travail", re.compile(r"(?:francetravail|pole-emploi)\.fr/offres/recherche/detail/([0-9A-Z]{5,12})\b"),
     "https://candidat.francetravail.fr/offres/recherche/detail/{}"),
    ("Service public", re.compile(r"choisirleservicepublic\.gouv\.fr/offre-emploi/([a-z0-9][a-z0-9-]{8,160})", re.I),
     "https://choisirleservicepublic.gouv.fr/offre-emploi/{}/"),
    ("Welcome to the Jungle", re.compile(r"welcometothejungle\.com/(?:fr|en)/companies/([^/?#\"'\s]+/jobs/[^/?#\"'\s]+)", re.I),
     "https://www.welcometothejungle.com/fr/companies/{}"),
    ("Leboncoin", re.compile(r"leboncoin\.fr/(?:ad/)?(?:offres_d_emploi|emploi)/(\d{6,})", re.I),
     "https://www.leboncoin.fr/ad/offres_d_emploi/{}"),
    ("Optioncarrière", re.compile(r"optioncarriere\.com/jobad/([a-z0-9]{8,})", re.I),
     "https://www.optioncarriere.com/jobad/{}"),
)


def job_key(link):
    """(source, identifiant, adresse publique sans paramètres) d'un lien d'offre (Indeed, LinkedIn,
    France Travail, Choisir le service public, Welcome to the Jungle, Leboncoin, Optioncarrière)."""
    link = html.unescape(link or "")
    for text in (link, unquote(link), unquote(_decoded(link))):
        match = INDEED_JK_RE.search(text)
        if match and "indeed" in (link + text).lower():
            jk = match.group(1).lower()
            return "Indeed", jk, f"https://fr.indeed.com/viewjob?jk={jk}"
        match = LINKEDIN_JOB_RE.search(text)
        if match:
            return "LinkedIn", match.group(1), f"https://www.linkedin.com/jobs/view/{match.group(1)}/"
        for source, pattern, url in OTHER_JOB_LINKS:
            match = pattern.search(text)
            if match:
                key = match.group(1).rstrip("/")
                return source, key, url.format(key)
    return None


def _card_fields(lines):
    """Entreprise, lieu, contrat et salaire dans les lignes qui suivent le titre d'une carte."""
    lines = [l for l in lines if len(l) <= 140 and not GENERIC_RE.match(l)]
    company = location = ""
    for i, line in enumerate(lines[:6]):
        # « Entreprise · Lieu » (LinkedIn), « Entreprise - Paris (75) » (Indeed).
        pair = re.match(r"^(.+?)\s+[·•]\s+(.+)$", line) or re.match(
            r"^(.+?)\s+[-–]\s+(.*(?:\(\d{2}\)|\b\d{5}\b|paris|[iî]le[- ]de[- ]france).*)$", line, re.I)
        if pair and re.fullmatch(r"\d{2}|2[AB]", pair.group(1).strip()):
            location = line.strip()  # « 75 - PARIS 10 » (France Travail) : département et ville
            break
        if pair and PLACE_RE.search(pair.group(2)):
            company = company or pair.group(1).strip()
            location = re.split(r"\s+[·•]\s+", pair.group(2))[0].strip()
            break
        if not company and (i == 0 or not PLACE_RE.search(line)):
            company = line.strip()  # première ligne après le titre : l'entreprise
        elif PLACE_RE.search(line):
            location = line.strip()
            break
    contract = next((m.group(1) for m in map(CONTRACT_RE.search, lines[:10]) if m), "")
    salary = next((l for l in lines[:10] if "€" in l), "")
    return company, location, contract, salary


def parse_job_cards(markup):
    """Offres d'une alerte Indeed ou LinkedIn (HTML) : une carte par lien d'offre, dans l'ordre de
    l'e-mail. Le titre est le texte d'un lien vers l'offre ; l'entreprise et le lieu sont les lignes
    qui le suivent, jusqu'à la carte suivante. Les liens sont réduits à l'adresse publique de l'offre."""
    cards, order = {}, []
    for m in re.finditer(r"<a\b[^>]*?href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a\s*>", markup, re.I | re.S):
        found = job_key(m.group(1))
        if not found:
            continue
        source, key, url = found
        if key not in cards:
            cards[key] = {"source": source, "url": url, "start": m.start(), "title": "", "after": None}
            order.append(key)
        text = " ".join(_lines(m.group(2)))
        if not cards[key]["title"] and 3 <= len(text) <= 120 and not GENERIC_RE.match(text):
            cards[key]["title"], cards[key]["after"] = text, m.end()
    offers = []
    for i, key in enumerate(order):
        card = cards[key]
        if not card["title"]:
            continue
        end = cards[order[i + 1]]["start"] if i + 1 < len(order) else len(markup)
        company, location, contract, salary = _card_fields(_lines(markup[card["after"]:max(end, card["after"])]))
        offers.append({"title": card["title"], "company": company, "location": location, "contract": contract,
                       "salary": salary, "url": card["url"], "source": card["source"]})
    return offers


def parse_job_text(text):
    """Même lecture sur la partie texte de l'e-mail : poste, entreprise et lieu au-dessus du lien."""
    offers, seen = [], set()
    lines = [l.strip() for l in html.unescape(text or "").split("\n")]
    for i, line in enumerate(lines):
        found = next((job_key(u) for u in re.findall(r"https?://\S+", line) if job_key(u)), None)
        if not found or found[1] in seen:
            continue
        seen.add(found[1])
        above = [l for l in lines[max(0, i - 6):i] if l and not GENERIC_RE.match(l) and "://" not in l][-3:]
        if not above:
            continue
        title, rest = above[0], above[1:]
        company, location, contract, salary = _card_fields(rest)
        offers.append({"title": title, "company": company, "location": location, "contract": contract,
                       "salary": salary, "url": found[2], "source": found[0]})
    return offers


def _sanitize(text):
    """Sans adresse e-mail ni paramètre de lien ; segments de lien longs (jetons) raccourcis."""
    text = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "<e-mail>", str(text or ""))

    def short(m):
        path = "/".join(s if len(s) <= 32 else s[:12] + "…" for s in m.group(2).split("/"))
        return "https://" + m.group(1) + path

    return re.sub(r"https?://([^/\s\"'<>?#]+)([^\s\"'<>?#]*)[^\s\"'<>]*", short, text)


def sample_of(source, subject, received, parts, offers):
    """Échantillon nettoyé d'une alerte : liens (sans paramètres), lignes de texte, offres lues."""
    markup = parts.get("text/html", "")
    links = []
    for m in re.finditer(r"<a\b[^>]*?href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a\s*>", markup, re.I | re.S):
        target = job_key(m.group(1))
        links.append([_sanitize(html.unescape(m.group(1))), " ".join(_lines(m.group(2)))[:100],
                      target[2] if target else _sanitize(unquote(_decoded(html.unescape(m.group(1)))))[:300]])
    return {
        "source": source, "recu": received, "objet": _sanitize(subject)[:150],
        "offresLues": [{k: o[k] for k in ("title", "company", "location", "contract", "url")} for o in offers][:15],
        "liens": links[:80],
        "lignes": [_sanitize(l)[:160] for l in _lines(markup)][:150],
        "texte": [_sanitize(l)[:160] for l in (parts.get("text/plain") or "").split("\n") if l.strip()][:120],
    }


def save_samples(samples):
    """Écrit les échantillons dans le gist secret (même jeton que le tri Gmail) ; jamais dans le dépôt."""
    import os
    import mail
    if not samples or not os.environ.get("ZCRT_GIST_TOKEN", "").strip():
        return
    try:
        mail.gist_call("/gists/" + mail.find_gist(), {"files": {SAMPLE_FILE: {
            "content": json.dumps({"ecrit": datetime.now(timezone.utc).isoformat(), "echantillons": samples},
                                  ensure_ascii=False, indent=1)}}})
        print(f"Alertes : {len(samples)} échantillon(s) nettoyé(s) enregistré(s) dans le gist ({SAMPLE_FILE}).")
    except Exception as exc:  # un échantillon ne bloque jamais la collecte
        print(f"Alertes : échantillons non enregistrés ({type(exc).__name__}).")


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
    results, samples = [], []
    for source, query in SOURCES.items():
        ids = gmail.message_ids(query=f"{query} newer_than:{days}d")[:MAX_MAILS]
        count, sampled = 0, 0
        for message_id in ids:
            msg = gmail.message(message_id)
            parts = _parts(msg.get("payload", {}))
            received = datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, timezone.utc).isoformat()
            if source == "HelloWork":
                offers = parse_hellowork(parts.get("text/html", ""))
            elif source == "Meteojob":
                offers = parse_meteojob(parts.get("text/plain", ""))
            else:  # Indeed, LinkedIn, France Travail, Welcome to the Jungle… : une carte par lien d'offre
                offers = parse_job_cards(parts.get("text/html", "")) or parse_job_text(parts.get("text/plain", ""))
                headers = (msg.get("payload") or {}).get("headers") or []
                subject = next((h.get("value", "") for h in headers if h.get("name", "").lower() == "subject"), "")
                # Échantillon : seulement une alerte (offres lues ou objet d'alerte), jamais un autre
                # message du site (France Travail : actualisation, conseiller…).
                alert_like = offers or re.search(r"offre|emploi|alerte|annonce|job|poste", subject, re.I)
                if sampled < SAMPLES_PER_SOURCE and alert_like:
                    samples.append(sample_of(source, subject, received, parts, offers))
                    sampled += 1
            for offer in offers:
                offer.update(source=source, date=received)
                results.append(offer)
                count += 1
        print(f"Alertes {source} : {len(ids)} e-mail(s), {count} offre(s).")
    save_samples(samples)
    return results


if __name__ == "__main__":
    for path in sys.argv[1:]:
        data = json.load(open(path, encoding="utf-8"))
        found = (parse_hellowork(data.get("htmlBody", "")) or parse_meteojob(data.get("plaintextBody", ""))
                 or parse_job_cards(data.get("htmlBody", "")) or parse_job_text(data.get("plaintextBody", "")))
        print(json.dumps(found, ensure_ascii=False, indent=1))
