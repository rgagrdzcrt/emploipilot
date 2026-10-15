#!/usr/bin/env python3
"""
ZCRT — tri des e-mails de candidature (Gmail).

- Lit les candidatures suivies dans le gist secret de synchronisation (zcrt-suivi.json).
- Classe les nouveaux e-mails par règles : entretien, refus, accusé de réception, réponse.
- Dans Gmail : libellés « ZCRT/… » et archivage du seul bruit évident.
  Aucune suppression : le droit demandé est gmail.modify et aucun appel de suppression n'existe ici.
- Met à jour le statut de la candidature dans le gist et envoie une alerte ntfy.

Le dépôt est public : rien n'est écrit dans le dépôt et les journaux GitHub Actions
n'affichent que des compteurs (jamais d'expéditeur ni d'objet).

Options :
  --essai      ne modifie rien (ni Gmail, ni gist, ni alerte)
  --jours N    e-mails des N derniers jours (3 par défaut)
  --detail     affiche chaque décision (en local seulement, refusé dans GitHub Actions)
"""

import os
import re
import sys
import json
import html
import time
import base64
import argparse
import unicodedata
from email.utils import parseaddr
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError, URLError

UA = "EmploiPilot/0.3 (personal job-search tool)"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SYNC_FILE = "zcrt-suivi.json"
MAIL_FILE = "zcrt-mail.json"
PLACEHOLDER_COMPANY = "Entreprise à vérifier"
PROCESSED_KEEP = 3000
MAILS_KEEP = 300  # derniers e-mails triés, affichés dans l'onglet « Mails » du site
MAX_MESSAGES = 500
# Attentes (secondes) quand Gmail refuse pour quota par minute : la dernière couvre une minute pleine.
RATE_WAITS = (20, 40, 65, 65, 65)

# Candidatures auxquelles un e-mail peut se rapporter.
APPLIED_STATUSES = {"Candidature envoyée", "À relancer", "Entretien", "Refus"}

LABELS = {
    "entretien": "ZCRT/Entretien",
    "refus": "ZCRT/Refus",
    "reponse": "ZCRT/Réponse",
    "action": "ZCRT/À faire",
    "accuse": "ZCRT/Accusé",
    "verifier": "ZCRT/À vérifier",
    "bruit": "ZCRT/Bruit",
}
# Rangés hors de la boîte de réception (toujours retrouvables par leur libellé).
ARCHIVED = {"accuse", "bruit"}

KIND_NAMES = {"entretien": "Entretien", "refus": "Refus", "reponse": "Réponse",
              "action": "Action demandée", "accuse": "Accusé de réception"}


# ---------------------------------------------------------------- Texte

def norm(text):
    """Minuscules, sans accents, ponctuation remplacée par des espaces."""
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def has(patterns, text):
    return any(re.search(p, text) for p in patterns)


REFUS = [
    r"\bmalheureusement\b",
    r"\b(pas|plus) (pu )?donner (une )?suite",
    r"\bne (pouvons|pourrons|donnerons|souhaitons) pas (y )?(donner )?suite",
    r"\bsuite (favorable|positive)\b.{0,30}\bpas\b",
    r"\bsuite defavorable\b",
    r"\b(pas|non) (ete )?retenue?s?\b",
    r"\bn (a|ont) pas ete (retenue?s?|selectionnee?s?)",
    r"\b(un|une|d )autres? candidat",
    r"\bavons le regret\b|\bau regret de\b",
    r"\bne correspond(ent)? pas\b",
    r"\bposte (a ete|est (deja )?) ?pourvu",
    r"\bpas en mesure de (donner suite|retenir|poursuivre)",
    r"\bne (pas )?poursuivre (le processus|votre candidature)",
    r"\bavec d autres (profils|candidat)",
]

ENTRETIEN = [
    r"\bvous (rencontrer|recevoir)\b",
    r"\b(convier|convions|invite|inviter|invitons|convoquer|convoquons)\b.{0,50}\b(entretien|rencontre|rendez vous|echange|job ?dating|session)",
    r"\bconvocation\b",
    r"\b(proposer|planifier|fixer|organiser|programmer|caler|confirmer) (un |votre |notre |l )?(entretien|rendez vous|rdv|echange|appel)",
    r"\bvos disponibilites\b|\bdisponible pour (un )?(entretien|echange|appel)",
    r"\b(entretien|rendez vous|rdv) (est )?(prevu |fixe |confirme )?(le|ce|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b",
    r"\bjob ?dating\b",
    r"\bcreneau\b|\bcreneaux\b",
    r"\binvitation (a|pour) (un |votre |notre )?(entretien|echange|rencontre)",
    r"\b(appel|echange|entretien) telephonique\b",
    r"\bpromesse d embauche\b",
]

