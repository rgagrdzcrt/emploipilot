/* ZCRT — lettres de motivation adaptées à chaque offre.
 *
 * offerTailoring(o) lit l'annonce et renvoie deux paragraphes ajoutés à la lettre :
 *  - les missions que l'annonce met en avant, reliées aux expériences réelles du CV ;
 *  - l'entreprise : ancien employeur (« je connais déjà l'enseigne »), sinon son univers
 *    (multimédia, mode, santé…) et pourquoi il motive.
 * Rien n'est inventé : chaque preuve reprend une expérience du CV joint à la candidature
 * (Ryan : CV stock pour Stock, Préparation, Aéroport et Tri ; CV rayon pour Encadrement).
 * Les regex portent sur le texte normalisé (minuscules, sans accents) de pilot.js (fitText).
 */

// Onglets de Ryan dont la candidature part avec le CV stock (profiles.js, cv), et les autres.
const RYAN_STOCK_CV = ['stock', 'preparation', 'aeroport', 'tri'];
const RYAN_OTHER_CV = ['encadrement', 'rayon', 'vente'];

// Univers d'entreprise : [titre + entreprise (enseignes comprises), description de l'annonce].
// La description ne compte que des expressions sans ambiguïté : « chaussures de sécurité »
// n'est pas la mode, « mutuelle santé » n'est pas la santé, « proche de l'aéroport » non plus.
const SECTOR_RE = {
  aerien: [/aeroport|aerogare|charles de gaulle|air france|\badp\b|swissport|\bwfs\b|worldwide flight|menzies|dnata|alyzia|groupe 3s|servair|\bfret\b|cargo|aerien|airsup|aerostaff|bagag|\bpiste\b|escale/,
    /zone reservee|fret aerien|compagnies? aeriennes?|badge aeroportuaire|(assistance|plateforme|zone) aeroportuaire/],
  luxe: [/luxe|joaill|horlog|maroquin|haute couture|hermes|chanel|\bdior\b|vuitton|cartier|rolex|chaumet|boucheron|van cleef|givenchy|saint laurent|\bysl\b|balenciaga|prada|gucci|\bceline\b|fendi|loewe|moncler|bulgari|bvlgari|tiffany|lvmh|kering|richemont|bon marche|samaritaine|jacquemus|longchamp|berluti/,
    /\bluxe\b|maison de luxe|haute joaillerie|horlogerie|maroquinerie|haute couture/],
  sante: [/medical|medicaux|pharma|sante|hopita|hospitali|clinique|laboratoire|ehpad|kenvue|sanofi|servier|pfizer|novartis|bayer|ipsen|boiron|pierre fabre|urgo|hartmann|medline|\bap hp\b|aphp|cerballiance|biogroup|eurofins|synlab/,
    /materiel medical|dispositifs? medicaux|produits? de sante|secteur (de la sante|medical|pharmaceutique|hospitalier)|etablissements? de sante|industrie pharmaceutique|produits? pharmaceutiques?|laboratoire pharmaceutique|logistique (hospitaliere|pharmaceutique)|parapharmacie/],
  beaute: [/cosmeti|beaute|parfum|aroma zone|sephora|nocibe|marionnaud|yves rocher|occitane|\blush\b|kiko|rituals|l oreal|loreal|clarins|guerlain|sisley|caudalie|nuxe|douglas|body shop|estee lauder|shiseido|typology/,
    /cosmetiques?|parfumerie|produits de beaute|soins? (du visage|du corps|de beaute)|maquillage/],
  multimedia: [/multimedia|electromenager|high tech|darty|\bfnac\b|\bboulanger\b|electro depot|apple|samsung/,
    /electromenager|multimedia|high tech|electronique grand public/],
  ecommerce: [/e commerce|ecommerce|vente en ligne|marketplace|amazon|cdiscount|zalando|veepee|vente privee|showroompriv|la redoute|manomano|back market|vinted|asos|\bebay\b/,
    /e commerce|ecommerce|vente en ligne|boutique en ligne|site marchand|marketplace|commandes? (passees )?(en ligne|sur internet)/],
  mode: [/pret a porter|textile|fashion|\bmode\b|zara|inditex|\bh m\b|uniqlo|primark|kiabi|celio|\bjules\b|mango|bershka|pull and bear|stradivarius|massimo dutti|\bcos\b|galeries lafayette|printemps|\bbhv\b|lacoste|petit bateau|jacadi|okaidi|sezane|\bmaje\b|sandro|kooples|zadig|ikks|promod|etam|undiz|darjeeling|gemo|la halle/,
    /pret a porter|collections? de vetements|(marque|enseigne) de (mode|vetements|pret a porter)|univers de la mode/],
  maison: [/bricolage|jardin|ameublement|decoration|leroy merlin|castorama|bricorama|brico depot|bricomarche|mr bricolage|weldom|ikea|conforama|maisons du monde|alinea|gifi|foir fouille|truffaut|jardiland|botanic|point p|cedeo|lapeyre/,
    /bricolage|ameublement|jardinerie|articles de (maison|decoration)/],
  sport: [/\bsports?\b|decathlon|intersport|go sport|foot locker|courir|\bnike\b|adidas|\bpuma\b|snipes|salomon/,
    /articles de sport|equipements? sportifs?|(enseigne|magasin) de sport/],
  animalerie: [/animalerie|maxi zoo|animalis|zooplus|tom co\b|croquettes/, /animalerie|animaux de compagnie|produits pour animaux/],
  alimentaire: [/supermarche|hypermarche|alimentaire|epicerie|fruits|legumes|boucherie|fromagerie|carrefour|monoprix|leclerc|auchan|\blidl\b|\baldi\b|franprix|intermarche|mousquetaires|casino|picard|grand frais|naturalia|biocoop|vie claire|u les commercants|super u|hyper u|systeme u|\bcora\b|\bnetto\b|\bg20\b|leader price|grande epicerie|\bmetro\b|promocash|thiriet|bio c bon|rungis/,
    /grande distribution|distribution alimentaire|supermarche|hypermarche|produits frais|(magasin|enseigne) alimentaire|produits alimentaires/],
  collective: [/saveurs et vie|sodexo|elior|compass group|api restauration|newrest|restauration collective|traiteur|cuisine centrale|portage de repas/,
    /restauration collective|cuisine centrale|portage de repas|liaison froide|traiteur/],
  public: [/service public|mairie|\bville de\b|conseil departemental|conseil regional|ministere|prefecture|fonction publique|\bcrous\b|universite|\bcnrs\b|\binserm\b/,
    /fonction publique|collectivite territoriale|service public/],
  logistique: [/geodis|\bdhl\b|\bups\b|fedex|chronopost|colissimo|la poste|\bdpd\b|\bgls\b|mondial relay|relais colis|\bxpo\b|kuehne|id logistics|fm logistic|\bstef\b|rhenus|\bceva\b|schenker|ziegler|gefco|arvato|bollore|dachser|heppner|\btransports?\b|messagerie|logisticien|prestataire logistique|plateforme logistique|entrepot/,
    /plateforme logistique|entrepot logistique|prestataire logistique|logisticien|transport de colis|centre de tri|plateforme de distribution/],
};
// { sec, name, reason, cats? } → { re, text, name, reason, cats? } (cats : onglets concernés, tous à défaut).
const sectorsOf = list => list.map(({ sec, ...s }) => ({ ...s, re: SECTOR_RE[sec][0], text: SECTOR_RE[sec][1] }));

