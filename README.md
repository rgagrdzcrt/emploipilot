# EmploiPilot — recherche d'emploi (logistique, rayon, vente)

Outil personnel : site statique (GitHub Pages), collecte planifiée toutes les 6 heures (GitHub Actions), offres stockées dans `offres.json` (versionné) pour mémoriser les annonces, éviter les doublons et conserver le suivi des candidatures. Les candidatures restent **100 % manuelles** — rien n'est jamais envoyé automatiquement.

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Site complet (dashboard, filtres, suivi des candidatures, export). |
| `collect.py` | Collecteur : Jooble, API France Travail, flux RSS/Atom autorisés. |
| `sources.json` | Configuration des sources (requêtes Jooble, France Travail, flux RSS). |
| `.github/workflows/collect.yml` | Cron toutes les 6 h + lancement manuel (**Run workflow**). |
| `offres.json` | Base d'offres versionnée, écrite par le collecteur. |

## Sources d'offres

### Jooble (déjà actif)
Clé API dans le secret GitHub `JOOBLE_API_KEY`. Depuis `sources.json`, la collecte est découpée en **une requête par métier** (stock-logistique, rayon, vente) pour une meilleure couverture ; tu peux ajuster mots-clés, zone, rayon ou désactiver une requête avec `"enabled": false`.

### API France Travail (nouveau, à activer)
Source officielle et gratuite : https://francetravail.io — crée une application avec le produit **« Offres d'emploi v2 »**, puis enregistre deux secrets dans **Settings → Secrets and variables → Actions** :

- `FT_CLIENT_ID`
- `FT_CLIENT_SECRET`

Tant que ces secrets sont absents, le collecteur ignore simplement cette source (message dans les logs). Les départements interrogés sont configurables dans `sources.json` (`franceTravail.departements`, par défaut 75 et 93).

### Flux RSS/Atom autorisés
Ajoute-les dans `sources.json` → `feeds`. N'ajoute que des flux dont tu as le droit d'usage ; jamais de clé API dans ce fichier.

## Ce que fait le collecteur

- **Dates normalisées** en ISO ; le site trie par date de publication et affiche « il y a X jours ».
- **Filtre de fraîcheur** côté site : 24 h / 7 jours / 30 jours.
- **Déduplication robuste** : clé URL (sans fragment ni `/` final) **puis** clé de contenu (poste + entreprise + lieu normalisés) — les doublons inter-sources et les URLs de tracking Jooble sont rattrapés.
- **Département détecté** (`dept`) depuis le lieu ; le site filtre par département (75, 93, 92, 94, grande couronne…).
- **Purge automatique** : une offre est retirée si sa publication date de plus de 45 jours **et** si elle n'a plus été revue par une source depuis 30 jours. Les statuts et dates de candidature sont toujours conservés d'une exécution à l'autre.
- **Stages/alternances exclus** ; contrats classés CDI / CDD / Intérim / « À vérifier » (à contrôler dans l'annonce).

## Suivi des candidatures

Les statuts, notes et dates de candidature sont enregistrés dans ton navigateur (`localStorage`) et fusionnés avec les offres collectées à chaque visite. **Exporte une sauvegarde JSON régulièrement** (onglet *Export & alertes*) ; le site te le rappelle tous les 30 jours. Si tu modifies les notes d'une offre collectée, ta version est conservée.

## Tester le collecteur en local

Avec Python 3.11+ :

```bash
python collect.py
```

Sans secrets, Jooble et France Travail sont ignorés ; le fichier `offres.json` est simplement consolidé (fusion + purge).

## Limites connues

- GitHub peut retarder les déclenchements planifiés ; les workflows inactifs 60 jours peuvent être désactivés (relance-les via **Run workflow**).
- Les flux RSS ne fournissent que les champs publiés par leur éditeur (date ou lieu parfois absents).
- GitHub Pages est statique : aucun serveur, aucune base de données. Suffisant pour un usage personnel.
- Vérifie toujours le lien, le contrat et la date d'une annonce avant de postuler.