# Phrases conditionnelles, fréquentes dans les accusés de réception :
# « si votre profil retient notre attention, nous vous proposerons un entretien »,
# « sans réponse de notre part sous un mois, considérez que votre candidature n'a pas été retenue ».
CONDITIONNEL = (
    r"\bsi (votre|ta) (profil|candidature)\b|\bsi tel est le cas\b|\ble cas echeant\b|\bsi nous\b"
    r"|\bdans le cas ou\b|\bsi vous n\b|\bdans l eventualite\b|\ba defaut de\b"
    r"|\bsans (reponse|retour|contact|nouvelles?)\b|\bfaute de (reponse|retour)\b"
    r"|\b(veuillez|merci de|vous pouvez) consider|\bconsiderez\b|\bpasse ce delai\b|\bau dela de ce delai\b"
)


def firm_text(subject, body):
    """Texte sans les phrases conditionnelles (découpage par phrase)."""
    # Un retour à la ligne simple coupe souvent une phrase (texte justifié) : seuls les paragraphes comptent.
    sentences = re.split(r"[.!?;]+|\n\s*\n", (subject or "") + "\n\n" + (body or ""))
    return " . ".join(s for s in map(norm, sentences) if not re.search(CONDITIONNEL, s))

# Démarche demandée au candidat pour que la candidature aboutisse.
ACTION = [
    r"\b(finalis|complet|confirm|valid)(ez|er) (votre|ta) candidature",
    r"\bn oubliez pas de (completer|repondre|finaliser|confirmer|valider)",
    r"\brepondre (aux|a quelques|a ces|a nos) questions",
    r"\b(confirm|valid)(ez|er) (votre|ton|ta) (adresse|compte|e ?mail)",
    r"\bverification de (votre|ton) compte",
    r"\benregistr(ant|ez|er) (votre|ta) (reponse )?video",
]

ACCUSE = [
    r"\brecu (votre|ta) (dossier de )?candidature",
    r"\bbien recu\b.{0,80}\bcandidature",
    r"\baccus\w* (de |bonne )?reception\b",
    r"\bmerci (pour|de) (votre|ta) (candidature|interet)",
    r"\bmerci d avoir (postule|candidate)",
    r"\bremerci\w* (pour|de) (votre|ta) candidature",
    r"\bmerci de nous avoir (transmis|envoye|adresse)",
    r"\bcandidature (a|est) (bien )?(ete )?(recue|enregistree|transmise|prise en compte|envoyee|arrivee|receptionnee|livree)",
    r"\bbien (receptionne|arrivee)",
    r"\breponse (est livree|a ete envoyee)",
    r"\bnous (reviendrons|revenons) vers (vous|toi)",
    r"\bconfirm\w* (la )?(bonne )?reception",
    r"\bconfirmation (de (votre |ta )?candidature|reponse a offre)",
    r"\bremercions (pour|de) (votre|ta) candidature|\bremercions (de|pour) l interet\b",
    r"\bvous venez de (postuler|candidater|finaliser)",
    r"\bavez (postule|candidate)\b",
    r"\bthank(s| you) for (applying|your application)|\bapplication (received|was submitted)",
    r"\bvotre demande a ete recue",
]

# Création de compte candidat ou d'inscription : aucune information sur la candidature.
INSCRIPTION = [
    r"\bconfirmation de (votre |ton )?inscription",
    r"\binscription\b.{0,80}\b(enregistree|confirmee|prise en compte)",
    r"\bbienvenue chez\b",
    r"\bcompte a (bien )?ete cree|\bnouveau compte\b",
    r"\bprofil a ete cree",
    r"\bbienvenue (sur|dans l espace)",
]

# E-mail qui parle d'une candidature (sert à écarter les correspondances fortuites dans le texte).
CANDIDATURE = r"\bcandidat|\bpostul|\brecrut|\bentretien\b|\bcv\b|\bposte\b|\boffre d emploi\b|\bembauche\b"

