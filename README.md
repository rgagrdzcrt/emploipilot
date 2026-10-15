# ZCRT — recherche d’emploi

Site statique hébergé sur GitHub Pages, avec collecte planifiée toutes les 6 heures et offres stockées dans `offres.json`. Les candidatures restent **100 % manuelles** : aucun connecteur n’envoie de candidature.

## Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.html` | Site, filtres et suivi des candidatures. |
| `collect.py` | Collecte, filtrage, fusion, déduplication et purge des offres. |
| `sources.json` | Requêtes et identifiants des sources publiques. |
| `.github/workflows/collect.yml` | Collecte automatique et lancement manuel. |
| `offres.json` | Offres collectées et historique conservés par le collecteur. |

## Sources intégrées

### Jooble

Recherche généraliste configurée par métier dans `sources.json`. La clé reste dans le secret GitHub `JOOBLE_API_KEY`.

### France Travail

Connecteur officiel déjà présent. Il utilise les secrets `FT_CLIENT_ID` et `FT_CLIENT_SECRET`; les départements et métiers interrogés sont réglables dans `sources.json`. L’absence des secrets désactive cette source sans interrompre les autres.

### Adzuna

Recherche généraliste en France pour la logistique, la mise en rayon et la vente. Elle nécessite les secrets GitHub `ADZUNA_APP_ID` et `ADZUNA_APP_KEY`. Ne les inscris jamais dans les fichiers du dépôt ni dans une conversation. Chaque offre affichée porte le crédit Adzuna demandé par ses conditions d’utilisation.

### Joblet

Connecteur MCP officiel en lecture seule, appelé par le collecteur toutes les 6 heures. Il ne demande ni compte ni clé API. Les recherches couvrent le stock et les rayons en Île-de-France, ainsi que la vente à Paris. Le collecteur ne conserve que les annonces dont le métier correspond à la requête et dont le lieu indique clairement la France ou l’Île-de-France ; cela écarte les homonymes étrangers comme Paris, en Virginie. Seuls les champs utiles sont enregistrés (pas la description complète), avec un lien vers l’annonce d’origine.

### Workopia

Connecteur MCP officiel, avec recherche en France et liens vers les annonces. Workopia exige une autorisation OAuth : ce n’est pas une clé API et la connexion du plugin ChatGPT ne peut pas être réutilisée dans GitHub Actions. Pour l’activer dans le collecteur, il faut configurer les secrets GitHub `WORKOPIA_CLIENT_ID` et `WORKOPIA_REFRESH_TOKEN`. Si ces secrets sont absents ou expirés, le collecteur ignore Workopia sans interrompre les autres sources. Les jetons ne sont jamais écrits dans `offres.json` ni affichés dans les journaux ; si Workopia fait tourner le jeton de renouvellement, le secret GitHub devra être actualisé. Seuls les champs utiles de l’annonce sont conservés, avec son lien d’origine.

### Greenhouse, Lever, SmartRecruiters et Ashby

Ces API publiques donnent accès aux annonces publiées par **un employeur à la fois**. Elles ne font pas de recherche globale multi-entreprises. SmartRecruiters est déjà configuré pour les deux tableaux publics du Groupement Mousquetaires et pour Courir, avec une recherche limitée à la région Île-de-France. Les annonces passent ensuite par les filtres de métier et de contrat du collecteur. Pour les autres plateformes, aucun employeur n'est activé tant qu'un tableau public pertinent n'a pas été vérifié et ajouté à `sources.json` :

- Greenhouse : `greenhouse.boards`, avec le nom de l’employeur et son identifiant de tableau.
- Lever : `lever.sites`, avec le nom de l’employeur, son identifiant de site et, si nécessaire, la région `eu`.
- SmartRecruiters : `smartRecruiters.companies`, avec le nom et l’identifiant de carrière.
- Ashby : `ashby.boards`, avec le nom du tableau d’emploi et le nom d’affichage de l’entreprise.

L’identifiant est la partie qui suit le domaine de la page carrière : par exemple `entreprise` dans `jobs.lever.co/entreprise`, ou `entreprise` dans `jobs.ashbyhq.com/entreprise`. Pour Greenhouse, c’est le nom après `boards.greenhouse.io/`; pour SmartRecruiters, celui après `careers.smartrecruiters.com/`.

Les identifiants d’employeurs sont publics et ne sont pas des clés API. Les recherches d’entreprise sont limitées à la France et à l’Île-de-France lorsqu’elles le permettent. Les offres passent par les mêmes filtres de métier, de contrat et d’exclusion des stages que les autres.

### Flux RSS/Atom

Des flux autorisés peuvent être ajoutés à `feeds`. Le collecteur ne visite pas les pages de sites d’emploi et ne récupère pas d’annonces par scraping.

## Ce que fait le collecteur

