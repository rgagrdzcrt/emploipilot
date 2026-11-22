/* ZCRT — lettre de motivation composée entièrement selon l'offre.
 *
 * Accroche, expériences choisies, qualités, motivation, conclusion et formule de
 * politesse changent d'une offre à l'autre ; le choix est stable (même offre → même
 * lettre). Utilisée par fillTemplate (pilot.js) quand le profil a des données
 * ci-dessous et que le modèle du métier n'a pas été personnalisé dans « Critères ».
 * S'appuie sur letters.js (missions, secteurs, entreprise) et pilot.js (fitText, cityOf…).
 * Rien n'est inventé : chaque expérience reprend une ligne du CV joint pour l'onglet
 * (experiences[].cats), et seules celles-là sont citées.
 */

const LETTER_PROFILE = {
  ryan: {
    // Domicile (CV) : départ des temps de trajet calculés par la collecte (sources.json, trajets).
    home: 'Bondy',
    domains: {
      stock: { years: 'près de 4 ans', domain: 'en stock et en logistique' },
      // exact: false → jamais « c'est précisément le métier que j'exerce » (poste jamais occupé tel quel).
      preparation: { years: 'près de 4 ans', domain: 'en stock et en logistique', exact: false },
      aeroport: { years: 'près de 4 ans', domain: 'en stock et en logistique', exact: false },
      tri: { years: 'près de 4 ans', domain: 'en stock et en logistique', exact: false },
      encadrement: { years: 'près de 3 ans', domain: "en encadrement d'équipe, en magasin et en logistique", exact: false },
      rayon: { years: 'plus de 3 ans', domain: 'en grande distribution' },
      vente: { years: 'plus de 3 ans', domain: 'dans la vente' },
    },
    // Dans l'ordre du CV (du plus récent au plus ancien) : à score égal, la plus récente passe devant,
    // et la lettre les cite dans cet ordre.
    experiences: [
      // CV stock : Stock, Préparation, Aéroport, Tri.
      { cats: ['stock', 'tri', 'aeroport'], re: /coordin|reserve|inventaire|rupture|reassort|niveaux? de stock|suivi des stocks|cosmeti|beaute|magasin|boutique/g,
        text: ["Coordinateur stock chez Aroma-Zone à Rosny-sous-Bois, j'ai coordonné les réceptions et la mise en stock, organisé la réserve et suivi les ruptures pour planifier le réassort avec l'équipe de vente.",
          "Chez Aroma-Zone, comme coordinateur stock, j'ai organisé la réserve, suivi les niveaux de stock et les ruptures, et préparé les inventaires avec l'analyse des écarts."] },
      { cats: ['stock', 'preparation', 'tri'], re: /preparation|commande|expedition|colis|emballage|e commerce|ecommerce|catalogue|reference|envoi|picking|sourcing/g,
        text: ["À distance, pour la boutique en ligne Les Dinedourelles, j'ai géré un catalogue de plus de 400 références : référencement, suivi des stocks, préparation et expédition des commandes.",
          "Pour Les Dinedourelles, une boutique en ligne de plus de 400 références, j'ai assuré le suivi des stocks ainsi que la préparation et l'expédition des commandes."] },
      { cats: ['stock', 'encadrement', 'aeroport'], re: /commande|fournisseur|approvision|encadr|equipe|coordin|livreur|medical|sante|pilot|responsable/g,
        text: ["Responsable logistique au Carré Médical, j'ai piloté les stocks et les commandes fournisseurs de matériel médical et encadré une équipe de six livreurs.",
          "Au Carré Médical, j'ai pris en charge toute la logistique : suivi des stocks, commandes auprès des fournisseurs et coordination d'une équipe de six livreurs."] },
      { cats: ['preparation'], re: /etablissements? de sante|hopit|clinique|medical|sante|pharma/g,
        text: ["Au Carré Médical, j'ai préparé et suivi les commandes de matériel médical destinées aux établissements de santé.",
          "Au Carré Médical, je préparais et suivais les commandes destinées aux établissements de santé."] },
      { cats: ['stock', 'tri', 'aeroport', 'preparation'], re: /reception|livraison|controle|reserve|rangement|stock|reassort|inventaire|ecart|magasinier/g,
        text: ["Magasinier chez Darty à Paris, je réceptionnais et contrôlais les livraisons quotidiennes, je traitais les écarts et j'organisais une très grande réserve pour que chaque produit soit retrouvé rapidement.",
          "Chez Darty, en tant que magasinier, j'ai géré au quotidien la réception, le contrôle et la mise en stock des livraisons, ainsi que la préparation des commandes et le réassort des rayons."] },
      // CV rayon : Encadrement.
      { cats: ['rayon', 'encadrement'], re: /mise en rayon|reassort|frais|fruits|legumes|rotation|qualite|casse|commande|chef de rayon|equipe|monoprix/g,
        text: ["J'ai commencé comme employé de rayon Fruits & Légumes chez Monoprix, avant d'en devenir chef de rayon : mise en rayon, fraîcheur, commandes et suivi des stocks pour limiter la casse.",
          "Chez Monoprix, d'abord employé puis chef du rayon Fruits & Légumes, j'ai assuré le réassort, la rotation et la qualité des produits, tout en gérant les commandes et l'équipe."] },
      { cats: ['rayon', 'encadrement'], re: /epicerie|stock|commande|plv|evenement|operation|equipe|coordin|proprete|reassort|leclerc/g,
        text: ["Chez E.Leclerc, comme référent du rayon épicerie, j'ai suivi les stocks et les commandes, coordonné l'équipe pour le réassort et la propreté des rayons, et mis en place les PLV.",
          "Référent épicerie chez E.Leclerc, je pilotais les stocks, les commandes et le réassort, et j'animais les opérations commerciales du rayon."] },
      // CV vente.
      { cats: ['vente'], re: /conseil|besoin|multimedia|telephonie|informatique|technique|services|objectif|vente additionnelle|equipe|darty/g,
        text: ["Chez Darty à Paris 19e, j'ai été conseiller de vente puis référent du pôle multimédia : découverte des besoins, conseil sur des produits techniques, vente de services associés et suivi des objectifs de l'équipe.",
          "Référent du pôle multimédia chez Darty, j'accompagnais les clients jusqu'à l'achat, je proposais les services associés et je transmettais les bonnes pratiques à l'équipe."] },
      { cats: ['vente'], re: /mode|pret a porter|collection|visuel|merchandising|cabine|encaissement|anglais|international|boutique|accueil/g,
        text: ["Chez COS à Paris 11e, j'ai accueilli et conseillé une clientèle française et internationale, mis en valeur les collections et assuré l'encaissement et la tenue de la boutique.",
          "Conseiller de vente chez COS, j'ai conseillé une clientèle internationale en français et en anglais, dans le respect des standards visuels de la marque."] },
    ],
    // Qualités que le parcours permet d'affirmer : regex de l'annonce → mot.
    qualities: [
      [/rigueur|rigoureu/, 'rigoureux'], [/organis/, 'organisé'], [/autonom/, 'autonome'], [/ponctu/, 'ponctuel'],
      [/dynami/, 'dynamique'], [/polyvalen/, 'polyvalent'], [/reactiv/, 'réactif'], [/souri|bonne humeur/, 'souriant'],
      [/esprit d equipe|travail en equipe|en equipe/, "à l'aise en équipe"], [/fiab|serieu/, 'fiable'],
    ],
    defaultQualities: {
      stock: ['rigoureux', 'organisé', 'fiable'],
      preparation: ['rigoureux', 'organisé', 'ponctuel'],
      encadrement: ['organisé', "à l'aise en équipe", 'fiable'],
      aeroport: ['ponctuel', 'rigoureux', 'fiable'],
      tri: ['rigoureux', 'ponctuel', 'fiable'],
      rayon: ['ponctuel', 'polyvalent', "à l'aise en équipe"],
      vente: ['souriant', "à l'écoute", 'motivé par les objectifs'],
    },
  },
};

