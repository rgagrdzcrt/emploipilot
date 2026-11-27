/* ZCRT — profils (Ryan / Zia) sur le même site.
 *
 * Chaque profil a ses propres données sur l'appareil (offres suivies, critères,
 * modèles, synchro) grâce à un suffixe sur les clés du navigateur, ses métiers
 * et ses modèles de lettre. Toucher le logo (RGRD pour Ryan, ZCRT pour Zia)
 * bascule de l'un à l'autre.
 *
 * Chargé dans <head>, avant tous les autres scripts.
 */

const ZCRT_PROFILE_KEY = 'zcrt_active_profile';

/** Métiers connus du site (catégories calculées par collect.py). */
const CAT_INFO = {
  stock: { label: 'Stock & logistique', icon: 'package' },
  preparation: { label: 'Préparation de commandes', icon: 'clipboard' },
  encadrement: { label: 'Encadrement en magasin', icon: 'user' },
  aeroport: { label: 'Logistique aéroport', icon: 'plane' },
  tri: { label: 'Tri de colis', icon: 'scan' },
  rayon: { label: 'Magasins & grande distribution', icon: 'cart' },
  vente: { label: 'Vente', icon: 'tag' },
  restauration: { label: 'Restauration & café', icon: 'cup' },
};

const ZCRT_PROFILES = {
  ryan: {
    id: 'ryan',
    name: 'Ryan',
    brand: 'RGRD',               // logo affiché sur ce profil
    // Encadrement : CV « rayon » (chef de rayon chez Monoprix, référent chez E.Leclerc), comme la lettre.
    cv: {
      stock: 'CV_Ryan_Gazard_stock.pdf', tri: 'CV_Ryan_Gazard_stock.pdf', encadrement: 'CV_Ryan_Gazard_rayon.pdf',
    },
    ns: '',                      // clés historiques, sans suffixe
    syncFile: 'zcrt-suivi.json', // lu aussi par mail.py (tri Gmail)
    // Profil recentré sur la logistique (13/11/2026) : rayon et vente ne sont plus affichés ici
    // (ils restent collectés pour le profil de Zia, "categories" dans sources.json).
    // Onglets ajoutés le 21/11/2026 : préparation de commandes (détachée du stock), encadrement
    // en magasin, logistique aéroport, tri (sans inventoriste depuis le 21/11/2026).
    // Préparation de commandes et logistique aéroport retirées le 27/11/2026 (offres sans intérêt pour
    // Ryan) : plus collectées (sources.json), ni versées dans l'onglet Stock (collect.py, prep_named_first).
    cats: ['stock', 'encadrement', 'tri'],
    tag: 'Logistique & magasin',  // étiquette du bandeau d'accueil
    // Tri au doigt : préparateur de commandes en dernier (surqualifié, gardé en solution de repli).
    // Remplacé par les niveaux ci-dessous (tiers), qui le mettent aussi en repli.
    triageLastTitles: /pr[eé]parat(?:eur|rice) de commandes/i,
    // Niveaux d'intérêt (26/11/2026, pilot.js, tierOf) : ★ cœur de cible en tête du tri, de la file et
    // de la liste ; repli en dernier. Tirés des choix de Ryan (733 offres triées) : aéroport 71 %
    // d'envoyées, gestionnaire ou coordinateur de stock 48 %, stockiste et réserve 46 %, coordinateur
    // ou responsable logistique 46 % ; magasinier 27 % (bon) ; préparateur 25 %, agent ou opérateur
    // logistique 20 %, chef ou manager de rayon 0 sur 27 (repli). Stockistes (STOCKISTE_RE) : cœur.
    // Recherche pilotée par le CV (26/11/2026, choix de Ryan) : cœur = stockiste, agent de stock,
    // coordinateur ou gestionnaire de stock, logisticien, et dans la santé ou chez les logisticiens
    // (prestataires) les postes de logistique et de magasin ; plus d'aéroport depuis le 27/11/2026 ;
    // sous minFit points d'adéquation au CV (pilot.js, cvFit), une offre « bon » passe en repli.
    tiers: {
      repliCats: ['tri', 'encadrement'],
      coeur: /stockist|stockman|r[eé]assort|(?:gestionnaire|coordinat|responsable|charg[eé]|contr[oô]l|adjoint|assistant|technicien|agent|employ[eé])\S*(?:\s+\S+){0,3}?\s+(?:de\s+|des\s+|du\s+|en\s+|aux\s+)?stocks?\b|stock\s+(?:manager|controller|associate)|logisticien/i,
      coeurSectors: {
        // Pas « Agent de service logistique » (EHPAD, hôpital : entretien et repas).
        sante: /(?:responsable|coordinat|technicien|chef|adjoint)\S*(?:\s+\S+){0,3}?\s+(?:de\s+|en\s+)?logisti|logisticien|gestionnaire|magasini|stock/i,
        logisticiens: /magasini|stock|gestionnaire|coordinat|chef\s+d['’ ]\s*[eé]quipe|logisticien/i,
      },
      // Référent logistique (et approvisionnement) et économe : ajoutés le 27/11/2026.
      bon: /magasini|[eé]conome|(?:coordinat|responsable|assistant|gestionnaire|r[eé]f[eé]rent|chef\s+d['’ ]\s*[eé]quipe|adjoint|technicien)\S*(?:\s+\S+){0,2}?\s+(?:de\s+|en\s+)?logisti/i,
      repli: /pr[eé]parat|\btri\b|trieu|manutention|(?:agent|op[eé]rat|employ[eé])\S*(?:\s+\S+){0,2}?\s+(?:de\s+|en\s+)?logisti|\bextras?\b/i,
      minFit: 20,
    },
    // Secteurs (26/11/2026, pilot.js, sectorOf) : le premier qui reconnaît le titre, l'entreprise ou le lieu
    // (re), ou une expression sûre de la description (text). Ryan : santé et logisticiens recherchés,
    // aéroport plus recherché (27/11/2026), grande distribution masquée (2 candidatures sur 85 offres vues).
    sectors: [
      { id: 'sante', label: 'Santé',
        // Prestataires de santé à domicile (PSAD) et matériel médical ajoutés le 27/11/2026 (SANTE_RE dans collect.py).
        re: /h[oô]pita|hospitali|clinique|\bap-?hp\b|\bghu\b|\bchu\b|ehpad|maternit|m[eé]dical|m[eé]dico|pharma|\bsant[eé]\b|laborato|biolog|\bhad\b|dialyse|radiolog|institut curie|gustave roussy|fondation (?:rothschild|adolphe)|croix.rouge|korian|orpea|emeis|ramsay|elsan|vivalto|sanofi|servier|ipsen|biogaran|alliance healthcare|\bcerp\b|orkyn|vitalaire|linde homecare|sos oxyg|elivie|\bpsad\b|orthop/i,
        text: /[eé]tablissements? de sant[eé]|milieu hospitalier|secteur (?:hospitalier|m[eé]dical|de la sant[eé]|pharmaceutique)|dispositifs? m[eé]dicaux|mat[eé]riel m[eé]dical|produits? pharmaceutiques?|industrie pharmaceutique|r[eé]partiteur pharmaceutique|prestataires? de sant[eé] [aà] domicile/i },
      { id: 'logisticiens', label: 'Logisticien (prestataire)',
        re: /geodis|id logistics|fm logistic|kuehne|\bdhl\b|\bxpo\b|\bgxo\b|rhenus|\bstef\b|arvato|\bceva\b|dachser|schenker|bollor[eé] logistics|gefco|ziegler|heppner|viapost|\bmory\b|daher|norbert dentressangle|logista\b|bansard|clasquin/i,
        text: /prestataire logistique|acteur (?:majeur|cl[eé]) de la logistique|leader (?:europ[eé]en|mondial|fran[cç]ais) de la logistique|logisticien de premier plan/i },
      { id: 'aeroport', label: 'Aéroport & fret',
        re: /a[eé]roport|roissy|\bcdg\b|\borly\b|fret a[eé]rien|\bcargo\b|handling|servair|swissport|alyzia|menzies|\bwfs\b|air france|groupe 3s|\bpiste\b|escale|bagag/i },
      { id: 'gd', label: 'Grande distribution',
        re: /carrefour|auchan|leclerc|intermarch|monoprix|franprix|\blidl\b|\baldi\b|\bcasino\b|super\s?u\b|hyper\s?u\b|u les commer|syst[eè]me u|\bcora\b|supermarch[eé]s? match|\bnetto\b|leader price|\bg20\b|\bpicard\b|grand frais|naturalia|biocoop|la vie claire|hypermarch|supermarch|sup[eé]rette|mousquetaires|\bspar\b|\bvival\b|coccinelle|\bdrive\b|bricorama/i },
      { id: 'cosmetique', label: 'Cosmétique & parfum',
        re: /cosm[eé]t|parfum|beaut[eé]|aroma.?zone|sephora|rituals|\blush\b|\bkiko\b|yves rocher|occitane|nocib[eé]|marionnaud|douglas|l.or[eé]al|guerlain|diptyque|clarins|caudalie|\bnuxe\b|sisley/i },
      { id: 'mode', label: 'Mode, luxe & boutiques',
        re: /luxe|luxury|prada|lacoste|\bmango\b|\bzara\b|massimo dutti|\bcelio\b|\bpvh\b|tommy hilfiger|calvin klein|\bsmcp\b|sandro|\bmaje\b|claudie pierlot|galeries lafayette|printemps|bon march[eé]|samaritaine|\blvmh\b|\bdior\b|chanel|herm[eè]s|cartier|jacquemus|kooples|zadig|s[eé]zane|uniqlo|h&m|primark|kiabi|courir|\bnike\b|adidas|zag bijoux|\bmode\b|pr[eê]t.[aà].porter|fashion|boutique|bijou|joaill|maroquin|onebird|bompard|\betam\b|aubert/i },
      { id: 'hightech', label: 'High-tech & électroménager',
        re: /darty|\bfnac\b|boulanger|\bapple\b|[eé]lectrom[eé]nager|high.?tech|multim[eé]dia|samsung|electro d[eé]p[oô]t/i },
      { id: 'ecommerce', label: 'E-commerce', re: /e-?commerce|en ligne|amazon|cdiscount|vinted|veepee|zalando|showroompriv|\bebay\b/i },
      { id: 'industrie', label: 'Industrie & BTP',
        re: /industri|usine|pi[eè]ces d[eé]tach|a[eé]ronautique|automobile|\bbtp\b|mat[eé]riaux|chantier|m[eé]tallurg|chimi/i },
      { id: 'public', label: 'Public',
        re: /minist[eè]re|mairie|ville de|fonction publique|dgafp|collectivit|universit|[eé]cole normale|\bcnrs\b|conseil (?:r[eé]gional|d[eé]partemental)|pr[eé]fecture/i },
    ],
    // Secteurs jamais proposés sur RGRD (pilot.js, sectorHides), visibles dans « Offres masquées ».
    hiddenSectors: ['gd'],
    // Même poste d'une agence d'intérim publié pour plusieurs lieux : une seule carte (pilot.js, collapseRepeats).
    groupRepeats: true,
    // Les suivis rayon / vente posés avant cette date sont supprimés, sur chaque appareil et dans
    // le gist (pilot.js, isPurged). Une candidature hors logistique faite ensuite reste suivie.
    purgeOtherCatsBefore: Date.UTC(2026, 10, 14),
    // Remise à zéro des candidatures (19/11/2026) : celles envoyées avant le 12/11 (statut envoyée,
    // à relancer ou refus) sont supprimées partout (pilot.js, isPurged). Les entretiens restent.
    purgeSentBefore: Date.UTC(2026, 10, 12),
    // Zones (21/11/2026) : le 93 et le 75 d'abord ; en 92, 77 et 94, seuls les stockistes restent
    // visibles (pilot.js, zoneHides). Le 95 garde la règle des 60 min.
    zones: { stockisteOnly: ['92', '77', '94'] },
    // Offres non voulues (mêmes règles que collect.py) : retirées de « À postuler ».
    unwanted: {
      // Autre métier, poste trop senior, cariste / CACES, poste mêlé de vente.
      title: /plong(?:eur|euse)|stockage\s+(?:d['’]\s*)?[eé]nergie|\bbess\b|technico.?commercial|^\W*formations?\b|\bformations?\s+(?:qualifiante|dipl[oô]mante|certifiante|gratuite|financ[eé]e|r[eé]mun[eé]r[eé]e)|\bpoei\b|cariste|conducteur d['’ ]engins?|chariot|c[aà]c[eèé]s|conseill|vend(?:eur|euse)|\bvente\b|caiss|\bsi\b|chef de projet|soutien logistique|\bsli\b|d[eé]fense|biomasse|chantier|usinage|sciage|efficacit[eé] [eé]nerg|cadre sup|\bd['’ ]affaires\b|logisti\w*\s+et\s+[eé]v[eèé]nementiel|\brh\b|area manager|supply chain manager|tracfin|(?:responsable|directeur|directrice|manager)\b.{0,25}(?:exploitation|plateforme|r[eé]gional|site\b)|logistique r[eé]gional/i,
      // Écartés sauf si le titre nomme aussi le stock (tout ce qui touche au stock est voulu) :
      // [mots écartés, mots qui gardent l'offre].
      unless: [
        // Approvisionneur, sauf « Magasinier approvisionneur », « Gestionnaire stock et approvisionnements »,
        // « Référent logistique et approvisionnement » (logistique nommée aussi, 27/11/2026).
        [/approvision/i, /magasinier|stock|r[eé]serv|pr[eé]parat(?:eur|rice) de commandes|logisti/i],
        // Réceptionnaire (E.Leclerc, Carrefour…), sauf « Magasinier réceptionnaire », « Agent de stock / réception ».
        [/r[eé]ceptionnaire|r[eé]ception\s+(?:des\s+|de\s+)?marchandises|agent\S*\s+de\s+r[eé]ception\b/i, /magasini|stock|r[eé]serv/i],
        // Achats, optimisation, planification, sauf « Responsable optimisation des stocks ».
        [/achats?\b|optimisation|planificat/i, /stock/i],
        // Revue de l'onglet Stock (21/11/2026), comme stock_review_reject dans collect.py ;
        // 3e élément : onglets où la règle s'applique.
        [/chauffeu|livreu|conducteu|dispatch|transport/i, /(?!)/, ['stock']], // jamais gardé, même « Magasinier livreur »
        [/\badv\b|\bdata\b|tech\s*lead|d[eé]veloppeu|maintenance/i, /stock|r[eé]serv/i, ['stock']],
        // Technicien : écarté, sauf dans la santé (« Technicien logistique » à l'hôpital, 27/11/2026,
        // comme STOCK_TECH_KEEP_RE dans collect.py) ; 4e élément : secteurs exemptés.
        [/technicien/i, /stock|r[eé]serv/i, ['stock'], ['sante']],
        [/(?:responsable|directeu|directrice|manager|superviseu|chef)\S*.{0,40}?(?:entrep[oô]t|\bsite\b|secteur|activit[eé]|d[eé]partement|plateforme|exploitation|op[eé]rations)|superviseu|pilotage|\bmanager\b/i,
          /stock|magasini|r[eé]serv/i, ['stock']],
        [/\bquai\b|manutention/i, /stock|magasini|r[eé]serv/i, ['stock']],
        // Onglet Encadrement : ni responsable, directeur, gérant ou adjoint de magasin (ENCADREMENT_STORE_RE).
        [/(?:responsable|directeu|directrice|g[eé]rant|manager|chef|adjoint|assistant|second)\S*(?:\s+\S+){0,4}?\s+(?:magasin|boutique|point\s+de\s+vente|supermarch|hypermarch|sup[eé]rette|surface\s+de\s+vente|store|shop)|(?:store|shop|assistant)\s+manager|co.?manager|adjoint\S*\s+de\s+direction/i,
          /rayon|caisse|secteur|univers|d[eé]partement|department|frais|drive/i, ['encadrement']],
      ],
      // Entreprises écartées quel que soit le métier (comme EXCLUDED_COMPANIES dans collect.py),
      // et écoles ou organismes de formation (comme SCHOOL_COMPANY_RE, 26/11/2026).
      company: /michael\W*page|acad[eé]m(?:y|ie)\b|\bcampus\b|\bairsup\b|\bstudi\b|openclassrooms|ifocop/i,
      cacesInText: true,  // CACES obligatoire / exigé / requis dans le texte de l'annonce
      // Règles d'intitulé ci-dessus : métiers de la logistique seulement (« Chef de rayon » ou
      // « Chef de caisse » sont voulus dans l'onglet Encadrement), sauf celles qui nomment leurs onglets.
      cats: ['stock', 'tri'],
    },
    keywords: 'Stockiste, assistant stockiste, stockman, gestionnaire de stock, chargé de stock, coordinateur stock\n'
      + 'Employé de réserve, hôte de réserve, réserviste, responsable de réserve, stockiste luxe\n'
      + 'Agent de stock, employé de stock, contrôleur de stock, responsable des stocks\n'
      + 'Magasinier, agent logistique, agent d’entrepôt\n'
      + 'Coordinateur logistique, responsable logistique, chef d’équipe logistique\n'
      + 'Technicien logistique (santé), référent logistique et approvisionnement, économe\n'
      + 'Chef de rayon, manager de rayon, chef de caisse\n'
      + 'Agent de tri, trieur, agent de tri de colis',
    mails: true,
    feminine: false,
    // Adéquation offre / CV (pilot.js, cvFit) : d'après cv/cv_stock.html.
    fit: {
      languages: ['anglais', 'espagnol'],
      degree: 3,          // Bachelor (bac + 3)
      permis: true,
      caces: false,
      management: true,   // chef de rayon, responsable logistique (équipe de 6)
      cats: {
        stock: {
          years: 4,
          titles: ['magasinier', 'gestionnaire de stock', 'gestionnaire des stocks', 'stockiste', 'charge de stock',
            'charge des stocks', 'coordinateur stock', 'coordinateur de stock', 'agent de stock', 'responsable de stock',
            'responsable des stocks', 'preparateur de commandes', 'agent logistique', 'agent de logistique',
            'coordinateur logistique', 'responsable logistique', 'chef d equipe logistique', 'technicien logistique',
            'logisticien', 'employe logistique', 'assistant logistique',
            'agent d entrepot', 'agent entrepot', 'responsable d entrepot', 'operateur logistique', 'agent de quai',
            'stockman', 'assistant stockiste', 'employe de reserve', 'agent de reserve', 'responsable de reserve'],
          skills: ['reception', 'controle', 'inventaire', 'gestion des stocks', 'stock', 'preparation', 'expedition', 'commande',
            'fournisseur', 'approvisionnement', 'wms', 'cegid', 'gold', 'orthop', 'excel', 'reserve', 'encadrement', 'hygiene', 'securite',
            'logistique', 'reassort', 'ecart', 'livraison', 'quai', 'emballage', 'colis'],
          brands: ['darty', 'aroma zone'],
        },
        // Chef de rayon (Monoprix), référent rayon (E.Leclerc), responsable logistique (équipe de 6).
        encadrement: {
          years: 3,
          titles: ['chef de rayon', 'manager de rayon', 'responsable de rayon', 'referent rayon', 'responsable logistique',
            'chef d equipe', 'responsable de reserve', 'coordinateur logistique'],
          skills: ['encadrement', 'equipe', 'management', 'animation', 'planning', 'commande', 'stock', 'gestion des stocks',
            'inventaire', 'approvisionnement', 'reassort', 'chiffre d affaires', 'objectifs', 'ventes', 'casse', 'demarque',
            'plv', 'fraicheur', 'reception', 'hygiene', 'securite', 'excel', 'gold'],
          brands: ['monoprix', 'leclerc', 'darty'],
        },
        tri: {
          years: 4,
          titles: ['agent de stock', 'magasinier', 'gestionnaire de stock'],
          skills: ['inventaire', 'ecart', 'comptage', 'controle', 'reception', 'expedition', 'colis', 'stock', 'rangement',
            'logistique', 'commande', 'livraison', 'emballage', 'cegid', 'gold', 'excel', 'securite'],
          brands: ['darty', 'aroma zone'],
        },
      },
    },
  },
  zia: {
    id: 'zia',
    name: 'Zia',
    // Profil actif. Pour le mettre en pause (masqué, données intactes) : disabled: true.
    disabled: false,
    brand: 'ZCRT',
    ns: '__zia',
    syncFile: 'zcrt-suivi-zia.json',
    cats: ['rayon', 'vente', 'restauration'],
    triageLast: ['rayon'],       // tri au doigt : grande distribution en dernier, pour l'instant
    mails: false,
    feminine: true,
    keywords: 'Employée libre-service, hôtesse de caisse, mise en rayon, grande distribution\n'
      + 'Conseillère de vente, vendeuse prêt-à-porter, boutique\n'
      + 'Serveuse, chef de rang, runner, barista, café',
    priority: 'Paris → Bondy/93 → Île-de-France',
    hiddenTypes: ['auto', 'cariste', 'direction', 'animalerie'],
    // Adéquation offre / CV : d'après ses CV vente (COS, H&M) et restauration (chef de rang).
    fit: {
      languages: ['anglais'],   // espagnol scolaire : pas compté
      degree: 3,                // licence
      permis: null,             // non précisé sur ses CV : jamais pénalisé
      caces: false,
      management: false,
      cats: {
        rayon: {
          years: 3,
          titles: ['employee libre service', 'employe libre service', 'hotesse de caisse', 'hote de caisse', 'caissiere',
            'employee de rayon', 'employe de rayon', 'mise en rayon', 'equipiere', 'employee polyvalente', 'employe polyvalent',
            'employee commerciale', 'employe commercial'],
          skills: ['reassort', 'mise en rayon', 'reception', 'livraison', 'inventaire', 'encaissement', 'caisse', 'merchandising',
            'accueil', 'presentation', 'stock', 'client', 'etiquetage', 'facing', 'reapprovisionnement'],
          brands: ['h m', 'cos'],
        },
        vente: {
          years: 3,
          titles: ['conseillere de vente', 'conseiller de vente', 'vendeuse', 'vendeur', 'sales advisor', 'sales associate',
            'conseillere clientele', 'conseiller client', 'styliste conseil', 'conseillere mode', 'caissiere', 'caissier',
            'hotesse de caisse', 'vendeuse caissiere'],
          skills: ['accueil', 'accompagnement', 'conseil', 'retour', 'echange', 'commande', 'reclamation', 'visual merchandising',
            'merchandising', 'reception', 'livraison', 'inventaire', 'encaissement', 'caisse', 'reassort', 'fidelisation',
            'vente additionnelle', 'objectif', 'pret a porter', 'mode', 'textile', 'collection', 'clientele internationale'],
          brands: ['cos', 'h m'],
        },
        restauration: {
          years: 4,
          titles: ['chef de rang', 'cheffe de rang', 'serveuse', 'serveur', 'runner', 'commis de salle', 'barista', 'barmaid',
            'barman', 'maitre d hotel', 'hotesse d accueil', 'equipiere de salle', 'employee de salle'],
          skills: ['service en salle', 'salle', 'accueil', 'prise de commande', 'commande', 'vin', 'oenologie', 'sommellerie',
            'cocktail', 'bar', 'cave', 'encaissement', 'fort debit', 'gastronomique', 'bistronomie', 'brasserie', 'bistrot',
            'restaurant', 'carte', 'dressage', 'mise en place', 'cafe'],
          brands: ['lagano', 'clown bar', 'pouliche', 'del arte'],
        },
      },
    },
    cv: { rayon: 'CV_ZIA_CARTIER_vente.pdf', vente: 'CV_ZIA_CARTIER_vente.pdf', restauration: 'CV_ZIA_CARTIER_restauration.pdf' },
    templates: {
      rayon: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Forte de plusieurs années d'expérience en magasin et en restauration, je connais le rythme d'un point de vente à forte affluence et l'importance d'un service soigné.

Conseillère de vente chez COS à Paris 8e, je réceptionnais et traitais les livraisons, participais aux inventaires tournants et annuels et mettais en place le merchandising selon les consignes du siège. Chez H&M, j'ai assuré la présentation des articles, le réapprovisionnement de la boutique et l'encaissement. Mes expériences en restaurant m'ont appris à rester efficace et souriante dans les moments de rush.

Polyvalente, autonome et à l'aise en équipe, je m'adapte rapidement à l'organisation d'un nouveau magasin.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      vente: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Diplômée d'un BTS Commerce international, j'ai près de trois ans d'expérience comme conseillère de vente en prêt-à-porter.

Chez COS à Paris 8e, en CDI, j'ai accueilli et accompagné une clientèle française et internationale, géré les retours, échanges et commandes, fidélisé les clients réguliers et été référente d'un univers produit. J'ai également mis en place le visual merchandising et participé aux briefs d'équipe sur les objectifs. Auparavant, chez H&M, j'assurais la présentation des articles, l'encaissement et le réassort.

À l'écoute, souriante et à l'aise à l'oral, en français comme en anglais, j'aime valoriser les produits et proposer la vente additionnelle.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      restauration: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Cheffe de rang depuis plusieurs années dans des restaurants parisiens, j'aime le service en salle et le lien avec les clients.

Au Lagano, à Paris 7e, j'ai participé à l'ouverture et à la croissance du restaurant, autour d'une cuisine de saison et d'une cave de vins de niche. Au Clown Bar puis chez Pouliche, adresse semi-gastronomique d'Amandine Chaignot, j'ai approfondi mes connaissances en œnologie, notamment en vins naturels, et pris part au bar avec une carte de cocktails signature. J'ai débuté chez Del Arte, en plein été et à fort débit, où j'ai acquis les bases du service et de l'organisation.

Rigoureuse sous la pression, autonome et attentive aux besoins des clients, je parle anglais couramment.

{accroche}

Disponible {disponibilite}, je serais heureuse de rejoindre votre équipe et de vous rencontrer.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
    },
  },
};

const ACTIVE_PROFILE = (() => {
  let id = '';
  try { id = localStorage.getItem(ZCRT_PROFILE_KEY) || ''; } catch (e) { /* stockage indisponible */ }
  const p = ZCRT_PROFILES[id];
  return p && !p.disabled ? p : ZCRT_PROFILES.ryan;
})();
document.title = ACTIVE_PROFILE.brand + ' — Recherche d’emploi';

/** Clé du navigateur propre au profil actif. */
function nsKey(key) { return key + ACTIVE_PROFILE.ns; }

/** Accord au féminin pour le profil actif : fem('prêt', 'prête'). */
function fem(masc, femi) { return ACTIVE_PROFILE.feminine ? femi : masc; }

function otherProfile() {
  return Object.values(ZCRT_PROFILES).find(p => p.id !== ACTIVE_PROFILE.id && !p.disabled);
}

function switchProfile() {
  try { localStorage.setItem(ZCRT_PROFILE_KEY, otherProfile().id); } catch (e) { return; }
  location.reload();
}

/** Logo du profil actif ; le toucher bascule vers l'autre profil (barre latérale et en-tête mobile). */
function brandHtml() {
  const other = otherProfile(), b = ACTIVE_PROFILE.brand;
  // Un seul profil actif : le logo ramène à l'accueil (onglet Offres).
  if (!other) {
    return `<button class="brand-btn" type="button" onclick="goHome()" title="Revenir à l’accueil" aria-label="${b} — revenir à l’accueil"><span class="brand-mark" aria-hidden="true">${b.charAt(0)}</span>`
      + `<span class="brand-name" aria-hidden="true">${b}<i>.</i></span></button>`;
  }
  return `<button class="brand-btn" type="button" onclick="switchProfile()" title="Passer au profil de ${other.name}" aria-label="${b} — passer au profil de ${other.name}">`
    + `<span class="brand-mark" aria-hidden="true">${b.charAt(0)}</span><span class="brand-name" aria-hidden="true">${b}<i>.</i></span></button>`;
}

function goHome() {
  document.querySelector('.nav [data-tab="dashboard"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Premier lancement, installation, stockage durable ---------- */

function storedSafe(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

// Évalué dès le chargement de ce fichier, avant que le site n'enregistre quoi que ce soit.
const ZCRT_NEW_DEVICE = !storedSafe(ZCRT_PROFILE_KEY)
  && !Object.values(ZCRT_PROFILES).some(p => storedSafe('emploipilot_v1_data' + p.ns));

/** Nouvel appareil (ou appli tout juste installée) : on demande qui l'utilise. */
function askProfileIfNew() {
  if (!ZCRT_NEW_DEVICE || storedSafe(ZCRT_PROFILE_KEY) || !otherProfile()) return;
  const box = document.createElement('div');
  box.className = 'welcome';
  box.innerHTML = `<div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
    <h2 id="welcomeTitle">Qui utilise ZCRT ?</h2><p>Sur cet appareil. Tu pourras changer à tout moment en touchant le logo.</p>
    <div class="welcome-choices">${Object.values(ZCRT_PROFILES).map(p => `<button type="button" data-profile="${p.id}">${p.name}</button>`).join('')}</div></div>`;
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-profile]');
    if (!b) return;
    try { localStorage.setItem(ZCRT_PROFILE_KEY, b.dataset.profile); } catch (err) { /* stockage indisponible */ }
    if (b.dataset.profile !== ACTIVE_PROFILE.id) location.reload();
    else box.remove();
  });
  document.body.appendChild(box);
}

/** iPhone / iPad dans Safari (pas l'appli installée) : Safari peut effacer les données
 * d'un site non ouvert depuis 7 jours, pas celles d'une appli de l'écran d'accueil. */
function showInstallHint() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone === true
    || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!ios || installed || storedSafe('zcrt_install_hint_done')) return;
  const hint = document.createElement('div');
  hint.className = 'install-hint';
  hint.innerHTML = `<span>📲 Pour ne rien perdre, installe ZCRT : touche <b>Partager</b> <span aria-hidden="true">⬆︎</span> puis <b>« Sur l'écran d'accueil »</b>, et ouvre-le ensuite depuis son icône.</span>`
    + '<button type="button" class="secondary">OK</button>';
  hint.querySelector('button').onclick = () => {
    try { localStorage.setItem('zcrt_install_hint_done', '1'); } catch (e) { /* stockage indisponible */ }
    hint.remove();
  };
  document.body.appendChild(hint);
}

document.addEventListener('DOMContentLoaded', () => {
  askProfileIfNew();
  showInstallHint();
  // Demande au navigateur de ne pas effacer les données de ZCRT pour faire de la place.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
});

/** Onglets métiers du profil actif. */
function categoryTabsHtml() {
  return ACTIVE_PROFILE.cats.map((c, i) => `<button${i === 0 ? ' class="active"' : ''} data-category="${c}" role="tab">`
    + `<span class="ct-ic"><svg class="ic" aria-hidden="true"><use href="#i-${CAT_INFO[c].icon}"/></svg></span>`
    + `<span class="ct-label">${CAT_INFO[c].label}</span><span class="ct-count" data-count="${c}"></span></button>`).join('');
}

/** Modèles de lettre et CV du profil actif (onglet Critères). */
function templateFieldsHtml() {
  return ACTIVE_PROFILE.cats.map(c => `<div class="field tpl" data-cat="${c}"><label for="tpl_${c}">${CAT_INFO[c].label}</label>`
    + `<textarea id="tpl_${c}"></textarea><label for="cv_${c}" style="margin-top:10px">CV à joindre</label>`
    + `<input id="cv_${c}" placeholder="Ex. CV_${c}.pdf"><p><button class="ghost small-btn" data-reset-tpl="${c}">Revenir au modèle d’origine</button></p></div>`).join('');
}
