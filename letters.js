/* ZCRT — lettres de motivation adaptées à chaque offre.
 *
 * offerTailoring(o) lit l'annonce et renvoie deux paragraphes ajoutés à la lettre :
 *  - les missions que l'annonce met en avant, reliées aux expériences réelles du CV ;
 *  - l'univers de l'entreprise (multimédia, mode, santé…) et pourquoi il motive.
 * Rien n'est inventé : chaque preuve reprend une expérience des CV du profil.
 * Les regex portent sur le texte normalisé (minuscules, sans accents) de pilot.js (fitText).
 */

const LETTER_TAILOR = {
  ryan: {
    missions: {
      stock: [
        { re: /reception|receptionner|dechargement|decharger|livraisons?|arrivage/, label: 'la réception des marchandises', proof: 'chez Darty, je réceptionnais et contrôlais chaque jour une livraison importante, avec le suivi des écarts' },
        { re: /rangement|ranger|reserve|stockage|emplacement|adressage/, label: 'l’organisation du stock', proof: 'j’organisais une très grande réserve pour que chaque produit soit retrouvé rapidement' },
        { re: /preparation des? commandes?|picking|colis|expedition|emballage/, label: 'la préparation des commandes', proof: 'j’ai préparé et expédié les commandes d’un catalogue en ligne de plus de 400 références' },
        { re: /inventaire|comptage|ecarts?/, label: 'les inventaires', proof: 'je réalisais les inventaires et le suivi des écarts de stock' },
        { re: /reassort|reapprovision|mise en rayon/, label: 'le réassort', proof: 'j’assurais le réassort des rayons à partir de la réserve' },
        { re: /commandes? fournisseurs?|fournisseurs|approvisionnement|passer les commandes/, label: 'le suivi des commandes fournisseurs', proof: 'au Carré Médical, j’ai piloté les stocks et les commandes fournisseurs de matériel médical' },
        { re: /wms|logiciel|informatique|excel|outils? informatiques?/, label: 'les outils informatiques', proof: 'j’utilise au quotidien un WMS (G.O.L.D) et Excel' },
        { re: /encadr|manag|coordin|chef d equipe/, label: 'la coordination d’équipe', proof: 'j’ai encadré une équipe de six livreurs' },
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
    sectors: [
      { re: /multimedia|electromenager|high tech|telephonie|darty|fnac|boulanger/, name: 'l’univers du multimédia', reason: 'j’y ai déjà fait mes preuves chez Darty' },
      { re: /medical|pharma|sante|hopital|clinique|laboratoire/, name: 'le secteur de la santé', reason: 'au Carré Médical, j’ai géré les stocks de matériel médical, où la rigueur n’est pas une option' },
      { re: /e commerce|ecommerce|vente en ligne|marketplace/, name: 'le e-commerce', reason: 'j’ai géré les stocks et les expéditions d’un catalogue en ligne de plus de 400 références' },
      { re: /cosmeti|beaute|parfum|aroma/, name: 'l’univers de la beauté et des cosmétiques', reason: 'les références y sont nombreuses et délicates, et c’est là que la rigueur fait la différence' },
      { re: /luxe|joaill|horlog|maroquin/, name: 'l’univers du luxe', reason: 'j’y apporterais mon sens du service et mon anglais bilingue' },
      { re: /pret a porter|textile|vetements?|chaussures?|fashion|\bmode\b/, name: 'l’univers de la mode', reason: 'chez COS, j’ai appris l’exigence d’une marque de prêt-à-porter' },
      { re: /bricolage|jardin|ameublement|decoration|leroy merlin|castorama|bricorama|ikea/, name: 'l’univers de la maison et du bricolage', reason: 'j’aime les produits concrets et le conseil pratique' },
      { re: /\bsport|decathlon|intersport/, name: 'l’univers du sport', reason: 'le sport fait partie de ma vie, notamment les arts martiaux' },
      { re: /supermarche|hypermarche|alimentaire|epicerie|fruits|legumes|boucherie|fromagerie|carrefour|monoprix|leclerc|auchan|lidl|franprix|intermarche|mousquetaires|casino/, name: 'la distribution alimentaire', reason: 'je connais bien ce métier pour l’avoir exercé chez Monoprix et E.Leclerc' },
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

// Agences d'intérim et cabinets de recrutement : jamais présentés comme l'employeur.
const LETTER_AGENCY_RE = /adecco|manpower|randstad|\bcrit\b|adequat|synergie|proman|start people|temporis|partnaire|supplay|gojob|staffmatch|interim|talents? |sintel|hays|page personnel|michael page|lhh|expectra|recrutement/i;

function letterCompany(o) {
  const c = String(o.company || '').trim();
  if (!c || /à vérifier/i.test(c) || LETTER_AGENCY_RE.test(c) || o.contract === 'Intérim') return '';
  // « MONOPRIX » → « Monoprix » ; les noms en casse mixte restent tels quels.
  return c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : c;
}

function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function listFr(items) {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1];
}

/** Paragraphes ajoutés à la lettre pour cette offre (chaîne vide si l'annonce ne dit rien d'exploitable). */
function offerTailoring(o) {
  const data = LETTER_TAILOR[ACTIVE_PROFILE.id];
  if (!data) return '';
  const text = fitText((o.title || '') + ' ' + (o.notes || ''));
  const paragraphs = [];

  // 1. Missions de l'annonce, dans l'ordre où elle les cite.
  const missions = (data.missions[jobCategory(o)] || [])
    .map(m => ({ ...m, at: text.search(m.re) }))
    .filter(m => m.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 3);
  if (missions.length) {
    const proofs = missions.slice(0, 2).map(m => m.proof);
    paragraphs.push(`Votre annonce met l’accent sur ${listFr(missions.map(m => m.label))}. `
      + `C’est précisément ce que j’ai fait jusqu’ici : ${proofs.join(', et ')}.`);
  }

  // 2. Univers de l'entreprise (titre, entreprise et texte de l'annonce).
  const company = letterCompany(o);
  // Titre et entreprise d'abord : la description cite souvent d'autres enseignes du groupe.
  const head = fitText((o.title || '') + ' ' + (o.company || ''));
  const sector = data.sectors.find(s => s.re.test(head)) || data.sectors.find(s => s.re.test(text));
  if (sector) {
    paragraphs.push(company
      ? `Rejoindre ${company}, dans ${sector.name}, me motive particulièrement : ${sector.reason}.`
      : `Évoluer dans ${sector.name} me motive particulièrement : ${sector.reason}.`);
  } else if (company) {
    paragraphs.push(`Rejoindre ${company} serait pour moi l’occasion de m’investir durablement au sein d’une équipe engagée.`);
  }
  // Apostrophes droites, comme dans les modèles de lettre.
  return paragraphs.map(capFirst).join('\n\n').replace(/’/g, "'");
}
