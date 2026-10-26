/* ZCRT — outils de candidature rapide.
 *
 * - Tri au clavier des nouvelles offres (À postuler / Ignorer).
 * - File de candidature : ouvre l'annonce, copie la lettre personnalisée,
 *   marque la candidature envoyée.
 * - Modèles de lettre par métier et « Mes infos » à copier en un clic.
 * - Score de priorité (zone, contrat, fraîcheur) et relances automatiques.
 * - Synchronisation téléphone / PC via un gist GitHub secret.
 *
 * Chargé avant le script principal d'index.html : ce fichier ne fait que
 * déclarer des fonctions ; pilotInit() est appelé à la fin du script principal.
 */

// Métiers du profil actif (profiles.js).
const CATS = ACTIVE_PROFILE.cats;
const CAT_LABELS = Object.fromEntries(CATS.map(c => [c, CAT_INFO[c].label]));
const RELANCE_DAYS = 7;

const RYAN_TEMPLATES = {
  stock: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Avec près de 4 ans d'expérience en stock et en logistique, je souhaite mettre ma rigueur et mon savoir-faire au service de votre équipe.

Magasinier chez Darty à Paris, je réceptionnais et contrôlais chaque jour une livraison importante et j'organisais une très grande réserve, pour que chaque produit soit retrouvé rapidement. Responsable logistique au Carré Médical, j'ai ensuite piloté les stocks et les commandes fournisseurs de matériel médical et encadré une équipe de six livreurs. Plus récemment, j'ai assuré le suivi des stocks et l'expédition des commandes d'un catalogue en ligne de plus de 400 références. J'utilise au quotidien G.O.L.D, un WMS et Excel.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
  rayon: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Avec plus de 3 ans d'expérience en grande distribution, je connais les exigences d'un rayon bien tenu : réassort, fraîcheur, présentation et service au client.

J'ai commencé comme employé de rayon Fruits & Légumes chez Monoprix, avant d'en devenir chef de rayon : approvisionnements, suivi des stocks et des ventes, travail avec l'équipe au quotidien. Chez E.Leclerc, comme référent du rayon épicerie, j'ai suivi les stocks et les commandes, coordonné l'équipe pour assurer le réassort et la propreté des rayons, et mis en place les PLV et les événements commerciaux.

Ponctuel, polyvalent et à l'aise en équipe, je m'adapte rapidement à l'organisation d'un nouveau magasin.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
  vente: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Diplômé d'un BTS Commerce international, j'ai plus de 3 ans d'expérience en vente, dans le multimédia comme dans la mode.

Chez Darty à Paris 19e, j'ai été conseiller de vente puis référent du pôle multimédia : découverte des besoins des clients, conseil sur les produits techniques, vente de services associés et suivi des objectifs de l'équipe. Plus récemment, chez COS à Paris 11e, j'ai accueilli et conseillé une clientèle française et internationale, mis en valeur les collections et assuré l'encaissement et la tenue de la boutique. Mon anglais bilingue est un vrai atout face à une clientèle étrangère.

À l'écoute, souriant et motivé par les objectifs, j'aime le contact client et le travail en équipe.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
};
const DEFAULT_TEMPLATES = ACTIVE_PROFILE.templates || RYAN_TEMPLATES;

const INFO_FIELDS = [
  ['prenom', 'Prénom'], ['nom', 'Nom'], ['telephone', 'Téléphone'], ['email', 'E-mail'],
  ['adresse', 'Adresse / ville'], ['disponibilite', 'Disponibilité'],
  ['permis', 'Permis / CACES'], ['accroche', 'Phrase d’accroche (facultative)'],
];
const DEFAULT_INFOS = { disponibilite: 'immédiatement' };

function templatesOf() { return { ...DEFAULT_TEMPLATES, ...(profile.templates || {}) }; }
function infosOf() { return { ...DEFAULT_INFOS, ...(profile.infos || {}) }; }
function cvOf(cat) { return (profile.cv || {})[cat] || (ACTIVE_PROFILE.cv || {})[cat] || ''; }

function jobCategory(o) {
  if (CATS.includes(o.category)) return o.category;
  const c = categoryOf(o);
  return CATS.includes(c) ? c : CATS[0];
}