# Alertes d'offres et lettres d'information : du bruit tant qu'aucune candidature ne correspond.
ALERTE = [
    r"\bnouvelles? offres?\b", r"\boffres? (d emploi )?pour (vous|toi)\b", r"\balerte\b",
    r"\bemplois? (qui )?correspond", r"\bjobs? for you\b", r"\bnewsletter\b", r"\brecommand",
    r"\bpourrai(en)?t (vous|t) interesser\b", r"\bpostes? similaires?\b",
]

NOISE_DOMAINS = (
    "indeed.com", "indeedemail.com", "linkedin.com", "hellowork.com", "jooble.org", "jobijoba.com",
    "meteojob.com", "monster.fr", "monster.com", "welcometothejungle.com", "francetravail.fr",
    "pole-emploi.fr", "glassdoor.com", "glassdoor.fr", "adzuna.fr", "jobteaser.com", "staffme.fr",
    "qapa.fr", "studentjob.fr", "regionsjob.com", "cadremploi.fr", "keljob.com", "talent.com",
    "michaelpage.fr", "distrijob.fr", "jobtransport.com", "jobleads.com", "jobs2web.com",
)

# Plateformes de recrutement : leurs e-mails concernent une candidature.
ATS_DOMAINS = (
    "smartrecruiters.com", "teamtailor.com", "teamtailor-mail.com", "lever.co", "greenhouse.io",
    "myworkday.com", "myworkdayjobs.com", "workday.com", "taleo.net", "successfactors.com",
    "successfactors.eu", "jobaffinity.fr", "flatchr.io", "talent-soft.com", "talentsoft.com",
    "cegid.com", "beetween.com", "recruitee.com", "welcomekit.co", "digitalrecruiters.com",
    "icims.com", "softy.pro", "werecruit.io", "inrecruiting.com", "join.com", "ashbyhq.com",
    "talentview.io", "recruitmail.com", "workablemail.com", "taleez.com", "recruitee-mailbox.com",
    "altays-progiciels.com", "mydjob.fr",
)

STOP_WORDS = {
    "sas", "sasu", "sa", "sarl", "eurl", "snc", "sca", "scs", "groupe", "group", "france", "fr",
    "magasin", "hypermarche", "supermarche", "le", "la", "les", "l", "de", "des", "du", "d", "et",
    "the", "and", "inc", "ltd", "gmbh", "co", "cie", "societe", "ste", "entreprise", "recrutement",
}

TITLE_STOP = {"h", "f", "hf", "cdi", "cdd", "temps", "plein", "partiel", "interim", "poste", "employe",
              "employee", "agent", "agente", "pour", "avec", "dans", "sur", "paris"}


def company_key(name):
    if not name or name == PLACEHOLDER_COMPANY:
        return ""
    words = [w for w in norm(name).split() if w not in STOP_WORDS]
    key = " ".join(words)
    return key if len(key.replace(" ", "")) >= 3 else ""


def contains_phrase(phrase, text):
    return bool(phrase) and re.search(r"\b" + re.escape(phrase) + r"\b", text) is not None


def domain_of(address):
    return address.rpartition("@")[2].lower()


def domain_in(domain, domains):
    return any(domain == d or domain.endswith("." + d) for d in domains)


# ---------------------------------------------------------------- Classement

def detect_kind(subject, body):
    """Nature de l'e-mail, par ordre de priorité :
    refus, entretien, action, accuse, inscription ou reponse."""
    text = norm(subject) + " . " + norm(body)
    # Les phrases conditionnelles ne valent ni refus ni convocation.
    firm = firm_text(subject, body)
    if has(REFUS, firm):
        return "refus"
    if has(ENTRETIEN, firm):
        return "entretien"
    if has(ACTION, text):
        return "action"
    if has(ACCUSE, text):
        return "accuse"
    if has(INSCRIPTION, text):
        return "inscription"
    return "reponse"