const LETTER_TAILOR = {
  ryan: {
    missions: {
      stock: [
        { re: /reception|receptionner|dechargement|decharger|livraisons?|arrivage/, label: 'la réception des marchandises', proof: 'coordinateur stock chez Aroma-Zone, je coordonnais les réceptions et la mise en stock' },
        { re: /rangement|ranger|reserve|stockage|emplacement|adressage/, label: 'l’organisation du stock', proof: 'j’ai organisé la très grande réserve de Darty, puis celle d’Aroma-Zone' },
        { re: /gestion des stocks|suivi des stocks|niveaux? de stock|ruptures?|fiabilit/, label: 'le suivi des stocks', proof: 'chez Aroma-Zone, je suivais les niveaux de stock et les ruptures pour planifier le réassort' },
        { re: /preparation des? commandes?|picking|colis|expedition|emballage/, label: 'la préparation des commandes', proof: 'j’ai préparé et expédié les commandes d’une boutique en ligne de plus de 400 références' },
        { re: /inventaire|comptage|ecarts?/, label: 'les inventaires', proof: 'je préparais et suivais les inventaires, avec l’analyse des écarts' },
        { re: /reassort|reapprovision|mise en rayon/, label: 'le réassort', proof: 'j’assurais le réassort des rayons à partir de la réserve' },
        { re: /commandes? fournisseurs?|fournisseurs|approvisionnement|passer les commandes/, label: 'le suivi des commandes fournisseurs', proof: 'au Carré Médical, j’ai piloté les stocks et les commandes fournisseurs de matériel médical' },
        { re: /wms|logiciel|informatique|excel|outils? informatiques?|\berp\b|\bsap\b|cegid|\bgold\b|g o l d/, label: 'les outils informatiques', proof: 'j’utilise G.O.L.D, CEGID et Excel' },
        { re: /encadr|manag|chef d equipe|animer|superviser/, label: 'la coordination d’équipe', proof: 'j’ai encadré une équipe de six livreurs' },
        { re: /securite|hygiene|normes/, label: 'le respect des règles de sécurité', proof: 'je veille au respect des normes d’hygiène et de sécurité' },
      ],
      rayon: [
        { re: /mise en rayon|remplissage|reassort|reapprovision|approvisionnement des rayons/, label: 'la mise en rayon et le réassort', proof: 'chez Monoprix puis chez E.Leclerc, j’assurais chaque jour la mise en rayon, le réassort et la rotation des produits' },
        { re: /fraicheur|produits frais|fruits|legumes|qualite des produits|dlc/, label: 'la fraîcheur des produits', proof: 'au rayon Fruits & Légumes de Monoprix, je contrôlais chaque jour la fraîcheur et la qualité' },
        { re: /etiquet|balisage|affichage des prix|plv/, label: 'l’étiquetage et le balisage', proof: 'je m’occupais de l’étiquetage des prix et de la mise en place des PLV' },
        { re: /commandes?|gestion des stocks|inventaire|casse|demarque/, label: 'la gestion des stocks et des commandes', proof: 'comme chef de rayon, je gérais les commandes et les stocks pour limiter la casse' },
        { re: /reception|livraisons?|decharg/, label: 'la réception des marchandises', proof: 'je réceptionnais et contrôlais les livraisons du rayon' },
        { re: /accueil|conseil|renseign|clientele/, label: 'l’accueil et le conseil des clients', proof: 'je renseignais et conseillais les clients au quotidien' },
        { re: /presentation|merchandising|facing|mise en valeur|proprete/, label: 'la présentation du rayon', proof: 'je veillais à un rayon toujours propre, bien présenté et attractif' },
        { re: /encadr|manag|coordin|esprit d equipe|travail en equipe/, label: 'le travail en équipe', proof: 'référent épicerie chez E.Leclerc, je coordonnais l’équipe pour assurer le réassort' },
      ],
      vente: [
        { re: /accueil|conseil|accompagn|besoins|relation client/, label: 'l’accueil et le conseil client', proof: 'chez Darty puis chez COS, j’ai accueilli les clients, découvert leurs besoins et les ai conseillés jusqu’à la vente' },
        { re: /vente additionnelle|ventes? complementaires?|services associes|garanties|panier moyen/, label: 'la vente additionnelle', proof: 'chez Darty, je proposais les services associés et les ventes complémentaires' },
        { re: /objectifs?|chiffre d affaires|performance commerciale|resultats/, label: 'l’atteinte des objectifs', proof: 'référent du pôle multimédia, je suivais les objectifs de vente de l’équipe' },
        { re: /merchandising|visuel|vitrine|mise en valeur|collections?/, label: 'la mise en valeur des produits', proof: 'chez COS, je mettais en valeur les collections en respectant les standards visuels de la marque' },
        { re: /encaissement|caisse|paiement/, label: 'l’encaissement', proof: 'j’assurais l’encaissement et la tenue de la surface de vente' },
        { re: /reassort|stock|reception|rangement|reserve/, label: 'le réassort et la tenue du stock', proof: 'je gérais aussi le réassort de la surface de vente' },
        { re: /anglais|english|bilingue|clientele (internationale|etrangere)|touris/, label: 'l’accueil d’une clientèle internationale', proof: 'bilingue en anglais, j’ai conseillé une clientèle internationale chez COS' },
        { re: /multimedia|telephonie|informatique|high tech|electromenager|television/, label: 'le conseil sur des produits techniques', proof: 'chez Darty, je conseillais sur la TV, la téléphonie et l’informatique' },
        { re: /cabines?|essayage/, label: 'la gestion des cabines', proof: 'chez COS, je gérais les cabines d’essayage' },
      ],
    },
    // Premier univers reconnu (dans l'ordre), avec une raison tirée du CV joint pour cet onglet.
    sectors: sectorsOf([
      { sec: 'aerien', name: 'l’univers aéroportuaire', reason: 'la ponctualité et la rigueur y sont essentielles, et mon anglais bilingue y est un vrai atout' },
      { sec: 'luxe', cats: RYAN_STOCK_CV, name: 'l’univers du luxe', reason: 'chaque pièce y demande une réserve impeccable, et j’y apporterais ma rigueur et mon anglais bilingue' },
      { sec: 'luxe', cats: RYAN_OTHER_CV, name: 'l’univers du luxe', reason: 'j’y apporterais mon sens du service et mon anglais bilingue' },
      { sec: 'sante', name: 'le secteur de la santé', reason: 'au Carré Médical, j’ai géré les stocks de matériel médical, où la rigueur n’est pas une option' },
      { sec: 'beaute', cats: RYAN_STOCK_CV, name: 'l’univers de la beauté et des cosmétiques', reason: 'chez Aroma-Zone, j’ai appris à gérer des références nombreuses et délicates, où la rigueur fait la différence' },
      { sec: 'beaute', cats: RYAN_OTHER_CV, name: 'l’univers de la beauté et des cosmétiques', reason: 'les références y sont nombreuses et délicates, et c’est là que la rigueur fait la différence' },
      { sec: 'multimedia', name: 'l’univers du multimédia', reason: 'j’y ai déjà fait mes preuves chez Darty' },
      { sec: 'ecommerce', name: 'le e-commerce', reason: 'j’ai géré les stocks et les expéditions d’une boutique en ligne de plus de 400 références' },
      { sec: 'mode', cats: RYAN_STOCK_CV, name: 'l’univers de la mode', reason: 'les collections y tournent vite, et j’ai appris en magasin qu’une réserve bien organisée fait gagner un temps précieux à la vente' },
      { sec: 'mode', cats: RYAN_OTHER_CV, name: 'l’univers de la mode', reason: 'chez COS, j’ai appris l’exigence d’une marque de prêt-à-porter' },
      { sec: 'maison', cats: RYAN_STOCK_CV, name: 'l’univers de la maison et du bricolage', reason: 'les références y sont nombreuses et souvent volumineuses, et j’ai l’habitude d’organiser de très grandes réserves' },
      { sec: 'maison', cats: RYAN_OTHER_CV, name: 'l’univers de la maison et du bricolage', reason: 'j’aime les produits concrets et le conseil pratique' },
      { sec: 'sport', name: 'l’univers du sport', reason: 'le sport fait partie de ma vie, notamment le jiu-jitsu' },
      { sec: 'animalerie', name: 'l’univers de l’animalerie', reason: 'j’aime les animaux, et ce serait un plaisir de mettre mon savoir-faire au service de cet univers' },
      { sec: 'alimentaire', cats: RYAN_STOCK_CV, name: 'la distribution alimentaire', reason: 'les livraisons y sont quotidiennes et le réassort ne s’arrête jamais : c’est le rythme que j’ai connu en magasin, chez Darty puis chez Aroma-Zone' },
      { sec: 'alimentaire', cats: RYAN_OTHER_CV, name: 'la distribution alimentaire', reason: 'je connais bien ce métier pour l’avoir exercé chez Monoprix et E.Leclerc' },
      { sec: 'collective', name: 'la restauration collective', reason: 'les normes d’hygiène y sont strictes, et je les applique au quotidien' },
      { sec: 'public', name: 'le service public', reason: 'j’aimerais mettre mon sens de l’organisation au service de l’intérêt général' },
      { sec: 'logistique', cats: RYAN_STOCK_CV, name: 'la logistique', reason: 'de la réserve d’un magasin aux opérations logistiques du Carré Médical, c’est le métier que j’exerce depuis près de 4 ans' },
    ]),
    // Anciens employeurs du CV joint : la lettre dit qu'il connaît déjà la maison (champ entreprise seul).
    employers: [
      { re: /aroma zone/, cats: RYAN_STOCK_CV, text: 'Revenir chez Aroma-Zone me motive particulièrement : je connais déjà vos produits, vos méthodes et l’organisation de vos réserves.' },
      { re: /\bdarty\b/, cats: RYAN_STOCK_CV, text: 'Revenir chez Darty me motive particulièrement : je connais déjà l’enseigne, ses produits et le rythme de ses livraisons.' },
      { re: /\bfnac\b/, cats: RYAN_STOCK_CV, text: 'Rejoindre le groupe Fnac Darty me motive particulièrement : je connais déjà ses méthodes pour avoir été magasinier chez Darty.' },
      { re: /carre medical/, cats: RYAN_STOCK_CV, text: 'Revenir au Carré Médical me motive particulièrement : je connais déjà votre organisation et vos produits.' },
      { re: /monoprix/, cats: RYAN_OTHER_CV, text: 'Revenir chez Monoprix me motive particulièrement : je connais déjà l’enseigne, ses rayons et ses méthodes.' },
      { re: /leclerc/, cats: RYAN_OTHER_CV, text: 'Retrouver l’enseigne E.Leclerc me motive particulièrement : je connais déjà son organisation pour y avoir été référent du rayon épicerie.' },
    ],
  },
  zia: {
    missions: {
      rayon: [
        { re: /mise en rayon|reassort|reapprovision|remplissage/, label: 'la mise en rayon et le réassort', proof: 'chez H&M, j’assurais le réapprovisionnement de la boutique et la présentation des articles' },
        { re: /encaissement|caisse|hote(sse)? de caisse/, label: 'l’encaissement', proof: 'j’assurais l’encaissement et la gestion de la caisse' },
        { re: /reception|livraisons?|decharg/, label: 'la réception des marchandises', proof: 'chez COS, je réceptionnais et traitais les livraisons' },
        { re: /inventaire|stock/, label: 'la tenue des stocks', proof: 'je participais aux inventaires tournants et annuels' },
        { re: /accueil|conseil|renseign|clientele/, label: 'l’accueil des clients', proof: 'j’accueillais et accompagnais les clients au quotidien' },
        { re: /presentation|merchandising|facing|mise en valeur|proprete/, label: 'la présentation des produits', proof: 'je mettais en place le merchandising selon les consignes du siège' },
      ],
      vente: [
        { re: /accueil|accompagn|conseil|besoins|relation client/, label: 'l’accueil et le conseil client', proof: 'chez COS, j’accueillais et accompagnais chaque client de façon personnalisée' },
        { re: /retours?|echanges?|reclamations?|\bsav\b/, label: 'la gestion des retours et des réclamations', proof: 'je gérais les retours, les échanges et les réclamations' },
        { re: /fidelis|clientele reguliere|carte de fidelite/, label: 'la fidélisation', proof: 'je fidélisais et suivais une clientèle régulière' },
        { re: /merchandising|visuel|vitrine|mise en valeur|collections?/, label: 'la mise en valeur des collections', proof: 'je mettais en place le visual merchandising selon les guidelines du siège' },
        { re: /vente additionnelle|objectifs?|chiffre d affaires/, label: 'les objectifs de vente', proof: 'je participais aux briefs d’équipe et à la transmission des objectifs, en proposant la vente additionnelle' },
        { re: /encaissement|caisse/, label: 'l’encaissement', proof: 'chez H&M, j’assurais l’encaissement et la gestion de la caisse' },
        { re: /reassort|stock|reception|inventaire|livraisons?/, label: 'la tenue du stock', proof: 'je réceptionnais les livraisons et participais aux inventaires' },
        { re: /anglais|english|bilingue|clientele (internationale|etrangere)|touris/, label: 'l’accueil d’une clientèle internationale', proof: 'mon anglais courant me permet d’accueillir une clientèle internationale' },
      ],
      restauration: [
        { re: /service en salle|prise de commande|accueil|service/, label: 'le service en salle', proof: 'cheffe de rang, j’ai assuré l’accueil, la prise de commande et le service en salle dans plusieurs restaurants parisiens' },
        { re: /\bvins?\b|cave|sommel|oenolog/, label: 'le conseil sur les vins', proof: 'j’ai approfondi mes connaissances en œnologie, notamment en vins naturels, au Clown Bar' },
        { re: /cocktails?|\bbar\b|barman|barmaid|mixolog/, label: 'le bar', proof: 'chez Pouliche, j’ai aussi tenu le bar sur une carte de cocktails signature' },
        { re: /fort debit|rush|rapidite|cadence|dynamique/, label: 'le rythme du service', proof: 'chez Del Arte, j’ai appris à garder le sourire et l’efficacité en plein rush' },
        { re: /ouverture|lancement|nouveau restaurant/, label: 'l’ouverture d’un établissement', proof: 'au Lagano, j’ai participé à l’ouverture et à la croissance du restaurant' },
        { re: /anglais|english|bilingue|clientele (internationale|etrangere)|touris/, label: 'l’accueil d’une clientèle internationale', proof: 'je parle anglais couramment' },
        { re: /gastronom|bistronom|fine dining|etoile/, label: 'un service soigné', proof: 'chez Pouliche, adresse semi-gastronomique d’Amandine Chaignot, j’ai appris l’exigence d’un service soigné' },
      ],
    },
    sectors: [
      { re: /hotel|palace|hotellerie|shangri|ritz|crillon|bristol|plaza athenee|peninsula|four seasons|mandarin oriental|cheval blanc|lutetia/, name: 'l’hôtellerie', reason: 'mon anglais courant et mon sens du service y sont de vrais atouts' },
      { re: /gastronom|bistronom|fine dining|etoile/, name: 'une maison à la cuisine exigeante', reason: 'j’aime le service précis et attentionné qu’exige une belle table' },
      { re: /\bvins?\b|cave a vins?|bar a vins?|sommel|oenolog/, name: 'l’univers du vin', reason: 'mes connaissances en œnologie, notamment en vins naturels, y seraient un vrai atout' },
      { re: /coffee|barista|salon de the|brunch|torrefact/, name: 'l’univers du café', reason: 'j’aime le contact client et l’exigence d’un produit bien préparé' },
      { re: /brasserie|bistrot|fort debit/, name: 'une brasserie au rythme soutenu', reason: 'chez Del Arte, j’ai appris à garder le sourire et l’efficacité en plein rush' },
      { re: /musee|galerie|art contemporain|culture/, name: 'l’univers de l’art et de la culture', reason: 'diplômée en histoire de l’art, c’est un monde qui me passionne' },
      { re: /luxe|joaill|horlog|maroquin/, name: 'l’univers du luxe', reason: 'mon anglais courant et mon sens du service y sont de vrais atouts' },
      { re: /cosmeti|beaute|parfum|aroma/, name: 'l’univers de la beauté', reason: 'j’aime conseiller et accompagner chaque client dans ses choix' },
      { re: /pret a porter|textile|vetements?|chaussures?|fashion|\bmode\b/, name: 'l’univers de la mode', reason: 'chez COS et H&M, j’ai appris les codes du prêt-à-porter' },
      { re: /supermarche|hypermarche|alimentaire|epicerie|fruits|legumes|carrefour|monoprix|leclerc|auchan|lidl|franprix|intermarche|mousquetaires/, name: 'la distribution alimentaire', reason: 'j’aime le contact client et le rythme d’un magasin' },
    ],
  },
};