- Il normalise les dates et repère le département en Île-de-France quand le lieu le permet.
- Il déduplique par URL et par contenu (poste, entreprise et lieu).
- Lors d’une fusion, il conserve le statut et les dates de candidature déjà enregistrés.
- Il retire une annonce publiée depuis plus de 45 jours seulement si elle n’a pas été revue depuis plus de 30 jours. Une annonce sans date connue est retirée uniquement si elle n’a pas été revue depuis plus de 30 jours.
- Il exclut les stages et l’alternance, et garde les contrats indéterminés avec le statut « À vérifier ».

Le site garde également les notes, statuts et dates de candidature dans le navigateur. Pense à exporter une sauvegarde régulièrement.

## Tri des e-mails (Gmail)

`mail.py`, lancé toutes les heures par `.github/workflows/mail.yml`, lit les e-mails reçus et les rapproche des candidatures suivies dans le gist de synchronisation. Il fonctionne par règles, sans IA.

| Libellé Gmail | Quand | Boîte de réception |
|---|---|---|
| `ZCRT/Entretien` | Convocation, demande de disponibilités | Gardé ; statut passé à « Entretien » |
| `ZCRT/Refus` | Refus | Gardé ; statut passé à « Refus » |
| `ZCRT/Réponse` | Autre message de l'entreprise | Gardé ; plus de relance automatique |
| `ZCRT/Accusé` | Accusé de réception | Archivé |
| `ZCRT/À vérifier` | Lié à une candidature, mais entreprise inconnue ou ambiguë | Gardé |
| `ZCRT/Bruit` | Alertes d'offres, lettres d'information, publicités | Archivé |

Les autres e-mails ne sont pas touchés. **Aucun e-mail n'est supprimé** : le droit demandé (`gmail.modify`) permet seulement de lire, libeller et archiver. Une alerte ntfy signale chaque réponse d'entreprise, et l'onglet Candidatures affiche le dernier e-mail reçu. L'onglet **Mails** liste les 300 derniers e-mails triés (hors bruit) : objet, expéditeur, date, candidature liée et lien vers Gmail. Le texte des e-mails n'est jamais copié.

Le dépôt étant public, rien n'est écrit dans le dépôt : l'état du tri reste dans le gist secret (`zcrt-mail.json`), et les journaux GitHub Actions n'affichent que des compteurs.

### Mise en place

1. Dans [Google Cloud Console](https://console.cloud.google.com), crée un projet et active **Gmail API**.
2. Configure l'écran de consentement OAuth (type « Externe », ton adresse en utilisateur test), puis **publie l'application en production**. En mode test, le jeton expire au bout de 7 jours.
3. Crée un identifiant OAuth de type **Application de bureau** et télécharge son JSON (ne le commite pas).
4. Sur ton PC : `python gmail_token.py client_secret.json`, puis accepte dans le navigateur.
5. Ajoute les secrets GitHub `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` et `ZCRT_GIST_TOKEN` (le même jeton GitHub « gist » que pour la synchro du site). `ZCRT_GIST_ID` est facultatif.
6. Premier passage : **Actions → Tri des e-mails → Run workflow** avec « Mode essai » coché et 30 jours, pour voir les compteurs sans rien modifier.

En local, `python mail.py --essai --jours 30 --detail` affiche chaque décision (expéditeur, objet, candidature rapprochée), avec les mêmes variables d'environnement.

## Lancer la collecte

Dans GitHub, ouvre **Actions → Collecte des offres → Run workflow**. Le workflow tourne aussi automatiquement toutes les 6 heures. Sans secrets, les connecteurs qui en ont besoin sont ignorés et les connecteurs d’entreprise sans identifiant ne font aucun appel.

## Limites

- Adzuna demande des identifiants et impose un crédit visible pour chaque annonce affichée.
- Joblet est une recherche publique sans clé ; ses résultats ont un filtrage strict de la catégorie et du lieu avant ajout.
- Workopia demande un renouvellement OAuth durable. Il est ignoré tant que les deux secrets dédiés ne sont pas configurés.
- Greenhouse, Lever et Ashby restent inactifs faute d'employeurs pertinents configurés. SmartRecruiters est actif pour les tableaux Groupement Mousquetaires et Courir.
- La Bonne Alternance est une API réelle, mais elle ne fournit que des offres en alternance. Elle n’est pas ajoutée au collecteur puisque ce site exclut actuellement l’alternance.
- Les pages GitHub Actions planifiées peuvent être retardées; un workflow inactif peut nécessiter un lancement manuel.

## Documentation officielle

- [Adzuna — recherche](https://developer.adzuna.com/docs/search) et [conditions d’utilisation](https://developer.adzuna.com/docs/terms_of_service)
- [Greenhouse — Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever — Postings API](https://github.com/lever/postings-api)
- [SmartRecruiters — API publique des annonces](https://developers.smartrecruiters.com/docs/endpoints)
- [Ashby — Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [France Travail — portail développeurs](https://francetravail.io)
- [Joblet — connecteur MCP officiel](https://joblet.ai/grok-connector)
- [Workopia — serveur MCP officiel et OAuth](https://github.com/workopia/workopia-mcp)
- [La Bonne Alternance — API](https://api.apprentissage.beta.gouv.fr/fr/explorer)