def match_application(mail, applications):
    """Candidature à laquelle l'e-mail se rapporte : (candidature, ambigu)."""
    sender = norm(mail["from_name"])
    domain = domain_of(mail["from_addr"])
    domain_words = norm(domain.replace(".", " "))
    domain_compact = domain.replace("-", "").replace(".", " ")
    subject = norm(mail["subject"])
    body = norm(mail["body"][:4000])
    related = mail["related"]

    scored = []
    for app in applications:
        key = app["_key"]
        if not key:
            continue
        score = 0
        if contains_phrase(key, sender) or contains_phrase(key, domain_words) \
                or contains_phrase(key.replace(" ", ""), domain_compact):
            score += 3
        if contains_phrase(key, subject):
            score += 2
        if related and contains_phrase(key, body):
            score += 1
        if not score:
            continue
        # Départage par les mots du poste cités dans l'objet ou le texte.
        title_words = [w for w in norm(app.get("title")).split() if len(w) >= 4 and w not in TITLE_STOP]
        score += min(3, sum(1 for w in title_words if contains_phrase(w, subject + " " + body)))
        scored.append((score, app))

    if not scored:
        return None, False
    scored.sort(key=lambda x: x[0], reverse=True)
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None, True
    return scored[0][1], False


def classify(mail, applications):
    """Décision pour un e-mail : {kind, label, app, archive}."""
    domain = domain_of(mail["from_addr"])
    text = norm(mail["subject"] + " " + mail["body"][:4000])
    mail["related"] = bool(re.search(CANDIDATURE, text)) or domain_in(domain, ATS_DOMAINS)

    kind = detect_kind(mail["subject"], mail["body"][:6000])
    app, ambiguous = match_application(mail, applications)
    ats = domain_in(domain, ATS_DOMAINS)

    # Envoi de masse d'un site d'emploi ou d'une enseigne (alertes, publicités, conseils).
    # Les adresses « reply. » des sites d'emploi relaient au contraire un vrai recruteur.
    job_board = domain_in(domain, NOISE_DOMAINS) and not domain.startswith("reply.")
    marketing = (
        job_board
        or (mail["unsubscribe"]
            and ({"CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"} & set(mail["labels"])
                 or has(ALERTE, norm(mail["subject"]))))
    )

    bruit = {"kind": "bruit", "label": "bruit", "app": None}
    if kind == "inscription":
        return bruit

    if app:
        if marketing and kind == "reponse":
            return bruit
        if mail["related"] or kind != "reponse":
            return {"kind": kind, "label": kind, "app": app}

    # Sans candidature identifiée : la nature de l'e-mail suffit à le ranger,
    # sans toucher au suivi des candidatures.
    if kind == "accuse":
        return {"kind": kind, "label": "accuse", "app": None}
    if marketing and kind not in ("refus", "entretien"):
        return bruit
    if kind in ("refus", "entretien", "action") and (mail["related"] or ats):
        return {"kind": kind, "label": kind, "app": None}
    if app or ambiguous or (mail["related"] and ats):
        return {"kind": kind, "label": "verifier", "app": None}

    return {"kind": None, "label": None, "app": None}


# ---------------------------------------------------------------- HTTP

def http_json(request, timeout=35):
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw.decode("utf-8")) if raw else {}


class ApiError(Exception):
    """Refus d'une API, avec l'étape et la raison donnée par le service (jamais le contenu d'un e-mail)."""

    def __init__(self, step, exc):
        self.code = exc.code
        reason = ""
        try:
            err = json.loads(exc.read().decode("utf-8"))
            err = err.get("error", err) if isinstance(err, dict) else err
            if isinstance(err, dict):
                reason = err.get("message", "")
                details = err.get("errors") or []
                if details and details[0].get("reason"):
                    reason += f" [{details[0]['reason']}]"
            else:
                reason = str(err)
        except Exception:
            pass
        super().__init__(f"{step} : HTTP {exc.code}" + (f" – {reason[:200]}" if reason else ""))


def api_json(request, step):
    try:
        return http_json(request)
    except HTTPError as exc:
        raise ApiError(step, exc) from None


def google_access_token():
    client_id = os.environ.get("GMAIL_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET", "").strip()
    refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN", "").strip()
    if not (client_id and client_secret and refresh_token):
        return None
    request = Request(
        TOKEN_URL,
        data=urlencode({
            "client_id": client_id, "client_secret": client_secret,
            "refresh_token": refresh_token, "grant_type": "refresh_token",
        }).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA},
        method="POST",
    )
    try:
        token = http_json(request).get("access_token")
    except HTTPError as exc:
        reason = ""
        try:
            reason = json.loads(exc.read().decode("utf-8")).get("error", "")
        except Exception:
            pass
        hint = (" → jeton révoqué ou expiré : régénère GMAIL_REFRESH_TOKEN avec gmail_token.py"
                " (et passe l'application Google en « Production » pour qu'il n'expire plus après 7 jours)."
                if reason == "invalid_grant" else "")
        raise SystemExit(f"Gmail : renouvellement OAuth refusé (HTTP {exc.code} {reason}){hint}")
    if not token:
        raise SystemExit("Gmail : réponse OAuth sans jeton d'accès.")
    return token


