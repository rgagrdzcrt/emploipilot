# EmploiPilot — kit de démarrage gratuit

Ce kit prépare une architecture gratuite au maximum : site statique (GitHub Pages), collecte planifiée (GitHub Actions) et fichier JSON versionné pour mémoriser les annonces et éviter les doublons.

## Important : ce qui fonctionne / ce qui ne fonctionne pas encore

- `index.html` est le prototype EmploiPilot. En ligne, il peut importer `data/offres.json`.
- Le collecteur sait lire les flux RSS/Atom que vous êtes autorisé à utiliser, dédupliquer les URL et classer les offres.
- Le workflow peut tourner toutes les six heures et publier le JSON mis à jour.
- **Aucune source n'est préconnectée dans ce kit.** Le fichier `sources.json` est volontairement vide. Il faut ajouter des flux/API autorisés.
- Indeed, HelloWork, JobiJoba et FashionJobs ne proposent pas nécessairement un accès candidat universel à leurs données. N'utilisez que les API/flux auxquels vous avez accès et respectez leurs conditions. Le connecteur de recherche Indeed disponible dans ChatGPT n'est pas une clé API pour ce site.
- Sans accès officiel à un flux ou une API, le collecteur ne peut pas aspirer automatiquement les pages protégées. Le kit ne contourne pas les protections anti-robot.
- Le suivi de candidature du prototype est conservé dans le navigateur (`localStorage`), pas dans le JSON distant. Exportez régulièrement une sauvegarde depuis EmploiPilot.

## Étapes à effectuer

### 1. Créer un compte GitHub

1. Allez sur https://github.com/ et créez un compte gratuit si nécessaire.
2. Créez un nouveau dépôt nommé `emploipilot`. Pour une mise en route simple, choisissez **Public** (le code et les offres collectées seront publics). Si vous ne souhaitez pas rendre ces données publiques, choisissez Private, mais vérifiez les quotas GitHub Pages et Actions de votre compte avant de compter sur une utilisation gratuite.
3. Décompressez ce kit sur votre ordinateur, puis importez tous les fichiers dans le dépôt. Vous pouvez utiliser l'interface GitHub « Add file » ou GitHub Desktop.

### 2. Activer le site

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, choisissez `main` et `/ (root)`, puis Save. Attendez que GitHub affiche l'URL du site. La page est consultable en ligne à cette URL.

### 3. Configurer les sources autorisées

Éditez `sources.json`. Pour chaque source, ajoutez un flux RSS/Atom public ou une API dont vous avez obtenu l'autorisation. Exemple de structure :

```json
{
  "feeds": [
    {
      "name": "Flux partenaire autorisé",
      "url": "https://EXEMPLE-AUTORISE/flux.xml",
      "enabled": true
    }
  ]
}
```

Remplacez impérativement l'URL d'exemple par une URL réelle autorisée. Ne mettez jamais de clé API dans ce fichier. Si une API exige un secret, il faut ajouter un connecteur spécifique au script et enregistrer la clé dans **Settings → Secrets and variables → Actions**. Ne partagez pas vos mots de passe de sites d'emploi.

Pour JobiJoba, demandez l'accès via son programme officiel d'intégration/affiliation : https://www.jobijoba.com/fr/affiliation-offres-emploi . Pour les autres sites, vérifiez directement s'ils vous accordent un flux ou un accès API. N'activez pas de collecte robotisée d'un site qui l'interdit.

### 4. Tester manuellement le collecteur

Sur votre ordinateur, avec Python 3.11 ou plus récent :

```bash
python scripts/collect.py
```

Le script écrit `data/offres.json`. Avec `sources.json` vide, le résultat sera simplement une liste vide.

### 5. Activer la veille toutes les six heures

Dans GitHub, ouvrez **Actions** et activez les workflows si demandé. Le workflow `Collecte des offres` s'exécute à 00 h, 06 h, 12 h et 18 h UTC, et peut être lancé manuellement avec **Run workflow**. Les horaires peuvent être décalés par rapport à l'heure française en été/hiver ; GitHub peut aussi retarder les déclenchements planifiés.

### 6. Vérifier les résultats

Après une exécution réussie, ouvrez `data/offres.json` dans le dépôt. Les annonces importées depuis ce fichier apparaîtront sur le site hébergé. Vérifiez toujours le lien et les critères de contrat avant de postuler.

## Catégories et critères

- `stock` : stock, logistique, magasinier, préparation de commandes, approvisionnement.
- `rayon` : mise en rayon, employé libre-service, réassort, grande distribution.
- `vente` : vente en boutique, prêt-à-porter, conseiller de vente.
- `interim` : missions d'intérim, conservées dans une catégorie séparée.

Le collecteur écarte les stages et l'alternance. Il ne garde que les contrats qu'il peut identifier de façon raisonnable comme CDI, CDD ou intérim ; les offres au contrat indéterminé sont mises de côté pour éviter de présenter un type de contrat inventé. Les classifications automatiques restent imparfaites : vérifiez l'annonce d'origine.

## Limites gratuites

- GitHub Actions offre un quota gratuit mensuel selon le type de dépôt et le compte ; les quotas peuvent changer. Les dépôts publics bénéficient généralement d'un usage gratuit des exécuteurs standards, sous réserve des politiques GitHub.
- GitHub Pages héberge un site statique ; il ne fournit pas un serveur Python permanent.
- Ce kit stocke les résultats dans Git, sans base de données distincte. C'est suffisant pour un prototype personnel de petite taille, mais moins adapté à plusieurs utilisateurs ou à des données sensibles.
- Les flux RSS ne donnent que les champs fournis par leur éditeur. Ils peuvent manquer la date, la localisation ou le type de contrat.
- Les liens peuvent expirer et les sites peuvent modifier leurs flux/API.
- La fréquence « toutes les six heures » est une demande de planification, pas une garantie d'exécution à la minute près.