// Onglets ajoutés au profil de Ryan (21/11/2026) : seulement des missions qu'il a réellement
// tenues, pour que la preuve citée dans la lettre reste vraie (jamais « agent de piste » ou « de tri »).
(() => {
  const m = LETTER_TAILOR.ryan.missions;
  const pick = (list, ...labels) => list.filter(x => labels.includes(x.label));
  m.preparation = pick(m.stock, 'la préparation des commandes', 'l’organisation du stock', 'les inventaires', 'le réassort',
    'les outils informatiques', 'le respect des règles de sécurité');
  m.aeroport = pick(m.stock, 'la réception des marchandises', 'la préparation des commandes', 'la coordination d’équipe',
    'le respect des règles de sécurité');
  m.tri = pick(m.stock, 'les inventaires', 'le suivi des stocks', 'la réception des marchandises', 'la préparation des commandes',
    'l’organisation du stock', 'les outils informatiques', 'le respect des règles de sécurité');
  m.encadrement = [
    { re: /encadr|manag|animer|animation|diriger|chef d equipe|planning/, label: 'l’encadrement de l’équipe', proof: 'chef de rayon chez Monoprix, j’ai géré l’équipe du rayon Fruits & Légumes, et j’ai encadré six livreurs au Carré Médical' },
    { re: /chiffre d affaires|objectifs?|ventes|resultats|indicateurs/, label: 'le suivi des ventes', proof: 'chez Monoprix, je suivais les ventes du rayon et ajustais les commandes pour limiter la casse' },
    ...pick(m.rayon, 'la gestion des stocks et des commandes', 'la mise en rayon et le réassort', 'la présentation du rayon',
      'la fraîcheur des produits', 'la réception des marchandises', 'l’étiquetage et le balisage'),
  ];
})();