class Gmail:
    def __init__(self, token):
        self.token = token

    def call(self, path, body=None, method=None):
        method = method or ("POST" if body is not None else "GET")
        step = "Gmail " + method + " " + re.sub(r"/[0-9a-f]{10,}", "/…", path.split("?")[0])
        for attempt in range(len(RATE_WAITS) + 1):
            request = Request(
                GMAIL + path,
                data=json.dumps(body).encode("utf-8") if body is not None else None,
                headers={
                    "Authorization": "Bearer " + self.token, "User-Agent": UA,
                    **({"Content-Type": "application/json"} if body is not None else {}),
                },
                method=method,
            )
            try:
                return api_json(request, step)
            except ApiError as exc:
                # Gmail signale ses limites de débit (quota par minute) par un 429
                # ou un 403 « rateLimitExceeded » : on attend que la minute passe.
                if attempt == len(RATE_WAITS) or not (exc.code == 429 or "ateLimit" in str(exc)):
                    raise
                if attempt == 0:
                    print("Limite Gmail par minute atteinte : pause avant de continuer…")
                time.sleep(RATE_WAITS[attempt])

    def message_ids(self, query=None, label_id=None):
        ids, page = [], None
        while len(ids) < MAX_MESSAGES:
            params = {"maxResults": 100, **({"q": query} if query else {}),
                      **({"labelIds": label_id} if label_id else {}), **({"pageToken": page} if page else {})}
            data = self.call("/messages?" + urlencode(params))
            ids.extend(m["id"] for m in data.get("messages", []))
            page = data.get("nextPageToken")
            if not page:
                break
        return ids[:MAX_MESSAGES]

    def message(self, message_id):
        return self.call(f"/messages/{quote(message_id)}?format=full")

    def label_ids(self, names):
        existing = {l["name"]: l["id"] for l in self.call("/labels").get("labels", [])}
        for name in names:
            if name not in existing:
                created = self.call("/labels", {
                    "name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show",
                })
                existing[name] = created["id"]
        return existing

    def modify(self, message_id, add, remove):
        self.call(f"/messages/{quote(message_id)}/modify", {"addLabelIds": add, "removeLabelIds": remove})


def b64(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "replace")


def body_text(payload):
    """Texte de l'e-mail : partie texte brut, sinon HTML sans balises."""
    plain, rich = [], []

    def walk(part):
        mime = part.get("mimeType", "")
        data = (part.get("body") or {}).get("data")
        if data and mime == "text/plain":
            plain.append(b64(data))
        elif data and mime == "text/html":
            rich.append(b64(data))
        for sub in part.get("parts") or []:
            walk(sub)

    walk(payload)
    if plain:
        # Certains outils (SmartRecruiters…) laissent des entités HTML dans la partie texte : « r&eacute;ception ».
        return html.unescape("\n".join(plain))
    text = "\n".join(rich)
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", text)
    return html.unescape(re.sub(r"<[^>]+>", " ", text))


def parse_message(msg):
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    name, addr = parseaddr(headers.get("from", ""))
    return {
        "id": msg["id"],
        "at": int(msg.get("internalDate") or time.time() * 1000),
        "from_name": name or addr,
        "from_addr": addr.lower(),
        "subject": headers.get("subject", ""),
        "unsubscribe": "list-unsubscribe" in headers,
        "labels": msg.get("labelIds", []),
        "body": body_text(msg.get("payload", {}))[:20000],
    }


# ---------------------------------------------------------------- Gist

def gist_call(path, body=None):
    token = os.environ.get("ZCRT_GIST_TOKEN", "").strip()
    request = Request(
        "https://api.github.com" + path,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "User-Agent": UA,
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
        method="PATCH" if body is not None else "GET",
    )
    return api_json(request, "Gist " + ("PATCH" if body is not None else "GET") + " " + path.split("?")[0].split("/")[1])