function cleanTitle(t) {
  let s = String(t || '')
    .replace(/\(?\b[hfx]\s*\/\s*[hfx](\s*\/\s*[hfx])?\b\)?/gi, ' ')
    .replace(/\s{2,}/g, ' ').replace(/[\s\-–|]+$/, '').trim();
  // « Vendeur - Paris 10e » → « Vendeur » : on retire les suffixes de lieu.
  let parts = s.split(/\s+[-–|]\s+/);
  while (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (!/\d{2}/.test(tail) && !deptOf({ location: tail })) break;
    parts.pop();
  }
  s = parts.join(' - ');
  if (s && s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  return s;
}

function cityOf(o) {
  const c = String(o.location || '').split(/[,(]/)[0].replace(/\b\d{5}\b/g, '').trim();
  return /vérifier/i.test(c) ? '' : c;
}

// Mots qui désignent un métier : sert à garder, dans le titre de l'annonce, le segment qui nomme le poste.
const JOB_WORD_RE = /vend|conseill|employ|magasin|stock|logisti|pr[eé]parat|caiss|h[oô]te|rayon|serveu|chef|barista|runner|barman|barmaid|r[eé]ceptionn|agent|gestionnaire|[eé]quipi|commis|cariste|approvision|assistant|coordinat|responsable|r[eé]f[eé]rent|sales|styliste/i;

/** Intitulé du poste pour la lettre : « Conseiller de Vente - Aéroport CDG » → « conseiller de vente »
 * (sans lieu, contrat, horaires ni « H/F » ; en minuscules, sauf les sigles). */
function letterPoste(o) {
  const raw = String(o.title || '')
    .replace(/\(?\b[hfx]\s*\/\s*[hfx](\s*\/\s*[hfx])?\b\)?/gi, ' ')
    // Formes féminines accolées : « Conseiller(e) », « Vendeur.euse », « Conseiller·ère ».
    .replace(/\((e|[eè]re|se|euse|trice|ne)\)/gi, '')
    .replace(/(\w)[.·](e|[eè]re|euse|se|trice|ne)\b/gi, '$1')
    // « Employée, Employé de rayon » → « Employé de rayon ».
    .replace(/(\p{L}+),\s*(\p{L}+)/gu, (m, f, g) => (f.slice(0, 5).toLowerCase() === g.slice(0, 5).toLowerCase() ? g : m));
  const parts = raw.split(/\s+[-–—|]\s+|\s*[|()]\s*/).map(p => p.trim()).filter(Boolean);
  const i = Math.max(0, parts.findIndex(p => JOB_WORD_RE.test(p)));
  let poste = parts[i] || '';
  // « Préparateur - Préparatrice de commandes » → « préparateur de commandes ».
  const next = parts[i + 1] || '';
  if (!poste.includes(' ') && next.includes(' ') && poste.slice(0, 5).toLowerCase() === next.slice(0, 5).toLowerCase()) {
    poste += next.slice(next.indexOf(' '));
  }
  // Sans le nom de l'entreprise (« Conseiller de vente IKKS »).
  const company = norm(o.company || '');
  poste = poste.split(' ').filter(w => !(company && norm(w).length >= 3 && company.includes(norm(w)))).join(' ');
  poste = poste
    .replace(/\b(CDI|CDD|int[eé]rim\w*|alternance|saisonnier|temps (plein|partiel)|\d+\s?h(eures)?(\s?\/\s?sem\w*)?)\b/gi, ' ')
    .replace(/[\s,;:.–-]+$/, '').replace(/^[\s,;:.–-]+/, '').replace(/\s{2,}/g, ' ').trim();
  // Minuscules, sauf les sigles d'un titre écrit en casse normale (« ELS », « PAP »…).
  const allCaps = poste === poste.toUpperCase();
  return poste.split(' ').map(w => !allCaps && /^[A-Z]{2,4}$/.test(w) ? w : w.toLowerCase()).join(' ') || 'ce poste';
}

function fillTemplate(o) {
  const company = (!o.company || /à vérifier/i.test(o.company)) ? 'votre entreprise' : o.company;
  const poste = letterPoste(o);
  const empty = Object.fromEntries(INFO_FIELDS.map(([k]) => [k, '']));
  const vars = { ...empty, ...infosOf(), poste, entreprise: company, ville: cityOf(o) };
  return templatesOf()[jobCategory(o)]
    // Pas de ligne « Objet » ni d'entreprise après le poste, même dans un modèle personnalisé.
    .replace(/^\s*Objet\s*:[^\n]*\n+/i, '')
    .replace(/\{poste\} chez \{entreprise\}/g, '{poste}')
    // « poste de employé » → « poste d'employé »
    .replace(/\bde \{poste\}/g, /^[aeiouyhàâéèêëîïôûü]/i.test(poste) ? "d'{poste}" : 'de {poste}')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (vars[k] || '') : m))
    .replace(/^[ \t]*—[ \t]*|[ \t]*—[ \t]*$/gm, '') // « tél — e-mail » avec une info vide
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Message de relance pour une candidature restée sans réponse. */
function relanceText(o) {
  const i = infosOf();
  const company = (!o.company || /à vérifier/i.test(o.company)) ? '' : o.company;
  let poste = cleanTitle(o.title);
  if (poste && !/^[A-ZÀ-Ý]{2}/.test(poste)) poste = poste.charAt(0).toLowerCase() + poste.slice(1);
  const de = /^[aeiouyhàâéèêëîïôûü]/i.test(poste) ? "d'" : 'de ';
  const quand = o.appliedDate
    ? 'Le ' + new Date(o.appliedDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ', je'
    : "Il y a quelques jours, j'";
  const signature = [[i.prenom, i.nom].filter(Boolean).join(' '), i.telephone, i.email].filter(Boolean).join(' — ');
  return `Objet : Relance – candidature au poste ${de}${poste}

Bonjour,

${quand}${quand.endsWith("j'") ? 'ai' : ' vous ai'} envoyé ma candidature pour le poste ${de}${poste}${company ? ' chez ' + company : ''}. Je me permets de revenir vers vous, car ce poste m'intéresse toujours beaucoup.

Je suis disponible ${i.disponibilite || 'rapidement'} et je peux venir en entretien quand cela vous convient.

Bien cordialement,
${signature}`.trim();
}

/* ---------- Score : adéquation entre l'offre et le CV du métier ----------
 * Seuls comptent l'intitulé, les compétences et les exigences de l'annonce, comparés
 * au CV du profil (profiles.js, « fit »). Zone, distance, contrat et fraîcheur n'y
 * entrent pas. Sur 100 :
 *   intitulé déjà occupé (jusqu'à 40) + compétences retrouvées (jusqu'à 35)
 *   + atouts (enseigne connue, langue) (jusqu'à 25) − exigences non remplies. */

function fitText(s) {
  return ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ').trim() + ' ';
}
function fitHas(text, phrase) { return text.includes(' ' + phrase + ' ') || text.includes(' ' + phrase + 's '); }

const FIT_LANGS = ['anglais', 'espagnol', 'allemand', 'italien', 'portugais', 'arabe', 'chinois', // pas « mandarin » : souvent l'hôtel Mandarin Oriental
  'japonais', 'russe', 'coreen', 'neerlandais'];
const FIT_OPTIONAL = /atout|apprecie|un plus|souhaite|serait un|bonus/;
const FIT_LINK_WORDS = ['de', 'des', 'du', 'd', 'en', 'la', 'le', 'les', 'a'];
const fitCache = new Map();

function cvFit(o) {
  const cat = jobCategory(o);
  const key = o.id + '|' + cat + '|' + (o.title || '').length + '|' + (o.notes || '').length;
  if (fitCache.has(key)) return fitCache.get(key);
  const cv = ACTIVE_PROFILE.fit, c = cv && cv.cats[cat];
  if (!c) return { score: 0, plus: [], minus: [] };
  const title = fitText(o.title), body = fitText((o.title || '') + ' ' + (o.notes || ''));
  const plus = [], minus = [];
  let s = 0;

  // 1. Intitulé : poste déjà occupé (40), sinon mots du métier présents (jusqu'à 25).
  // « Conseiller.ère de vente », « Préparateur - Préparatrice de commandes » : tous les mots du poste suffisent.
  const sameTitle = c.titles.find(t => fitHas(title, t)
    || t.split(' ').filter(w => !FIT_LINK_WORDS.includes(w)).every(w => fitHas(title, w)));
  if (sameTitle) { s += 40; plus.push('poste déjà occupé (' + sameTitle + ')'); }
  else {
    const words = new Set(c.titles.flatMap(t => t.split(' ')).filter(w => w.length >= 5));
    const found = [...words].filter(w => fitHas(title, w));
    if (found.length) { s += Math.min(25, 12 * found.length); plus.push('intitulé proche (' + found.slice(0, 2).join(', ') + ')'); }
  }

  // 2. Compétences du CV retrouvées dans l'annonce (35 points à partir de 5).
  const skills = c.skills.filter(k => fitHas(body, k));
  s += Math.round(35 * Math.min(1, skills.length / 5));
  if (skills.length) plus.push(skills.length + ' compétence(s) du CV : ' + skills.slice(0, 4).join(', '));

  // 3. Atouts : enseigne où le profil a travaillé, langue demandée et parlée.
  const brand = c.brands.find(b => fitHas(fitText(o.company), b) || fitHas(body, b));
  if (brand) { s += 10; plus.push('enseigne connue (' + brand + ')'); }
  const langs = FIT_LANGS.filter(l => fitHas(body, l) || (l === 'anglais' && /\b(english|bilingue)\b/.test(body)));
  const spoken = langs.filter(l => cv.languages.includes(l));
  if (spoken.length) { s += 15; plus.push('langue demandée : ' + spoken.join(', ')); }

  // 4. Exigences non remplies (sauf si l'annonce les présente comme un simple atout).
  const required = (re) => {
    const m = body.match(re);
    if (!m) return false;
    const around = body.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
    return !FIT_OPTIONAL.test(around);
  };
  const exp = body.match(/ (\d{1,2}) (?:a \d{1,2} )?ans? (?:minimum )?(?:d )?experience| experience (?:de |d au moins |minimum (?:de )?)?(\d{1,2}) ans? /);
  const years = exp ? Number(exp[1] || exp[2]) : 0;
  if (years > c.years) { s -= 15; minus.push(years + ' ans d’expérience demandés'); }
  const missing = langs.filter(l => !cv.languages.includes(l) && required(new RegExp(' ' + l + ' ')));
  if (missing.length) { s -= 15; minus.push('langue non parlée : ' + missing.join(', ')); }
  if (!cv.caces && required(/ caces /)) { s -= 15; minus.push('CACES demandé'); }
  if (cv.permis === false && required(/ permis b | vehicule /)) { s -= 10; minus.push('permis demandé'); }
  if (!cv.management && / (responsable|manager|directeur|directrice|chef d equipe|adjoint) /.test(title)) {
    s -= 15; minus.push('poste d’encadrement');
  }
  if (cv.degree < 5 && required(/ (bac ?\+ ?5|master) /)) { s -= 10; minus.push('bac + 5 demandé'); }

  const result = { score: Math.max(0, Math.min(100, s)), plus, minus };
  fitCache.set(key, result);
  return result;
}

/** Score utilisé pour trier (« Tri : adéquation ») et affiché dans « Préparer ». */
function score(o) { return cvFit(o).score; }

/** Ligne d'explication du score (points forts et points à vérifier). */
function fitWhy(o) {
  const f = cvFit(o);
  const parts = [...f.plus.map(p => '✓ ' + p), ...f.minus.map(m => '⚠ ' + m)];
  return parts.length ? parts.join(' · ') : 'Peu de points communs avec le CV.';
}

/* ---------- Types de postes à masquer (réglables dans Critères & modèles) ---------- */

const JOB_TYPES = [
  { id: 'luxe', label: 'Luxe / bijouterie / horlogerie', re: /luxe|luxury|bijou|joaill|horlog|maroquin/i },
  { id: 'bouche', label: 'Métiers de bouche (boucherie, charcuterie, poissonnerie, fromagerie, traiteur, boulangerie)', re: /bouch|charcut|poisson|fromag|traiteur|cr[eè]merie|boulangerie|p[aâ]tiss|viennois|\bcoupe\b/i },
  { id: 'cosmetique', label: 'Cosmétique / parfumerie', re: /cosm[eé]t|parfum|beaut[eé]/i },
  { id: 'animalerie', label: 'Animalerie', re: /animal/i },
  { id: 'auto', label: 'Automobile', re: /automobile|v[eé]hicule|pneu|\bauto\b/i },
  { id: 'cariste', label: 'Cariste / CACES', re: /cariste|caces|chariot/i },
  { id: 'weekend', label: 'Week-end / étudiant', re: /week.?end|samedi|dimanche|[eé]tudiant/i },
  { id: 'caisse', label: 'Caisse (vendeur-caissier, hôte de caisse)', re: /caiss/i },
  { id: 'partiel', label: 'Temps partiel (moins de 35 h)', re: /temps partiel|\b(1\d|2\d|3[0-4])\s?h\b/i },
  { id: 'mode', label: 'Mode / prêt-à-porter / chaussures', re: /\bmode\b|pr[eê]t.{0,3}[àa].{0,3}porter|fashion|textile|chauss/i },
  { id: 'multimedia', label: 'Multimédia / téléphonie / électroménager', re: /multim|t[eé]l[eé]phon|[eé]lectrom|high.?tech/i },
  { id: 'interim', label: 'Missions d’intérim', test: o => norm(o.contract) === 'interim' },
  { id: 'direction', label: 'Postes de direction (directeur, head of)', re: /directeur|directrice|\bdirection\b|head of/i },
];
const MAX_OFFER_AGE_DAYS = 10; // annonces publiées il y a plus de 10 jours : masquées (les deux profils)

function matchesType(type, o) {
  return type.test ? type.test(o) : type.re.test(o.title || '');
}

function tooOld(o) {
  const d = parseDate(offerDate(o));
  return !!d && Date.now() - d.getTime() > MAX_OFFER_AGE_DAYS * 864e5;
}
const DEFAULT_HIDDEN_TYPES = ACTIVE_PROFILE.hiddenTypes
  || ['luxe', 'bouche', 'cosmetique', 'animalerie', 'auto', 'cariste', 'weekend', 'caisse', 'direction'];

function hiddenTypes() { return Array.isArray(profile.hiddenTypes) ? profile.hiddenTypes : DEFAULT_HIDDEN_TYPES; }

function excludedWords() {
  return String(profile.excludedWords || '').split(',').map(w => norm(w)).filter(Boolean);
}

/** Offre d'un type masqué ou contenant un mot exclu (les offres suivies restent visibles). */
function isHiddenType(o) {
  if (isTracked(o)) return false;
  if (tooOld(o)) return true;
  const hidden = hiddenTypes();
  if (JOB_TYPES.some(t => hidden.includes(t.id) && matchesType(t, o))) return true;
  const t = norm(o.title || '');
  return excludedWords().some(w => t.includes(w));
}

/** Statuts retirés de « Offres repérées » et du compteur « Offres affichées » : seules les offres
 * à examiner y restent (« À postuler » a son onglet, les autres sont dans Candidatures). */
const HORS_REPEREES = ['À postuler', 'Ignorée', 'Candidature envoyée', 'Entretien', 'Refus', 'À relancer'];

/** Offres repérées d'une catégorie, comptées exactement comme la liste (doublons, masquage, statuts). */
function repereesOf(cat) {
  let list = offers.filter(o => categoryOf(o) === cat);
  if (document.getElementById('hideDuplicates')?.checked) list = dedupe(list);
  if (document.getElementById('hideExcluded')?.checked) list = list.filter(o => !isExcluded(o));
  return list.filter(o => !HORS_REPEREES.includes(o.status));
}

/** Pourquoi une offre est masquée (texte court), ou '' si elle est visible. */
function hiddenReason(o) {
  if (isTracked(o)) return '';
  if (tooOld(o)) return 'publiée il y a plus de ' + MAX_OFFER_AGE_DAYS + ' j';
  const hidden = hiddenTypes();
  const type = JOB_TYPES.find(t => hidden.includes(t.id) && matchesType(t, o));
  if (type) return 'type masqué « ' + type.label + ' »';
  const t = norm(o.title || '');
  const word = excludedWords().find(w => t.includes(w));
  if (word) return 'mot exclu « ' + word + ' »';
  if (isTooFar(o)) return 'trajet > ' + MAX_TRAJET_HORS_PARIS + ' min';
  if ((profile.excluded || []).some(x => x.trim() && norm(o.company).includes(norm(x)))) return 'entreprise exclue';
  return '';
}

function fillJobTypesForm() {
  const box = document.getElementById('jobTypes');
  if (!box) return;
  const hidden = hiddenTypes();
  box.innerHTML = JOB_TYPES.map(t => {
    const n = offers.filter(o => matchesType(t, o)).length;
    return `<label><input type="checkbox" value="${t.id}" ${hidden.includes(t.id) ? 'checked' : ''}> ${esc(t.label)} <span class="muted small">(${n})</span></label>`;
  }).join('');
  document.getElementById('excludedWords').value = profile.excludedWords || '';
}

function saveJobTypes() {
  profile.hiddenTypes = [...document.querySelectorAll('#jobTypes input:checked')].map(i => i.value);
  profile.excludedWords = document.getElementById('excludedWords').value.trim();
  saveProfileState();
  const n = offers.filter(isHiddenType).length;
  toast(n + ' offre(s) masquée(s)');
}

/* ---------- Trajet depuis le domicile (calculé par collect.py) ---------- */

function travelLabel(o) {
  if (typeof o.trajetMin === 'number') return '🚇 ≈ ' + o.trajetMin + ' min';
  if (typeof o.km === 'number') return '📍 ' + String(o.km).replace('.', ',') + ' km';
  return '';
}

/** Hors Paris et 93, on masque les nouvelles offres à plus de 60 min (ces deux-là sont toujours gardés). */
const ZONES_TOUJOURS_GARDEES = ['75', '93'];
const MAX_TRAJET_HORS_PARIS = 60;
function isTooFar(o) {
  if (ZONES_TOUJOURS_GARDEES.includes(deptOf(o)) || (o.status || 'À examiner') !== 'À examiner') return false;
  const cost = travelCost(o);
  return cost < 1e6 && cost > MAX_TRAJET_HORS_PARIS;
}

/** Pour trier : minutes si connues, sinon distance convertie (≈ 3 min/km). */
function travelCost(o) {
  if (typeof o.trajetMin === 'number') return o.trajetMin;
  if (typeof o.km === 'number') return o.km * 3;
  return 1e6;
}

/* ---------- Statuts ---------- */

// Date locale (et non UTC) : une candidature envoyée à 0 h 30 compte pour le bon jour.
function today() { return new Date().toLocaleDateString('sv-SE'); }

/* ---------- Objectif du jour ---------- */

const DEFAULT_DAILY_GOAL = 50;
let lastGoalCount = null;

function goalOf() { return Math.max(1, Number(profile.dailyGoal) || DEFAULT_DAILY_GOAL); }

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi
  return d.toLocaleDateString('sv-SE');
}

function updateGoal() {
  const t = today(), from = weekStart(), goal = goalOf();
  const sent = offers.filter(o => o.appliedDate === t).length;
  const week = offers.filter(o => o.appliedDate && o.appliedDate >= from && o.appliedDate <= t).length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('goalToday', sent);
  set('goalTarget', goal);
  set('goalWeek', week);
  const fill = document.getElementById('goalFill');
  if (fill) fill.style.width = Math.min(100, Math.round(sent / goal * 100)) + '%';
  document.getElementById('goalBox')?.classList.toggle('done', sent >= goal);
  if (lastGoalCount !== null && lastGoalCount < goal && sent >= goal) {
    setTimeout(() => toast('🎉 Objectif du jour atteint : ' + sent + ' candidatures !'), 800);
  }
  lastGoalCount = sent;
}

function setTrack(o, status) {
  o.status = status;
  o.trackedAt = Date.now();
  if (status === 'Candidature envoyée' && !o.appliedDate) o.appliedDate = today();
}

function autoRelances() {
  const limit = Date.now() - RELANCE_DAYS * 864e5;
  let n = 0;
  offers.forEach(o => {
    // Pas de relance quand l'entreprise a déjà répondu par e-mail.
    if (o.status === 'Candidature envoyée' && !o.relanceAuto && o.mailKind !== 'reponse' && o.appliedDate && Date.parse(o.appliedDate) <= limit) {
      setTrack(o, 'À relancer');
      o.relanceAuto = true;
      n++;
    }
  });
  if (n) { save(); toast(n + ' candidature(s) à relancer'); }
}

/* ---------- Tri et file de candidature ---------- */

let pilot = null; // { mode: 'triage' | 'queue', ids, i, undo }

function pilotList(mode) {
  const wanted = mode === 'triage' ? 'À examiner' : 'À postuler';
  const hideExcluded = document.getElementById('hideExcluded')?.checked;
  // Mêmes doublons retirés que dans la liste des offres.
  // Seulement les métiers du profil actif (l'autre profil a ses propres offres dans offres.json).
  return (document.getElementById('hideDuplicates')?.checked ? dedupe(offers) : offers)
    .filter(o => (o.status || 'À examiner') === wanted && CATS.includes(categoryOf(o)) && !(hideExcluded && isExcluded(o)))
    .sort(mode === 'queue' && queueSort() === 'date'
      ? (a, b) => offerTime(b) - offerTime(a) || score(b) - score(a)
      : (a, b) => triageRank(a, mode) - triageRank(b, mode) || score(b) - score(a));
}

/** Tri au doigt : les métiers « triageLast » du profil passent après tous les autres. */
function triageRank(o, mode) {
  return mode === 'triage' && (ACTIVE_PROFILE.triageLast || []).includes(categoryOf(o)) ? 1 : 0;
}

/** Ordre de l'onglet « À postuler » (et de « Lancer la file ») : priorité ou date, plus récentes d'abord. */
function queueSort() { return stored('zcrt_queue_sort') === 'date' ? 'date' : 'score'; }

/** Filtre métier de l'onglet « À postuler » (mémorisé par profil) : 'all' ou une catégorie du profil. */
function queueCat() { const c = stored(nsKey('zcrt_queue_cat')); return CATS.includes(c) ? c : 'all'; }
/** Offres à postuler affichées dans l'onglet, et parcourues par « Lancer la file ». */
function queueFiltered() {
  const c = queueCat();
  return pilotList('queue').filter(o => c === 'all' || categoryOf(o) === c);
}
function offerTime(o) { return parseDate(offerDate(o))?.getTime() || 0; }

function updatePilotBar() {
  const t = document.getElementById('triageCount'), q = document.getElementById('queueCount');
  if (t) t.textContent = pilotList('triage').length;
  const queued = pilotList('queue').length;
  if (q) q.textContent = queued;
  document.querySelectorAll('[data-nav-count="queue"]').forEach(el => { el.textContent = queued || ''; el.hidden = !queued; });
  if (typeof uiRenderQueue === 'function') uiRenderQueue();
  updateGoal();
}

/* Lien de l'alerte téléphone (…/#trier) et raccourcis de l'appli (#trier,
   #postuler) : la fenêtre s'ouvre dès que les offres publiées sont chargées. */
let openOnLoad = '';

function afterRemoteLoad() {
  fillJobTypesForm(); // compteurs par type sur les offres publiées
  if (!openOnLoad) return;
  const mode = openOnLoad;
  openOnLoad = '';
  openPilot(mode);
}

/** Métier de l'offre ; dans une file ou un tri, menu pour ne parcourir qu'un métier. */
function pilotCatPill(cat) {
  if (pilot.single) return `<span class="pill">${esc(CAT_LABELS[cat])}</span>`;
  const current = pilot.cat || 'all';
  const options = [['all', 'Tous les métiers'], ...CATS.map(c => [c, CAT_LABELS[c]])]
    .map(([v, label]) => `<option value="${v}"${v === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
  return `<label class="pill pill-select" title="Ne parcourir qu'un métier"><select data-pilot-cat aria-label="Métier parcouru">${options}</select></label>`;
}

/** Recommence la file (ou le tri) avec un seul métier, ou tous. */
function pilotSetCat(cat) {
  if (pilot.mode === 'queue') store(nsKey('zcrt_queue_cat'), cat);
  const list = pilotList(pilot.mode).filter(o => cat === 'all' || categoryOf(o) === cat);
  pilot = { ...pilot, cat, ids: list.map(o => o.id), i: 0, undo: [] };
  drawPilot();
  if (typeof uiRenderQueue === 'function') uiRenderQueue();
}

function openPilot(mode, list) {
  // cat : métier parcouru (« all » = tous). La file de l'onglet « À postuler » suit son filtre.
  const cat = list && mode === 'queue' ? queueCat() : 'all';
  pilot = { mode, cat, ids: (list || pilotList(mode)).map(o => o.id), i: 0, undo: [] };
  document.getElementById('pilot').classList.add('open');
  document.body.style.overflow = 'hidden';
  drawPilot();
}

/** « Préparer » sur une offre : même fenêtre que la file, pour cette offre seule. */
function openPilotFor(id) {
  if (!offers.some(o => o.id === id)) return;
  pilot = { mode: 'queue', single: true, ids: [id], i: 0, undo: [] };
  document.getElementById('pilot').classList.add('open');
  document.body.style.overflow = 'hidden';
  drawPilot();
}

function closePilot() {
  pilot = null;
  document.getElementById('pilot').classList.remove('open');
  document.body.style.overflow = '';
  render();
}

function currentOffer() {
  if (!pilot) return null;
  while (pilot.i < pilot.ids.length) {
    const o = offers.find(x => x.id === pilot.ids[pilot.i]);
    if (o) return o;
    pilot.i++;
  }
  return null;
}

function metaLine(o) {
  const d = deptOf(o);
  const why = hiddenReason(o);
  const when = o.date ? fmtDate(o.date) : o.updated ? 'Mise à jour le ' + fmtDate(o.updated) : 'Date à vérifier';
  return `<span class="m-company">${esc(o.company)}</span><span>${ic('pin')}${esc(o.location || 'Lieu non précisé')}${d && d !== 'IDF' ? ' (' + esc(d) + ')' : ''}</span>${uiContract(o.contract)}${travelLabel(o) ? `<span class="travel">${ic('route')}${esc(uiTravel(o))}</span>` : ''}<span>${ic('clock')}${esc(when)}</span>${why ? `<span class="hidden-why">${ic('eyeoff')}Masquée : ${esc(why)}</span>` : ''}`;
}

function drawPilot() {
  const card = document.getElementById('pilotCard');
  const o = currentOffer();
  const total = pilot.ids.length;
  const title = pilot.mode === 'triage' ? 'Tri des nouvelles offres' : 'File de candidature';
  if (!o) {
    card.innerHTML = `<div class="pilot-head"><strong>${title}</strong><button class="ghost" data-act="close">Fermer<span class="key-hint"> (Échap)</span></button></div>
      <div class="empty">${total ? 'Terminé : ' + total + ' offre(s) traitée(s).' : 'Rien à traiter pour le moment.'}
      ${pilot.mode === 'triage' ? '<p><button data-act="toqueue">Passer à la file de candidature</button></p>' : ''}
      ${pilot.undo.length ? '<p><button class="ghost" data-act="undo">← Annuler la dernière action</button></p>' : ''}</div>`;
    return;
  }
  const cat = jobCategory(o);
  const head = `<div class="pilot-head"><span class="pill blue">${title} · ${pilot.i + 1} / ${total}</span>
    ${pilotCatPill(cat)}
    <button class="ghost" data-act="close">Fermer<span class="key-hint"> (Échap)</span></button></div>
    <h2>${esc(o.title)}</h2><div class="job-meta">${metaLine(o)}</div>`;

  if (pilot.mode === 'triage') {
    card.innerHTML = `${head}
      <p class="pilot-notes">${esc((o.notes || 'Pas de description.').slice(0, 600))}</p>
      <p class="swipe-hint">Glisse la carte : <b>→ À postuler</b> · <b>Ignorer ←</b></p>
      <div class="pilot-actions">
        <button data-act="apply"><kbd>A</kbd> À postuler</button>
        <button class="secondary" data-act="ignore"><kbd>X</kbd> Ignorer</button>
        <button class="secondary" data-act="open"><kbd>O</kbd> Ouvrir l’annonce</button>
        <button class="ghost" data-act="skip"><kbd>→</kbd> Plus tard</button>
        <button class="ghost" data-act="undo" ${pilot.undo.length ? '' : 'disabled'}><kbd>←</kbd> Annuler</button>
      </div>`;
    return;
  }

  const infos = infosOf();
  const chips = INFO_FIELDS.filter(([k]) => infos[k])
    .map(([k, label]) => `<button class="chip" data-copy="${k}" title="${esc(infos[k])}">${esc(label)}</button>`).join('');
  const cv = cvOf(cat);
  if (o.status === 'À relancer') {
    card.innerHTML = `${head}
    <div class="pilot-hint">Sans réponse depuis ${RELANCE_DAYS} jours ou plus : envoie ce message par e-mail, sur le site de l’annonce ou appelle le recruteur.</div>
    <textarea id="pilotLetter" rows="12" aria-label="Message de relance">${esc(relanceText(o))}</textarea>
    <div class="pilot-chips"><span class="small muted">Copier :</span> <button class="chip" data-copy="__letter">Message de relance</button> ${chips}</div>
    <div class="pilot-actions">
      <button data-act="go"><kbd>Entrée</kbd> Ouvrir l’annonce + copier le message</button>
      <button class="ok" data-act="relanced"><kbd>Espace</kbd> Relance envoyée</button>
      <button class="ghost" data-act="skip"><kbd>→</kbd> Plus tard</button>
      <button class="ghost" data-act="undo" ${pilot.undo.length ? '' : 'disabled'}><kbd>←</kbd> Annuler</button>
    </div>`;
    return;
  }
  card.innerHTML = `${head}
    <div class="pilot-hint">CV à joindre : <b>${cv ? esc(cv) : 'à définir dans Critères & modèles'}</b></div>
    <textarea id="pilotLetter" rows="12" aria-label="Lettre de motivation">${esc(fillTemplate(o))}</textarea>
    <div class="pilot-chips"><span class="small muted">Copier :</span> <button class="chip" data-copy="__letter">Lettre</button> ${chips || '<span class="small muted">renseigne « Mes infos » dans Critères & modèles</span>'}</div>
    <div class="pilot-actions">
      <button data-act="go"><kbd>Entrée</kbd> Ouvrir l’annonce + copier la lettre</button>
      <button class="secondary" data-act="open" ${o.url ? '' : 'disabled title="Pas de lien pour cette offre"'}><kbd>O</kbd> Ouvrir l’annonce</button>
      <button class="ok" data-act="sent"><kbd>Espace</kbd> Candidature envoyée</button>
      <button class="ghost" data-act="skip"><kbd>→</kbd> Plus tard</button>
      <button class="ghost" data-act="ignore"><kbd>X</kbd> <svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>Supprimer</button>
      <button class="ghost" data-act="undo" ${pilot.undo.length ? '' : 'disabled'}><kbd>←</kbd> Annuler</button>
    </div>`;
}

function copyText(text, label) {
  const done = () => toast(label + ' copié(e)');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text) && done());
  } else if (legacyCopy(text)) {
    done();
  }
}

function legacyCopy(text) {
  const t = document.createElement('textarea');
  t.value = text;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  if (!ok) toast('Copie impossible : sélectionne le texte à la main');
  return ok;
}

function letterText() {
  const area = document.getElementById('pilotLetter');
  return area ? area.value : '';
}

/* ---------- Candidature envoyée : la carte s'envole avec un tampon ---------- */

function sentOut(done) {
  if (typeof MOTION_OK !== 'undefined' && !MOTION_OK) return done();
  const card = document.getElementById('pilotCard');
  card.dataset.swipe = 'sent';
  setTimeout(() => {
    card.style.transition = 'transform .38s cubic-bezier(.5, 0, .75, 0), opacity .38s ease-in';
    card.style.transform = 'translateY(-110vh) rotate(5deg)';
    card.style.opacity = '0';
  }, 160);
  setTimeout(() => {
    card.style.transition = 'none';
    card.style.transform = '';
    card.style.opacity = '';
    delete card.dataset.swipe;
    done();
    card.classList.remove('swipe-in');
    void card.offsetWidth;
    card.classList.add('swipe-in');
  }, 540);
}

/* ---------- Supprimer : la carte part à la corbeille ---------- */

function trashOut(done) {
  if (typeof MOTION_OK !== 'undefined' && !MOTION_OK) return done();
  const card = document.getElementById('pilotCard');
  const bin = document.createElement('div');
  bin.className = 'trash-bin';
  bin.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>';
  document.getElementById('pilot').appendChild(bin);
  // La carte rétrécit en direction de la corbeille.
  const c = card.getBoundingClientRect(), b = bin.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (c.left + c.width / 2), dy = (b.top + b.height / 2) - (c.top + c.height / 2);
  card.style.transition = 'transform .38s cubic-bezier(.5, 0, .75, 0), opacity .38s ease-in';
  card.style.transformOrigin = 'center';
  card.style.transform = `translate(${dx}px, ${dy}px) scale(.06) rotate(-14deg)`;
  card.style.opacity = '.15';
  setTimeout(() => {
    bin.classList.add('gulp');
    card.style.transition = 'none';
    card.style.transform = '';
    card.style.opacity = '';
    done();
    card.classList.remove('swipe-in');
    void card.offsetWidth; // relance l'animation d'arrivée de la carte suivante
    card.classList.add('swipe-in');
    setTimeout(() => bin.remove(), 450);
  }, 380);
}

/* ---------- Tri au doigt : glisser à droite = À postuler, à gauche = Ignorer ---------- */

function initSwipe() {
  const card = document.getElementById('pilotCard');
  let start = null, dx = 0;

  const reset = () => {
    card.style.transform = '';
    card.style.opacity = '';
    delete card.dataset.swipe;
  };

  card.addEventListener('pointerdown', e => {
    // Au doigt (ou au stylet) seulement : à la souris, les raccourcis clavier suffisent.
    if (pilot.mode !== 'triage' || e.pointerType === 'mouse' || !currentOffer()
        || e.target.closest('button, a, textarea, input, select')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
    dx = 0;
  });

  card.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x, my = e.clientY - start.y;
    if (start.horizontal === null) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      start.horizontal = Math.abs(mx) > Math.abs(my);
      if (!start.horizontal) { start = null; return; } // geste vertical : on laisse défiler
      try { card.setPointerCapture(e.pointerId); } catch (err) { /* capture refusée : le geste marche quand même */ }
      card.style.transition = 'none';
    }
    dx = mx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    if (dx > 50) card.dataset.swipe = 'apply';
    else if (dx < -50) card.dataset.swipe = 'ignore';
    else delete card.dataset.swipe;
  });

  const end = e => {
    if (!start || e.pointerId !== start.id) return;
    const wasSwipe = start.horizontal;
    start = null;
    if (!wasSwipe) return;
    const act = Math.abs(dx) > Math.min(110, card.offsetWidth * 0.28) ? (dx > 0 ? 'apply' : 'ignore') : null;
    card.style.transition = 'transform .22s ease, opacity .22s ease';
    if (!act) { reset(); return; }
    // La carte s'envole, puis la suivante arrive.
    card.style.transform = `translateX(${dx > 0 ? 120 : -120}vw) rotate(${dx > 0 ? 24 : -24}deg)`;
    card.style.opacity = '0';
    setTimeout(() => {
      card.style.transition = 'none';
      reset();
      pilotAct(act);
      card.classList.remove('swipe-in');
      void card.offsetWidth; // relance l'animation d'arrivée
      card.classList.add('swipe-in');
    }, 220);
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function pilotAct(action) {
  // File de candidature : « Candidature envoyée » fait s'envoler la carte avec un tampon ENVOYÉE.
  if ((action === 'sent' || action === 'relanced') && pilot.mode === 'queue' && !pilot.flying && currentOffer()) {
    pilot.flying = true;
    return sentOut(() => { pilotAct(action); pilot.flying = false; });
  }
  // File de candidature : « Supprimer » envoie la carte à la corbeille, puis l'offre passe en « Ignorée ».
  if (action === 'ignore' && pilot.mode === 'queue' && !pilot.trashing && currentOffer()) {
    pilot.trashing = true;
    return trashOut(() => { pilotAct('ignore'); pilot.trashing = false; });
  }
  if (action === 'close') return closePilot();
  if (action === 'toqueue') return openPilot('queue');
  if (action === 'undo') {
    const u = pilot.undo.pop();
    if (!u) return;
    const o = offers.find(x => x.id === u.id);
    if (o) {
      o.status = u.status;
      if (u.appliedDate) o.appliedDate = u.appliedDate; else delete o.appliedDate;
      o.trackedAt = Date.now();
    }
    pilot.i = u.i;
    save();
    return drawPilot();
  }
  const o = currentOffer();
  if (!o) return;
  if (action === 'open') { if (o.url) window.open(o.url, '_blank', 'noopener'); return; }
  if (action === 'go') {
    copyText(letterText(), 'Lettre');
    if (o.url) window.open(o.url, '_blank', 'noopener');
    return;
  }
  if (action === 'skip') { pilot.i++; return drawPilot(); }
  const status = { apply: 'À postuler', ignore: 'Ignorée', sent: 'Candidature envoyée', relanced: 'Candidature envoyée' }[action];
  if (!status) return;
  pilot.undo.push({ id: o.id, status: o.status, appliedDate: o.appliedDate, i: pilot.i });
  setTrack(o, status);
  if (action === 'relanced') { o.relanceDate = today(); toast('Relance notée'); }
  pilot.i++;
  save();
  drawPilot();
}

function isRelanceOpen() { const o = currentOffer(); return !!o && o.status === 'À relancer'; }

function pilotKey(e) {
  if (!pilot) return;
  if (e.key === 'Escape') { e.preventDefault(); return closePilot(); }
  const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
  if (typing) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pilotAct('go'); }
    return;
  }
  const k = e.key.toLowerCase();
  const map = pilot.mode === 'triage'
    ? { a: 'apply', x: 'ignore', o: 'open', arrowright: 'skip', arrowleft: 'undo' }
    : { enter: 'go', ' ': isRelanceOpen() ? 'relanced' : 'sent', o: 'open', x: 'ignore', arrowright: 'skip', arrowleft: 'undo' };
  if (map[k]) { e.preventDefault(); pilotAct(map[k]); }
}

/* ---------- Modèles et « Mes infos » ---------- */

function fillTemplateForm() {
  const t = templatesOf(), i = infosOf();
  CATS.forEach(c => {
    const area = document.getElementById('tpl_' + c);
    if (area) area.value = t[c];
    const cv = document.getElementById('cv_' + c);
    if (cv) cv.value = cvOf(c);
  });
  INFO_FIELDS.forEach(([k]) => {
    const input = document.getElementById('info_' + k);
    if (input) input.value = i[k] || '';
  });
  const goal = document.getElementById('goalInput');
  if (goal) goal.value = goalOf();
  fillJobTypesForm();
}

function saveTemplates() {
  profile.templates = {};
  profile.cv = {};
  CATS.forEach(c => {
    const v = document.getElementById('tpl_' + c).value.trim();
    if (v && v !== DEFAULT_TEMPLATES[c]) profile.templates[c] = v;
    profile.cv[c] = document.getElementById('cv_' + c).value.trim();
  });
  profile.infos = {};
  INFO_FIELDS.forEach(([k]) => { profile.infos[k] = document.getElementById('info_' + k).value.trim(); });
  profile.dailyGoal = Math.max(1, Number(document.getElementById('goalInput').value) || DEFAULT_DAILY_GOAL);
  saveProfileState();
  toast('Modèles et infos enregistrés');
}

function resetTemplate(c) {
  document.getElementById('tpl_' + c).value = DEFAULT_TEMPLATES[c];
}

function saveProfileState() {
  profile.updatedAt = Date.now();
  localStorage.setItem(PROFILE, JSON.stringify(profile));
  render();
  syncSchedule();
}

/* ---------- Synchronisation téléphone / PC (gist GitHub secret) ---------- */

// Chaque profil a son jeton, son gist et son fichier : même avec un seul compte GitHub,
// les suivis de Ryan et de Zia ne se mélangent pas.
const SYNC_TOKEN = nsKey('zcrt_sync_token'), SYNC_GIST = nsKey('zcrt_sync_gist'), SYNC_CACHE = nsKey('zcrt_sync_cache');
const SYNC_FILE = ACTIVE_PROFILE.syncFile;
// Écrit par mail.py (tri Gmail) dans le même gist : liste des e-mails triés.
const MAIL_FILE = 'zcrt-mail.json', MAIL_CACHE = nsKey('zcrt_mail_cache');
const IGNORED_KEEP_DAYS = 90;
const SYNC_MIN_INTERVAL = 15000;           // au plus une synchro automatique toutes les 15 s
const SYNC_BREAKER = { max: 40, windowMs: 10 * 60000, pauseMs: 15 * 60000 };
let syncTimer = null, syncBusy = false, syncAgain = false;
let lastSyncAt = 0, syncBlockedUntil = 0;
const ghCalls = [];                        // horodatage des appels à l'API (disjoncteur)

function hhmm(ts) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

/** Copie locale des offres : seulement celles suivies, triées ou ajoutées à la main.
 * Les autres reviennent à chaque ouverture avec offres.json (gardé aussi hors ligne par sw.js).
 * Tout garder, pour deux profils, dépassait la limite de Safari (≈ 5 Mo par site) :
 * l'enregistrement échouait et la liste restait vide. Un échec n'empêche plus l'affichage. */
function storeOffers() {
  const keep = offers.filter(o => !o.source || o.trackedAt || isTracked(o)
    || (o.status && o.status !== 'À examiner')); // y compris les « Ignorée » d'avant trackedAt
  try {
    localStorage.setItem(KEY, JSON.stringify(keep));
    return true;
  } catch (e) {
    console.warn('Copie locale des offres impossible (stockage plein ?)', e);
    return false;
  }
}

function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* stockage indisponible */ }
}
function stored(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

function setSyncState(text, error) {
  ['syncState', 'syncState2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; el.classList.toggle('sync-error', !!error); }
  });
}

async function gh(path, options = {}) {
  // Disjoncteur : quelle que soit la cause, jamais de rafale de requêtes vers GitHub.
  const now = Date.now();
  while (ghCalls.length && now - ghCalls[0] > SYNC_BREAKER.windowMs) ghCalls.shift();
  if (ghCalls.length >= SYNC_BREAKER.max) {
    syncBlockedUntil = now + SYNC_BREAKER.pauseMs;
    throw new Error('trop de requêtes en peu de temps, pause de sécurité');
  }
  ghCalls.push(now);
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + stored(SYNC_TOKEN),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    // Raison exacte donnée par GitHub (ex. « Resource not accessible by
    // personal access token ») et étape concernée, pour diagnostiquer.
    let reason = '';
    try { reason = (await response.json()).message || ''; } catch (e) { /* pas de JSON */ }
    // Limite de requêtes : on attend l'heure de reprise donnée par GitHub.
    if (response.status === 429 || /rate limit/i.test(reason) || response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      syncBlockedUntil = reset > Date.now() ? reset + 5000 : Date.now() + SYNC_BREAKER.pauseMs;
      throw new Error('limite de requêtes GitHub atteinte');
    }
    const step = (options.method || 'GET') === 'GET'
      ? (path.startsWith('/gists?') ? 'liste des gists' : 'lecture du gist')
      : (options.method === 'POST' ? 'création du gist' : 'enregistrement du gist');
    throw new Error('GitHub ' + response.status + ' – ' + step + (reason ? ' : ' + reason : ''));
  }
  return response.json();
}

async function findGist() {
  const known = stored(SYNC_GIST);
  if (known) return known;
  for (let page = 1; page <= 5; page++) {
    const list = await gh('/gists?per_page=100&page=' + page);
    const found = list.find(g => g.files && g.files[SYNC_FILE]);
    if (found) { store(SYNC_GIST, found.id); return found.id; }
    if (list.length < 100) break;
  }
  const created = await gh('/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'ZCRT — suivi des candidatures de ' + ACTIVE_PROFILE.name + ' (synchronisation)',
      public: false,
      files: { [SYNC_FILE]: { content: JSON.stringify(syncState()) } },
    }),
  });
  store(SYNC_GIST, created.id);
  return created.id;
}

async function readGist(id) {
  const gist = await gh('/gists/' + id);
  const mailFile = gist.files && gist.files[MAIL_FILE];
  if (mailFile) {
    store(MAIL_CACHE, mailFile.truncated ? await (await fetch(mailFile.raw_url)).text() : mailFile.content);
    if (typeof uiRenderMails === 'function') uiRenderMails();
  }
  const file = gist.files && gist.files[SYNC_FILE];
  if (!file) return {};
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  return JSON.parse(content || '{}');
}

/** État partagé : suivi des offres (statut, dates, notes) + critères et modèles. */
function syncState() {
  const now = Date.now();
  const cache = safeJson(stored(SYNC_CACHE));
  const local = new Set(offers.map(o => o.id));
  const entries = {};
  // Entrées connues ailleurs mais pas encore chargées ici : on les garde.
  Object.values(cache.entries || {}).forEach(e => {
    if (local.has(e.id)) return;
    if (e.status === 'Ignorée' && now - (e.trackedAt || 0) > IGNORED_KEEP_DAYS * 864e5) return;
    entries[e.id] = e;
  });
  offers.forEach(o => {
    if (o.demo) return;
    const manual = !o.source;
    if (!manual && !o.trackedAt) return;
    if (o.status === 'Ignorée' && !manual) {
      if (now - (o.trackedAt || 0) <= IGNORED_KEEP_DAYS * 864e5) {
        entries[o.id] = { id: o.id, status: o.status, trackedAt: o.trackedAt, url: o.url };
      }
      return;
    }
    entries[o.id] = { ...o };
  });
  return { version: 1, updatedAt: now, profileUpdatedAt: profile.updatedAt || 0, profile, entries };
}

function safeJson(text) {
  try { return JSON.parse(text || '{}') || {}; } catch (e) { return {}; }
}

// Les champs mail* sont écrits par mail.py (tri Gmail) directement dans le gist.
const TRACK_FIELDS = ['status', 'appliedDate', 'notes', 'notesEdited', 'trackedAt', 'relanceAuto', 'relanceDate',
  'mailKind', 'mailAt', 'mailDate', 'mailSubject', 'mailFrom'];

/** Applique l'état distant : pour chaque offre, la modification la plus récente gagne. */
function applySync(state) {
  if (!state || !state.entries) return false;
  let changed = false;
  const byId = new Map(offers.map(o => [o.id, o]));
  Object.values(state.entries).forEach(e => {
    const o = byId.get(e.id);
    if (o) {
      if ((e.trackedAt || 0) <= (o.trackedAt || 0)) return;
      const fields = o.source ? TRACK_FIELDS : Object.keys(e);
      fields.forEach(k => { if (k in e) o[k] = e[k]; else if (o.source) delete o[k]; });
      changed = true;
    } else if (e.title && e.status !== 'Ignorée') {
      offers.push({ ...e });
      changed = true;
    }
  });
  if ((state.profileUpdatedAt || 0) > (profile.updatedAt || 0) && state.profile) {
    profile = { ...profile, ...state.profile };
    store(PROFILE, JSON.stringify(profile));
    refreshProfileForms();
    changed = true;
  }
  return changed;
}

function applySyncCache() {
  applySync(safeJson(stored(SYNC_CACHE)));
}

function refreshProfileForms() {
  document.getElementById('keywords').value = profile.keywords || '';
  document.getElementById('excluded').value = (profile.excluded || []).join(', ');
  document.getElementById('priority').value = profile.priority;
  fillTemplateForm();
}

function sameEntries(a, b) {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every(k => b[k] && (a[k].trackedAt || 0) === (b[k].trackedAt || 0));
}

async function syncNow(force = false) {
  if (!stored(SYNC_TOKEN)) return;
  if (Date.now() < syncBlockedUntil) {
    setSyncState('Synchro en pause jusqu’à ' + hhmm(syncBlockedUntil) + ' (limite GitHub)', true);
    return;
  }
  if (syncBusy) { syncAgain = true; return; }
  // Hors clic sur « Synchroniser maintenant », pas plus d'une synchro toutes les 15 s.
  const wait = SYNC_MIN_INTERVAL - (Date.now() - lastSyncAt);
  if (!force && wait > 0) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, wait);
    return;
  }
  lastSyncAt = Date.now();
  syncBusy = true;
  setSyncState('Synchronisation…');
  try {
    let id = await findGist();
    let remote;
    try {
      remote = await readGist(id);
    } catch (e) {
      if (!/404/.test(e.message)) throw e;
      store(SYNC_GIST, null); // gist supprimé : on en retrouve ou recrée un
      id = await findGist();
      remote = await readGist(id);
    }
    store(SYNC_CACHE, JSON.stringify(remote));
    if (applySync(remote)) { storeOffers(); render(); }
    const local = syncState();
    if (!sameEntries(local.entries, remote.entries) || local.profileUpdatedAt !== (remote.profileUpdatedAt || 0)) {
      await gh('/gists/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(local) } } }),
      });
      store(SYNC_CACHE, JSON.stringify(local));
    }
    setSyncState('Synchronisé à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    if (Date.now() < syncBlockedUntil) {
      setSyncState('Synchro en pause jusqu’à ' + hhmm(syncBlockedUntil) + ' (' + e.message + ')', true);
    } else {
      const hint = /GitHub 401/.test(e.message) ? ' → jeton invalide ou expiré : recolle-le'
        : /GitHub 403/.test(e.message) ? ' → jeton sans accès aux gists : utilise un jeton classique avec la case « gist »'
        : '';
      setSyncState('Synchro en échec (' + e.message + ')' + hint, true);
    }
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; syncSchedule(); }
  }
}

function syncSchedule() {
  if (!stored(SYNC_TOKEN)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

function enableSync() {
  const input = document.getElementById('syncTokenInput');
  const token = input.value.trim();
  if (!token) return toast('Colle d’abord le jeton GitHub');
  store(SYNC_TOKEN, token);
  input.value = '';
  syncNow(true);
}

function disableSync() {
  [SYNC_TOKEN, SYNC_GIST, SYNC_CACHE, MAIL_CACHE].forEach(k => store(k, null));
  if (typeof uiRenderMails === 'function') uiRenderMails();
  setSyncState('Synchronisation désactivée sur cet appareil');
}

/* ---------- Phrase de motivation (une différente à chaque ouverture) ---------- */

function mottos() {
  const g = goalOf();
  return [
    'Personne ne viendra te chercher. Postule.',
    `Tu n’es pas ${fem('fatigué', 'fatiguée')}. Tu es à 40 % de ce que tu peux donner.`,
    'Le refus d’hier, c’est l’entraînement d’aujourd’hui.',
    'Fais ce que tu n’as pas envie de faire. C’est là que tout change.',
    'Une candidature de plus. Puis encore une.',
    'Le confort ne t’a jamais rien donné. Va chercher.',
    'Pas de motivation ? Pas grave. De la discipline.',
    'Chaque « non » te rapproche du « oui ». Encaisse et avance.',
    'Personne ne se souviendra de tes excuses.',
    'Tu as survécu à toutes tes pires journées. Celle-ci aussi.',
    'Le CV ne s’envoie pas tout seul.',
    `Sois plus ${fem('dur', 'dure')} que la situation.`,
    'Tes objectifs se fichent de ton humeur.',
    'Aujourd’hui, tu fais ce que les autres repoussent à demain.',
    'Gagne la matinée, et tu gagnes la journée.',
    'Le silence d’un recruteur n’est pas une réponse. Relance.',
    `${fem('Dur', 'Dure')} aujourd’hui, ${fem('fier', 'fière')} demain.`,
    'Le bon moment ne vient pas. Il se crée.',
    'Ton futur employeur est quelque part dans cette liste. Trouve-le.',
    'La douleur passe. Le regret reste. Postule.',
    'Tu n’as pas besoin d’y croire. Tu as besoin de le faire.',
    `${g} candidatures. Pas ${g - 1}. ${g}.`,
    'Le mental d’abord. Le reste suit.',
    'Quand tu as envie de lâcher, c’est que tu commences à peine.',
    'Personne ne te doit rien. Va le prendre.',
    'Les excuses ne paient pas le loyer.',
    'Moins de scroll, plus de candidatures.',
    'Tu veux du changement ? Commence par cliquer sur « Postuler ».',
  ];
}

function showMotto() {
  const el = document.getElementById('motto');
  if (!el) return;
  const list = mottos();
  const last = Number(stored('zcrt_motto'));
  let i = Math.floor(Math.random() * list.length);
  if (i === last) i = (i + 1) % list.length; // jamais deux fois la même d'affilée
  store('zcrt_motto', String(i));
  el.textContent = list[i];
}

/* ---------- Mode nuit ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${theme === 'dark' ? 'sun' : 'moon'}"/></svg>`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1014' : '#15161b');
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  store('zcrt_theme', next);
  applyTheme(next);
}

/* ---------- Initialisation ---------- */

function pilotInit() {
  // Ancien objectif par défaut (10) enregistré avec « Mes infos » : passe à 50.
  if (!profile.goalMigrated) {
    if (Number(profile.dailyGoal) === 10) delete profile.dailyGoal;
    profile.goalMigrated = true;
    store(PROFILE, JSON.stringify(profile));
  }

  // Nom de famille : Cartier → Gazard (profil de Ryan) dans « Mes infos » et les CV à joindre.
  // updatedAt avancé pour que la synchro l'envoie aussi aux autres appareils.
  if (ACTIVE_PROFILE.id === 'ryan' && !profile.gazardMigrated) {
    const gazard = s => String(s || '').replace(/cartier/gi, m => (m === m.toUpperCase() ? 'GAZARD' : 'Gazard'));
    if (profile.infos && /cartier/i.test(profile.infos.nom || '')) profile.infos.nom = gazard(profile.infos.nom);
    // Les CV « Cartier » pointent désormais vers les fichiers réels du Bureau (CV_Ryan_Gazard_*.pdf).
    if (profile.cv) Object.keys(profile.cv).forEach(c => {
      if (/cartier/i.test(profile.cv[c] || '')) profile.cv[c] = (ACTIVE_PROFILE.cv || {})[c] || gazard(profile.cv[c]);
    });
    profile.gazardMigrated = true;
    profile.updatedAt = Date.now();
    store(PROFILE, JSON.stringify(profile));
  }

  // Nouveau type « direction » : masqué aussi si les types ont déjà été enregistrés.
  if (Array.isArray(profile.hiddenTypes) && !profile.directionAdded) {
    if (!profile.hiddenTypes.includes('direction')) profile.hiddenTypes.push('direction');
    profile.directionAdded = true;
    store(PROFILE, JSON.stringify(profile));
  }

  // Les statuts posés avant cette version sont aussi synchronisés (priorité minimale).
  offers.forEach(o => { if (!o.trackedAt && isTracked(o)) o.trackedAt = 1; });

  const overlay = document.createElement('div');
  overlay.id = 'pilot';
  overlay.className = 'pilot';
  overlay.innerHTML = '<div class="pilot-card" id="pilotCard" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('change', e => {
    if (e.target.matches('[data-pilot-cat]')) pilotSetCat(e.target.value);
  });
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.act) pilotAct(btn.dataset.act);
    if (btn.dataset.copy) {
      const k = btn.dataset.copy;
      if (k === '__letter') copyText(letterText(), 'Lettre');
      else copyText(infosOf()[k] || '', (INFO_FIELDS.find(f => f[0] === k) || [k, k])[1]);
    }
  });
  document.addEventListener('keydown', pilotKey);
  initSwipe();
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  showMotto();
  document.getElementById('themeToggle').onclick = toggleTheme;
  document.getElementById('triageBtn').onclick = () => openPilot('triage');
  document.getElementById('queueBtn').onclick = () => openPilot('queue');
  document.getElementById('queueStart').onclick = () => openPilot('queue', queueFiltered());

  fillTemplateForm();
  document.getElementById('saveTemplates').onclick = saveTemplates;
  document.getElementById('saveJobTypes').onclick = saveJobTypes;
  document.querySelectorAll('[data-reset-tpl]').forEach(b => { b.onclick = () => resetTemplate(b.dataset.resetTpl); });

  document.getElementById('syncEnable').onclick = enableSync;
  document.getElementById('syncDisable').onclick = disableSync;
  document.getElementById('syncNowBtn').onclick = () => syncNow(true);
  setSyncState(stored(SYNC_TOKEN) ? 'Synchronisation…' : 'Synchronisation non activée');

  const hashMode = { '#trier': 'triage', '#postuler': 'queue' }[location.hash];
  if (hashMode) {
    history.replaceState(null, '', location.pathname + location.search);
    openOnLoad = hashMode;
  }

  // Appli installable sur le téléphone (fonctionne aussi hors ligne).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  autoRelances();
  updatePilotBar();
  syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
}