/** Choix stable d'une variante : même offre → même phrase, offres différentes → phrases variées. */
function letterVariant(list, o, salt) {
  let h = 2166136261;
  for (const ch of String(o.id || o.title) + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return list[Math.abs(h) % list.length];
}

const VOWEL_START = /^[aeiouyhàâéèêëîïôûü]/i;
function dePoste(poste) { return (VOWEL_START.test(poste) ? "d'" : 'de ') + poste; }
function enTantQue(poste) { return (VOWEL_START.test(poste) ? "en tant qu'" : 'en tant que ') + poste; }
/** « à Carrefour », « au Carré Médical » (« Le Carré Médical »), « au Groupement Mousquetaires ». */
function aCompany(c) {
  if (/^le\s/i.test(c)) return 'au ' + c.slice(3);
  if (/^les\s/i.test(c)) return 'aux ' + c.slice(4);
  return (/^(groupe|groupement)\b/i.test(c) ? 'au ' : 'à ') + c;
}
/** « de Carrefour », « d'Aroma-Zone », « du Carré Médical ». */
function deCompany(c) {
  if (/^le\s/i.test(c)) return 'du ' + c.slice(3);
  if (/^les\s/i.test(c)) return 'des ' + c.slice(4);
  return (VOWEL_START.test(c) ? "d'" : 'de ') + c;
}

// Intitulés souvent écrits sans accents dans les annonces (« Employe commercial »).
const POSTE_ACCENTS = [[/\bemploye(e?s?)\b/g, 'employé$1'], [/\bpreparat(eur|rice)/g, 'préparat$1'], [/\breceptionnaire/g, 'réceptionnaire'],
  [/\bequipier/g, 'équipier'], [/\bresponsable d entrepot/g, "responsable d'entrepôt"], [/\bentrepot/g, 'entrepôt'],
  [/\boperat(eur|rice)/g, 'opérat$1'], [/\breassort/g, 'réassort'], [/\bvehicule/g, 'véhicule']];
function accentPoste(p) { return POSTE_ACCENTS.reduce((t, [re, to]) => t.replace(re, to), p); }

// Lieu réduit à un département ou à la région (EURES) : pas de « à 20 minutes de Seine-Saint-Denis ».
const LETTER_AREA_RE = /^(seine[- ]saint[- ]denis|seine[- ]et[- ]marne|val[- ]de[- ]marne|val[- ]d['’ ]?oise|hauts[- ]de[- ]seine|essonne|yvelines|[iî]le[- ]de[- ]france)$/i;

/** Lettre complète pour l'offre, ou '' si le profil n'a pas de données de composition. */
function composeLetter(o) {
  const lp = LETTER_PROFILE[ACTIVE_PROFILE.id], data = LETTER_TAILOR[ACTIVE_PROFILE.id];
  const cat = jobCategory(o), dom = lp && lp.domains[cat];
  if (!dom || !data) return '';
  const text = fitText((o.title || '') + ' ' + (o.notes || ''));
  const poste = accentPoste(letterPoste(o)), company = letterCompany(o), infos = infosOf();
  const v = (list, salt) => letterVariant(list, o, salt);
  const parts = ['Madame, Monsieur,'];

  // 1. Accroche, au nom de l'entreprise quand on la connaît.
  const precise = dom.exact === false ? '' : `c'est précisément le métier que j'exerce depuis ${dom.years}`;
  // Intitulé introuvable (letterPoste rend « ce poste ») : accroches qui ne le nomment pas,
  // au lieu de « un poste de ce poste ».
  const openings = poste === 'ce poste' ? (company ? [
    `Votre offre chez ${company} a retenu toute mon attention : avec ${dom.years} d'expérience ${dom.domain}, je peux y être efficace rapidement.`,
    `C'est avec un grand intérêt que je propose ma candidature ${aCompany(company)}. Fort de ${dom.years} d'expérience ${dom.domain}, je suis opérationnel rapidement.`,
  ] : [
    `Votre annonce a retenu toute mon attention : avec ${dom.years} d'expérience ${dom.domain}, je peux être efficace rapidement.`,
    `C'est avec un grand intérêt que je vous propose ma candidature. Fort de ${dom.years} d'expérience ${dom.domain}, je suis opérationnel rapidement.`,
  ]) : company ? [
    `Votre offre ${dePoste(poste)} chez ${company} a retenu toute mon attention : ${precise || `avec ${dom.years} d'expérience ${dom.domain}, je peux y être efficace rapidement`}.`,
    `Rejoindre ${company} ${enTantQue(poste)} serait pour moi une belle étape : avec ${dom.years} d'expérience ${dom.domain}, je peux être efficace dès mon arrivée.`,
    `C'est avec un grand intérêt que je propose ma candidature ${aCompany(company)} pour le poste ${dePoste(poste)}. Fort de ${dom.years} d'expérience ${dom.domain}, je suis opérationnel rapidement.`,
  ] : [
    ...(precise ? [`Votre offre ${dePoste(poste)} a retenu toute mon attention : ${precise}.`] : []),
    `C'est avec un grand intérêt que je vous propose ma candidature au poste ${dePoste(poste)}. Fort de ${dom.years} d'expérience ${dom.domain}, je suis opérationnel rapidement.`,
    `${capFirst(dom.years)} d'expérience ${dom.domain} m'ont donné les réflexes qu'exige un poste ${dePoste(poste)} : votre annonce a donc tout de suite retenu mon attention.`,
  ];
  // Ancien employeur du CV joint : « Revenir chez… » plus bas, donc pas d'accroche « Rejoindre… ».
  const employer = letterEmployer(o, cat);
  const opening = v(employer ? openings.filter(t => !t.startsWith('Rejoindre')) : openings, 'accroche');
  parts.push(opening);

  // 2. Expériences du CV de l'onglet les plus proches de l'annonce, introduites par ce qu'elle demande.
  const missions = (data.missions[cat] || []).map(m => ({ ...m, at: text.search(m.re) })).filter(m => m.at >= 0)
    .sort((a, b) => a.at - b.at).slice(0, 3);
  const scored = lp.experiences.map((e, i) => ({ e, i, s: (text.match(e.re) || []).length }))
    .filter(x => x.e.cats.includes(cat))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const chosen = scored.slice(0, scored[2] && scored[2].s >= 2 ? 3 : 2).sort((a, b) => a.i - b.i);
  const labels = listFr(missions.map(m => m.label));
  const known = missions.length > 1 ? 'des missions que je connais bien' : 'une mission que je connais bien';
  const intros = [`Vous recherchez quelqu'un pour ${labels} : c'est ce que j'ai fait au quotidien.`];
  if (!/annonce/.test(opening)) intros.push(`Votre annonce met l'accent sur ${labels}, ${known}.`);
  const intro = missions.length
    ? v(intros, 'intro')
    : v(["Mon parcours m'a préparé à ce poste.", 'Voici ce que je peux vous apporter.'], 'intro');
  parts.push([intro, ...chosen.map(c => v(c.e.text, 'exp' + c.i))].join(' '));

  // 3. Qualités : celles que l'annonce demande, complétées par celles du métier.
  const asked = lp.qualities.map(([re, word]) => ({ word, at: text.search(re) })).filter(q => q.at >= 0)
    .sort((a, b) => a.at - b.at).map(q => q.word);
  const qualities = [...new Set([...asked, ...lp.defaultQualities[cat]])].slice(0, 3);
  parts.push(v([`${capFirst(listFr(qualities))}, je m'adapte rapidement à une nouvelle équipe et à ses méthodes.`,
    `Ce qui me caractérise : je suis ${listFr(qualities)}.`,
    `${capFirst(listFr(qualities))}, j'aime le travail bien fait et je m'investis pleinement dans mes missions.`], 'qualites'));

  // 4. L'entreprise : ancien employeur du CV joint, sinon son univers (sans répéter le nom
  // si l'accroche l'a déjà cité), puis la proximité du site.
  const sector = employer ? null : letterSector(o, cat);
  const named = company && opening.includes(company);
  if (employer) {
    parts.push(employer.text);
  } else if (sector) {
    parts.push(company && !named
      ? `Rejoindre ${company}, dans ${sector.name}, me motive particulièrement : ${sector.reason}.`
      : `Évoluer dans ${sector.name} me motive particulièrement : ${sector.reason}.`);
  }
  const city = cityOf(o);
  if (lp.home && city && !LETTER_AREA_RE.test(city) && typeof o.trajetMin === 'number' && o.trajetMin <= 30) {
    parts.push(fitText(city) === fitText(lp.home)
      ? `J'habite moi-même à ${lp.home} : je peux être sur place rapidement et en toute ponctualité.`
      : `J'habite à ${lp.home}, à environ ${Math.max(5, Math.round(o.trajetMin / 5) * 5)} minutes de ${city} en transports en commun : je peux être sur place rapidement et en toute ponctualité.`);
  }
  if (infos.accroche) parts.push(infos.accroche);

  // 5. Conclusion (missions courtes : intérim, CDD) et formule de politesse.
  const dispo = infos.disponibilite || 'immédiatement';
  const temporary = o.contract === 'Intérim' || o.contract === 'CDD';
  const endings = temporary
    ? [`Disponible ${dispo}, je peux démarrer rapidement et serais heureux d'en échanger avec vous.`,
        `Disponible ${dispo} pour cette mission, je me tiens à votre disposition pour un entretien.`]
    : [`Disponible ${dispo}, je serais heureux de vous rencontrer pour vous présenter ma motivation.`,
        `Disponible ${dispo}, je me tiens à votre disposition pour un entretien, à la date qui vous conviendra.`,
        `Je serais ravi d'en discuter avec vous lors d'un entretien ; je suis disponible ${dispo}.`];
  if (company) {
    endings.push(temporary
      ? `Disponible ${dispo} pour cette mission chez ${company}, je peux démarrer rapidement et serais heureux d'en échanger avec vous.`
      : `Disponible ${dispo}, je serais heureux de rejoindre les équipes ${deCompany(company)} et de vous présenter ma motivation lors d'un entretien.`);
  }
  parts.push(v(endings, 'fin'));
  parts.push(v(["Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
    "Dans l'attente de votre retour, je vous prie de recevoir, Madame, Monsieur, mes sincères salutations.",
    "Je vous remercie de l'attention portée à ma candidature et vous prie d'agréer mes salutations distinguées."], 'politesse'));
  const contact = [infos.telephone, infos.email].filter(Boolean).join(' — ');
  parts.push([[infos.prenom, infos.nom].filter(Boolean).join(' '), contact].filter(Boolean).join('\n'));

  return parts.filter(Boolean).join('\n\n').replace(/’/g, "'").replace(/ {2,}/g, ' ').trim();
}