def find_gist():
    known = os.environ.get("ZCRT_GIST_ID", "").strip()
    if known:
        return known
    for page in range(1, 6):
        found = gist_call(f"/gists?per_page=100&page={page}")
        for gist in found:
            if SYNC_FILE in (gist.get("files") or {}):
                return gist["id"]
        if len(found) < 100:
            break
    raise SystemExit(f"Gist de synchronisation introuvable ({SYNC_FILE}) : active d'abord la synchro sur le site.")


def read_gist(gist_id):
    gist = gist_call("/gists/" + gist_id)
    files = gist.get("files") or {}

    def content(name):
        f = files.get(name)
        if not f:
            return {}
        text = f.get("content", "")
        if f.get("truncated"):
            with urlopen(Request(f["raw_url"], headers={"User-Agent": UA}), timeout=35) as r:
                text = r.read().decode("utf-8")
        return json.loads(text or "{}")

    return content(SYNC_FILE), content(MAIL_FILE)


# ---------------------------------------------------------------- Mise à jour du suivi

def apply_to_entry(entry, mail, kind, now_ms):
    """Inscrit l'e-mail sur la candidature. Renvoie le nouveau statut s'il change."""
    if (entry.get("mailAt") or 0) > mail["at"]:
        return None  # une information plus récente est déjà inscrite
    entry["mailKind"] = kind
    entry["mailAt"] = mail["at"]
    entry["mailDate"] = time.strftime("%Y-%m-%d", time.localtime(mail["at"] / 1000))
    entry["mailSubject"] = mail["subject"][:140]
    entry["mailFrom"] = mail["from_name"][:80]
    entry["trackedAt"] = max(now_ms, (entry.get("trackedAt") or 0) + 1)
    new_status = {"entretien": "Entretien", "refus": "Refus"}.get(kind)
    if new_status and entry.get("status") != new_status:
        entry["status"] = new_status
        return new_status
    return None


def send_alert(lines, urgent):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not lines:
        return
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    owner, _, name = repo.partition("/")
    payload = {
        "topic": topic,
        "title": f"ZCRT : {len(lines)} réponse(s) d'entreprise",
        "message": "\n".join(lines[:15]),
        "tags": ["envelope"],
        "priority": 4 if urgent else 3,
    }
    if owner and name:
        payload["click"] = f"https://{owner}.github.io/{name}/"
    request = Request(
        "https://ntfy.sh/",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20):
            pass
        print("Alerte envoyée.")
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"Alerte non envoyée ({type(exc).__name__}).")


# ---------------------------------------------------------------- Programme

def applications_of(state):
    apps = []
    for entry in (state.get("entries") or {}).values():
        if entry.get("status") in APPLIED_STATUSES or (entry.get("appliedDate") and entry.get("status") != "Ignorée"):
            apps.append({**entry, "_key": company_key(entry.get("company"))})
    return apps


