#!/usr/bin/env python3
"""
ZCRT — obtenir le jeton durable Gmail (GMAIL_REFRESH_TOKEN), une seule fois, sur ton PC.

1. Google Cloud Console : crée un projet, active « Gmail API », configure l'écran de
   consentement (type Externe, ton adresse en utilisateur test), puis crée un
   identifiant OAuth de type « Application de bureau » et télécharge son JSON.
2. Lance :  python gmail_token.py chemin/vers/client_secret.json
3. Connecte-toi dans le navigateur et accepte. Le script affiche les trois valeurs
   à coller dans les secrets GitHub (Settings → Secrets and variables → Actions).

Ne commite jamais le fichier JSON ni le jeton : ils donnent accès à ta boîte mail.
Droit demandé : gmail.modify (lire, libeller, archiver ; pas de suppression définitive).
"""

import sys
import json
import base64
import hashlib
import secrets
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/gmail.modify"


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage : python gmail_token.py client_secret.json")
    with open(sys.argv[1], encoding="utf-8") as f:
        client = json.load(f)
    client = client.get("installed") or client.get("web") or client
    client_id, client_secret = client["client_id"], client["client_secret"]

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            params = parse_qs(urlparse(self.path).query)
            if params.get("state", [""])[0] == state:
                result.update({k: v[0] for k, v in params.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            ok = "code" in result
            self.wfile.write(("<p>C'est bon, tu peux fermer cet onglet.</p>" if ok
                              else "<p>Autorisation refusée ou invalide.</p>").encode("utf-8"))

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_port}"
    url = AUTH_URL + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })
    print("Ouverture du navigateur… Si rien ne s'ouvre, colle ce lien :\n" + url + "\n")
    webbrowser.open(url)
    while "code" not in result and "error" not in result:
        server.handle_request()
    if "error" in result:
        raise SystemExit("Autorisation refusée : " + result["error"])

    request = Request(TOKEN_URL, data=urlencode({
        "client_id": client_id, "client_secret": client_secret, "code": result["code"],
        "code_verifier": verifier, "grant_type": "authorization_code", "redirect_uri": redirect,
    }).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    with urlopen(request, timeout=30) as response:
        token = json.loads(response.read().decode("utf-8"))
    if "refresh_token" not in token:
        raise SystemExit("Google n'a pas renvoyé de jeton durable : retire l'accès de l'appli dans ton compte Google et relance.")

    print("Secrets GitHub à créer :")
    print("  GMAIL_CLIENT_ID     =", client_id)
    print("  GMAIL_CLIENT_SECRET =", client_secret)
    print("  GMAIL_REFRESH_TOKEN =", token["refresh_token"])


if __name__ == "__main__":
    main()