// Agences d'intérim, cabinets de recrutement et sites d'annonces : jamais présentés comme l'employeur.
const LETTER_AGENCY_RE = /adecco|manpower|randstad|\bcrit\b|adequat|synergie|proman|start people|temporis|partnaire|supplay|gojob|staffmatch|int[eé]rim|talents? |sintel|hays|page personnel|michael page|lhh|expectra|recrut|\bfed\b|hocjob|job ?link|\brh\b|staff|harry hope|\bbruce\b|mercato|choisir le service public/i;
// Noms génériques laissés par certaines sources à la place de l'entreprise.
const LETTER_NO_COMPANY_RE = /^(logistique|e-?commerce|entreprise|soci[eé]t[eé]|client|confidentiel(le)?|ltd( international)?|non renseign[eé]e?)$/i;

function letterCompany(o) {
  const c = String(o.company || '').trim();
  if (!c || /à vérifier/i.test(c) || LETTER_AGENCY_RE.test(c) || LETTER_NO_COMPANY_RE.test(c) || o.contract === 'Intérim') return '';
  // Sigles courts gardés tels quels (« RHD ») ; « MONOPRIX » → « Monoprix » ; casse mixte inchangée.
  if (/^[A-Z0-9&]{2,4}$/.test(c)) return c;
  return c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : c;
}