def reclassify(gmail, gist_id, applications, essai):
    """Repasse les e-mails déjà libellés (hors bruit) avec les règles actuelles :
    corrige leur libellé et rend son statut à une candidature passée à tort en Refus ou Entretien.
    Les accusés ne sont relus que pour réparer le statut : un libellé posé à la main n'est pas modifié."""
    labels = gmail.label_ids(sorted(LABELS.values()))
    found = {}
    for key in ("refus", "entretien", "reponse", "action", "verifier", "accuse"):
        for message_id in gmail.message_ids(label_id=labels[LABELS[key]]):
            found.setdefault(message_id, key)
    print(f"Reclassement : {len(found)} e-mail(s) déjà libellé(s) à revoir.")

    checked, changes = [], []
    for message_id, old in found.items():
        try:
            mail = parse_message(gmail.message(message_id))
        except ApiError as exc:
            if exc.code == 404:
                continue  # supprimé entre-temps
            raise
        d = classify(mail, applications)
        checked.append((mail, d))
        if d["label"] != old and old != "accuse":
            changes.append((mail, old, d))
    moves = {}
    for _, old, d in changes:
        key = f"{old}->{d['label'] or 'aucun'}"
        moves[key] = moves.get(key, 0) + 1
    print("Changements : " + (", ".join(f"{k} {v}" for k, v in sorted(moves.items())) or "aucun"))
    if essai:
        print("Mode essai : rien n'a été modifié.")
        return

    for mail, old, d in changes:
        add = [labels[LABELS[d["label"]]]] if d["label"] else []
        remove = [labels[LABELS[old]]]
        if d["label"] in ARCHIVED and "INBOX" in mail["labels"]:
            remove.append("INBOX")
        gmail.modify(mail["id"], add, remove)

    # Suivi : la candidature dont le statut venait de cet e-mail reprend « Candidature envoyée ».
    state, mail_state = read_gist(gist_id)
    entries = state.get("entries") or {}
    now_ms = int(time.time() * 1000)
    restored, changed = 0, False
    wrong_status = {"refus": "Refus", "entretien": "Entretien"}
    for mail, d in checked:
        for entry in entries.values():
            old = entry.get("mailKind")
            if entry.get("mailAt") != mail["at"] or not old or old == d["kind"]:
                continue
            if old in wrong_status and entry.get("status") == wrong_status[old] \
                    and d["kind"] not in wrong_status:
                entry["status"] = "Candidature envoyée"
                restored += 1
            if d["label"] and d["label"] not in ("bruit", "verifier"):
                entry["mailKind"] = d["kind"]
            else:
                for k in ("mailKind", "mailAt", "mailDate", "mailSubject", "mailFrom"):
                    entry.pop(k, None)
            entry["trackedAt"] = max(now_ms, (entry.get("trackedAt") or 0) + 1)
            changed = True

    # Onglet « Mails » du site : même libellé que dans Gmail (corrigé, ou posé à la main).
    mails = {m["id"]: m for m in mail_state.get("mails") or []}
    changed_ids = {mail["id"] for mail, _, _ in changes}
    for mail, d in checked:
        if mail["id"] not in mails:
            continue
        label = d["label"] if mail["id"] in changed_ids else found[mail["id"]]
        if label and label != "bruit":
            mails[mail["id"]].update({"label": label, "kind": d["kind"] if label == d["label"] else label})
        else:
            del mails[mail["id"]]
    mail_state["mails"] = sorted(mails.values(), key=lambda m: m["at"], reverse=True)[:MAILS_KEEP]
    mail_state["lastRun"] = now_ms

    files = {MAIL_FILE: {"content": json.dumps(mail_state, ensure_ascii=False)}}
    if changed:
        state["entries"] = entries
        state["updatedAt"] = now_ms
        files[SYNC_FILE] = {"content": json.dumps(state, ensure_ascii=False)}
    gist_call("/gists/" + gist_id, {"files": files})
    print(f"{len(changes)} libellé(s) corrigé(s), {restored} candidature(s) remise(s) en « Candidature envoyée ».")