/** Univers de l'entreprise pour cet onglet : titre et entreprise d'abord (la description cite
 * souvent d'autres enseignes du groupe), puis la description, avec ses seules expressions sûres. */
function letterSector(o, cat) {
  const data = LETTER_TAILOR[ACTIVE_PROFILE.id];
  const list = ((data && data.sectors) || []).filter(s => !s.cats || s.cats.includes(cat));
  // « Préparateur de commandes avec visite médicale » n'est pas le secteur de la santé.
  const head = fitText((o.title || '') + ' ' + (o.company || '')).replace(/ (visite|suivi) medical(e)? | mutuelle( sante)? /g, ' ');
  const body = fitText(o.notes || '');
  return list.find(s => s.re.test(head))
    || list.find(s => { const re = s.text === undefined ? s.re : s.text; return !!re && re.test(body); })
    || null;
}

/** Ancien employeur cité dans le CV joint pour cet onglet, ou null. */
function letterEmployer(o, cat) {
  const data = LETTER_TAILOR[ACTIVE_PROFILE.id];
  const company = fitText(o.company || '');
  return ((data && data.employers) || []).find(e => (!e.cats || e.cats.includes(cat)) && e.re.test(company)) || null;
}

function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function listFr(items) {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1];
}

/** Paragraphes ajoutés à la lettre pour cette offre (chaîne vide si l'annonce ne dit rien d'exploitable). */
function offerTailoring(o) {
  const data = LETTER_TAILOR[ACTIVE_PROFILE.id];
  if (!data) return '';
  const cat = jobCategory(o);
  const text = fitText((o.title || '') + ' ' + (o.notes || ''));
  const paragraphs = [];

  // 1. Missions de l'annonce, dans l'ordre où elle les cite.
  const missions = (data.missions[cat] || [])
    .map(m => ({ ...m, at: text.search(m.re) }))
    .filter(m => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 3);
  if (missions.length) {
    const proofs = missions.slice(0, 2).map(m => m.proof);
    paragraphs.push(`Votre annonce met l’accent sur ${listFr(missions.map(m => m.label))}. `
      + `C’est précisément ce que j’ai fait jusqu’ici : ${proofs.join(', et ')}.`);
  }

  // 2. L'entreprise : ancien employeur, sinon son univers.
  const company = letterCompany(o);
  const employer = letterEmployer(o, cat);
  const sector = employer ? null : letterSector(o, cat);
  if (employer) {
    paragraphs.push(employer.text);
  } else if (sector) {
    paragraphs.push(company
      ? `Rejoindre ${company}, dans ${sector.name}, me motive particulièrement : ${sector.reason}.`
      : `Évoluer dans ${sector.name} me motive particulièrement : ${sector.reason}.`);
  } else if (company) {
    paragraphs.push(`Rejoindre ${company} serait pour moi l’occasion de m’investir durablement au sein d’une équipe engagée.`);
  }
  // Apostrophes droites, comme dans les modèles de lettre.
  return paragraphs.map(capFirst).join('\n\n').replace(/’/g, "'");
}