def main():
    parser = argparse.ArgumentParser(description="Tri des e-mails de candidature ZCRT.")
    parser.add_argument("--essai", action="store_true", help="ne rien modifier")
    parser.add_argument("--reclasser", action="store_true",
                        help="repasser les e-mails déjà libellés avec les règles actuelles")
    parser.add_argument("--jours", type=int, default=3, help="e-mails des N derniers jours")
    parser.add_argument("--detail", action="store_true", help="afficher chaque décision (local seulement)")
    args = parser.parse_args()
    if args.detail and os.environ.get("GITHUB_ACTIONS"):
        raise SystemExit("--detail est refusé dans GitHub Actions : les journaux d'un dépôt public sont visibles de tous.")

    token = google_access_token()
    if not token:
        print("Tri Gmail ignoré : secrets GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN absents.")
        return
    if not os.environ.get("ZCRT_GIST_TOKEN", "").strip():
        print("Tri Gmail ignoré : secret ZCRT_GIST_TOKEN absent (jeton GitHub avec accès aux gists).")
        return

    gmail = Gmail(token)
    gist_id = find_gist()
    state, mail_state = read_gist(gist_id)
    applications = applications_of(state)
    if args.reclasser:
        reclassify(gmail, gist_id, applications, args.essai)
        return
    processed = list(mail_state.get("processed") or [])
    seen = set(processed)

    query = f"newer_than:{max(1, args.jours)}d -in:sent -in:drafts -in:chats -in:spam -in:trash -from:me"
    ids = [i for i in gmail.message_ids(query) if i not in seen]
    print(f"{len(applications)} candidature(s) suivie(s), {len(ids)} nouvel(s) e-mail(s) à examiner.")

    decisions = []
    for message_id in ids:
        mail = parse_message(gmail.message(message_id))
        decisions.append((mail, classify(mail, applications)))
    decisions.sort(key=lambda d: d[0]["at"])  # les plus anciens d'abord : le dernier e-mail l'emporte

    counts = {}
    for mail, d in decisions:
        counts[d["label"] or "ignore"] = counts.get(d["label"] or "ignore", 0) + 1
        if args.detail:
            target = f"{d['app'].get('company')} — {d['app'].get('title')}" if d["app"] else "-"
            print(f"[{d['label'] or 'ignoré':9}] {mail['from_name'][:30]:30} | {mail['subject'][:60]:60} | {target}")
    print("Décisions : " + (", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "aucune"))

    if args.essai:
        print("Mode essai : rien n'a été modifié.")
        return

    # Gmail : libellés et archivage du bruit (jamais de suppression).
    labels = gmail.label_ids(sorted({LABELS[d["label"]] for _, d in decisions if d["label"]}))
    for mail, d in decisions:
        if d["label"]:
            remove = ["INBOX"] if d["label"] in ARCHIVED and "INBOX" in mail["labels"] else []
            gmail.modify(mail["id"], [labels[LABELS[d["label"]]]], remove)
        processed.append(mail["id"])

    # Suivi : relu juste avant l'écriture pour ne pas écraser une modification faite sur le site.
    state, mail_state = read_gist(gist_id)
    entries = state.get("entries") or {}
    now_ms = int(time.time() * 1000)
    alerts, urgent, changed = [], False, False
    for mail, d in decisions:
        if not d["app"]:
            # Entretien ou démarche demandée sans candidature suivie : signalé quand même.
            if d["label"] in ("entretien", "action"):
                alerts.append(f"• {KIND_NAMES[d['kind']]} — {mail['from_name'][:60]} (candidature non suivie)")
                urgent = urgent or d["kind"] == "entretien"
            continue
        entry = entries.get(d["app"]["id"])
        if not entry:
            continue
        before = entry.get("mailAt")
        new_status = apply_to_entry(entry, mail, d["kind"], now_ms)
        changed = changed or entry.get("mailAt") != before
        if d["kind"] in ("entretien", "refus", "reponse", "action") and entry.get("mailAt") == mail["at"]:
            alerts.append(f"• {KIND_NAMES[d['kind']]} — {entry.get('company')} ({entry.get('title')})")
            urgent = urgent or d["kind"] == "entretien"
        if new_status:
            print(f"Statut mis à jour : {new_status}.")
    to_check = counts.get("verifier", 0)
    if to_check:
        alerts.append(f"• {to_check} e-mail(s) à vérifier (libellé {LABELS['verifier']})")

    # Liste affichée par le site : objet, expéditeur et date seulement (jamais le texte de l'e-mail).
    mails = {m["id"]: m for m in mail_state.get("mails") or []}
    for mail, d in decisions:
        if not d["label"] or d["label"] == "bruit":
            continue
        mails[mail["id"]] = {
            "id": mail["id"], "at": mail["at"],
            "date": time.strftime("%Y-%m-%d", time.localtime(mail["at"] / 1000)),
            "from": mail["from_name"][:80], "subject": mail["subject"][:140],
            "label": d["label"], "kind": d["kind"],
            **({"appId": d["app"]["id"], "company": d["app"].get("company"), "title": d["app"].get("title")}
               if d["app"] else {}),
        }
    account = mail_state.get("account") or gmail.call("/profile").get("emailAddress", "")
    files = {MAIL_FILE: {"content": json.dumps({
        "version": 1, "lastRun": now_ms, "account": account,
        "processed": processed[-PROCESSED_KEEP:],
        "mails": sorted(mails.values(), key=lambda m: m["at"], reverse=True)[:MAILS_KEEP],
    }, ensure_ascii=False)}}
    if changed:
        state["entries"] = entries
        state["updatedAt"] = now_ms
        files[SYNC_FILE] = {"content": json.dumps(state, ensure_ascii=False)}
    gist_call("/gists/" + gist_id, {"files": files})
    print(f"Suivi enregistré ({'candidatures mises à jour' if changed else 'aucune candidature modifiée'}).")

    send_alert(alerts, urgent)


if __name__ == "__main__":
    try:
        main()
    except ApiError as exc:
        sys.exit(f"Tri Gmail interrompu ({exc}).")
    except (HTTPError, URLError, TimeoutError) as exc:
        code = getattr(exc, "code", "")
        sys.exit(f"Tri Gmail interrompu ({type(exc).__name__} {code}).")
