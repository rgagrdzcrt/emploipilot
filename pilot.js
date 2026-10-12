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

const CATS = ['stock', 'rayon', 'vente'];
const CAT_LABELS = { stock: 'Stock & logistique', rayon: 'Magasins & grande distribution', vente: 'Vente' };
const RELANCE_DAYS = 7;

const DEFAULT_TEMPLATES = {
  stock: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Avec près de 4 ans d'expérience en stock et en logistique, je souhaite mettre ma rigueur et mon savoir-faire au service de votre équipe.

Magasinier chez Darty à Paris, je réceptionnais et contrôlais chaque jour une livraison importante et j'organisais une très grande réserve, pour que chaque produit soit retrouvé rapidement. Responsable logistique au Carré Médical, j'ai ensuite piloté les stocks et les commandes fournisseurs de matériel médical et encadré une équipe de six livreurs. Plus récemment, j'ai assuré le suivi des stocks et l'expédition des commandes d'un catalogue en ligne de plus de 400 références. J'utilise au quotidien G.O.L.D, un WMS et Excel.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
  rayon: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Avec plus de 3 ans d'expérience en grande distribution, je connais les exigences d'un rayon bien tenu : réassort, fraîcheur, présentation et service au client.

J'ai commencé comme employé de rayon Fruits & Légumes chez Monoprix, avant d'en devenir chef de rayon : approvisionnements, suivi des stocks et des ventes, travail avec l'équipe au quotidien. Chez E.Leclerc, comme référent du rayon épicerie, j'ai suivi les stocks et les commandes, coordonné l'équipe pour assurer le réassort et la propreté des rayons, et mis en place les PLV et les événements commerciaux.

Ponctuel, polyvalent et à l'aise en équipe, je m'adapte rapidement à l'organisation d'un nouveau magasin.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
  vente: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Diplômé d'un BTS Commerce international, j'ai plus de 3 ans d'expérience en vente, dans le multimédia comme dans la mode.

Chez Darty à Paris 19e, j'ai été conseiller de vente puis référent du pôle multimédia : découverte des besoins des clients, conseil sur les produits techniques, vente de services associés et suivi des objectifs de l'équipe. Plus récemment, chez COS à Paris 11e, j'ai accueilli et conseillé une clientèle française et internationale, mis en valeur les collections et assuré l'encaissement et la tenue de la boutique. Mon anglais bilingue est un vrai atout face à une clientèle étrangère.

À l'écoute, souriant et motivé par les objectifs, j'aime le contact client et le travail en équipe.

{accroche}

Disponible {disponibilite}, je serais heureux de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
};

const INFO_FIELDS = [
  ['prenom', 'Prénom'], ['nom', 'Nom'], ['telephone', 'Téléphone'], ['email', 'E-mail'],
  ['adresse', 'Adresse / ville'], ['disponibilite', 'Disponibilité'],
  ['permis', 'Permis / CACES'], ['accroche', 'Phrase d’accroche (facultative)'],
];
const DEFAULT_INFOS = { disponibilite: 'immédiatement' };

function templatesOf() { return { ...DEFAULT_TEMPLATES, ...(profile.templates || {}) }; }
function infosOf() { return { ...DEFAULT_INFOS, ...(profile.infos || {}) }; }
function cvOf(cat) { return (profile.cv || {})[cat] || ''; }

function jobCategory(o) {
  if (CATS.includes(o.category)) return o.category;
  const c = categoryOf(o);
  return CATS.includes(c) ? c : 'stock';
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

function fillTemplate(o) {
  const company = (!o.company || /à vérifier/i.test(o.company)) ? 'votre entreprise' : o.company;
  let poste = cleanTitle(o.title);
  // Minuscule en milieu de phrase, sauf sigle (« CDI », « ELS »…).
  if (poste && !/^[A-ZÀ-Ý]{2}/.test(poste)) poste = poste.charAt(0).toLowerCase() + poste.slice(1);
  const empty = Object.fromEntries(INFO_FIELDS.map(([k]) => [k, '']));
  const vars = { ...empty, ...infosOf(), poste, entreprise: company, ville: cityOf(o) };
  return templatesOf()[jobCategory(o)]
    // « poste de employé » → « poste d'employé »
    .replace(/\bde \{poste\}/g, /^[aeiouyhàâéèêëîïôûü]/i.test(poste) ? "d'{poste}" : 'de {poste}')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (vars[k] || '') : m))
    .replace(/^[ \t]*—[ \t]*|[ \t]*—[ \t]*$/gm, '') // « tél — e-mail » avec une info vide
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- Score de priorité ---------- */

const ZONE_ORDERS = {
  'Paris 10e et alentours → Paris → Bondy/93 → Île-de-France': ['p10', '75', '93', 'idf'],
  'Paris → Bondy/93 → Île-de-France': ['75', '93', 'idf'],
  'Bondy/93 → Paris → Île-de-France': ['93', '75', 'idf'],
};
const NEAR_10E = /(^|[\s,(])(pantin|aubervilliers|saint-denis)\b/i;

function zoneKey(o) {
  const d = deptOf(o), l = o.location || '';
  if ((d === '75' && /(^|\D)(2|9|10|11|19)\s*(e|er|ème|eme)\b/i.test(l)) || NEAR_10E.test(l)) return 'p10';
  if (d === '75') return '75';
  if (d === '93') return '93';
  return d ? 'idf' : '';
}

function score(o) {
  const order = ZONE_ORDERS[profile.priority] || Object.values(ZONE_ORDERS)[0];
  let z = zoneKey(o);
  if (z === 'p10' && !order.includes('p10')) z = NEAR_10E.test(o.location || '') ? '93' : '75';
  const zi = order.indexOf(z);
  let s = zi >= 0 ? [40, 30, 20, 10][zi] : 5;
  if (typeof o.km === 'number') s += o.km <= 8 ? 8 : o.km <= 15 ? 4 : o.km > 40 ? -6 : 0;
  s += { CDI: 15, CDD: 10, 'Intérim': 8 }[o.contract] || 4;
  const d = parseDate(offerDate(o) || o.created);
  const days = d ? (Date.now() - d.getTime()) / 864e5 : 99;
  s += days <= 2 ? 20 : days <= 7 ? 12 : days <= 14 ? 6 : 0;
  return s;
}

/* ---------- Trajet depuis le domicile (calculé par collect.py) ---------- */

function travelLabel(o) {
  if (typeof o.trajetMin === 'number') return '🚇 ≈ ' + o.trajetMin + ' min';
  if (typeof o.km === 'number') return '📍 ' + String(o.km).replace('.', ',') + ' km';
  return '';
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

const DEFAULT_DAILY_GOAL = 10;
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
    if (o.status === 'Candidature envoyée' && !o.relanceAuto && o.appliedDate && Date.parse(o.appliedDate) <= limit) {
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
  return offers
    .filter(o => (o.status || 'À examiner') === wanted && !(hideExcluded && isExcluded(o)))
    .sort((a, b) => score(b) - score(a));
}

function updatePilotBar() {
  const t = document.getElementById('triageCount'), q = document.getElementById('queueCount');
  if (t) t.textContent = pilotList('triage').length;
  if (q) q.textContent = pilotList('queue').length;
  updateGoal();
}

/* Lien de l'alerte téléphone (…/#trier) et raccourcis de l'appli (#trier,
   #postuler) : la fenêtre s'ouvre dès que les offres publiées sont chargées. */
let openOnLoad = '';

function afterRemoteLoad() {
  if (!openOnLoad) return;
  const mode = openOnLoad;
  openOnLoad = '';
  openPilot(mode);
}

function openPilot(mode) {
  pilot = { mode, ids: pilotList(mode).map(o => o.id), i: 0, undo: [] };
  document.getElementById('pilot').classList.add('open');
  document.body.style.overflow = 'hidden';
  drawPilot();
}

/** « Préparer » sur une offre : même fenêtre que la file, pour cette offre seule. */
function openPilotFor(id) {
  if (!offers.some(o => o.id === id)) return;
  pilot = { mode: 'queue', ids: [id], i: 0, undo: [] };
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
  const when = o.date ? fmtDate(o.date) : o.updated ? 'Mise à jour le ' + fmtDate(o.updated) : 'Date à vérifier';
  return `<span>▣ ${esc(o.company)}</span><span>⌖ ${esc(o.location || 'Lieu non précisé')}${d && d !== 'IDF' ? ' (' + esc(d) + ')' : ''}</span><span>◷ ${esc(o.contract || 'Contrat à confirmer')}</span>${travelLabel(o) ? `<span class="travel">${esc(travelLabel(o))}</span>` : ''}<span>${esc(when)}</span>`;
}

function drawPilot() {
  const card = document.getElementById('pilotCard');
  const o = currentOffer();
  const total = pilot.ids.length;
  const title = pilot.mode === 'triage' ? 'Tri des nouvelles offres' : 'File de candidature';
  if (!o) {
    card.innerHTML = `<div class="pilot-head"><strong>${title}</strong><button class="ghost" data-act="close">Fermer (Échap)</button></div>
      <div class="empty">${total ? 'Terminé : ' + total + ' offre(s) traitée(s).' : 'Rien à traiter pour le moment.'}
      ${pilot.mode === 'triage' ? '<p><button data-act="toqueue">Passer à la file de candidature</button></p>' : ''}
      ${pilot.undo.length ? '<p><button class="ghost" data-act="undo">← Annuler la dernière action</button></p>' : ''}</div>`;
    return;
  }
  const cat = jobCategory(o);
  const head = `<div class="pilot-head"><span class="pill blue">${title} · ${pilot.i + 1} / ${total}</span>
    <span class="pill">${esc(CAT_LABELS[cat])}</span><span class="pill">Score ${score(o)}</span>
    <button class="ghost" data-act="close">Fermer (Échap)</button></div>
    <h2>${esc(o.title)}</h2><div class="job-meta">${metaLine(o)}</div>`;

  if (pilot.mode === 'triage') {
    card.innerHTML = `${head}
      <p class="pilot-notes">${esc((o.notes || 'Pas de description.').slice(0, 600))}</p>
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
  card.innerHTML = `${head}
    <div class="pilot-hint">CV à joindre : <b>${cv ? esc(cv) : 'à définir dans Critères & modèles'}</b></div>
    <textarea id="pilotLetter" rows="12" aria-label="Lettre de motivation">${esc(fillTemplate(o))}</textarea>
    <div class="pilot-chips"><span class="small muted">Copier :</span> <button class="chip" data-copy="__letter">Lettre</button> ${chips || '<span class="small muted">renseigne « Mes infos » dans Critères & modèles</span>'}</div>
    <div class="pilot-actions">
      <button data-act="go"><kbd>Entrée</kbd> Ouvrir l’annonce + copier la lettre</button>
      <button class="ok" data-act="sent"><kbd>Espace</kbd> Candidature envoyée</button>
      <button class="ghost" data-act="skip"><kbd>→</kbd> Plus tard</button>
      <button class="ghost" data-act="ignore"><kbd>X</kbd> Retirer</button>
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

function pilotAct(action) {
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
  const status = { apply: 'À postuler', ignore: 'Ignorée', sent: 'Candidature envoyée' }[action];
  if (!status) return;
  pilot.undo.push({ id: o.id, status: o.status, appliedDate: o.appliedDate, i: pilot.i });
  setTrack(o, status);
  pilot.i++;
  save();
  drawPilot();
}

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
    : { enter: 'go', ' ': 'sent', x: 'ignore', arrowright: 'skip', arrowleft: 'undo' };
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

const SYNC_TOKEN = 'zcrt_sync_token', SYNC_GIST = 'zcrt_sync_gist', SYNC_CACHE = 'zcrt_sync_cache';
const SYNC_FILE = 'zcrt-suivi.json';
const IGNORED_KEEP_DAYS = 90;
let syncTimer = null, syncBusy = false, syncAgain = false;

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
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + stored(SYNC_TOKEN),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) throw new Error('GitHub ' + response.status);
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
      description: 'ZCRT — suivi des candidatures (synchronisation)',
      public: false,
      files: { [SYNC_FILE]: { content: JSON.stringify(syncState()) } },
    }),
  });
  store(SYNC_GIST, created.id);
  return created.id;
}

async function readGist(id) {
  const gist = await gh('/gists/' + id);
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

const TRACK_FIELDS = ['status', 'appliedDate', 'notes', 'notesEdited', 'trackedAt', 'relanceAuto'];

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

async function syncNow() {
  if (!stored(SYNC_TOKEN)) return;
  if (syncBusy) { syncAgain = true; return; }
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
    if (applySync(remote)) { store(KEY, JSON.stringify(offers)); render(); }
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
    const hint = /401|403/.test(e.message) ? ' : jeton refusé ou sans accès aux gists' : '';
    setSyncState('Synchro en échec (' + e.message + ')' + hint, true);
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; syncNow(); }
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
  syncNow();
}

function disableSync() {
  [SYNC_TOKEN, SYNC_GIST, SYNC_CACHE].forEach(k => store(k, null));
  setSyncState('Synchronisation désactivée sur cet appareil');
}

/* ---------- Initialisation ---------- */

function pilotInit() {
  // Les statuts posés avant cette version sont aussi synchronisés (priorité minimale).
  offers.forEach(o => { if (!o.trackedAt && isTracked(o)) o.trackedAt = 1; });

  const overlay = document.createElement('div');
  overlay.id = 'pilot';
  overlay.className = 'pilot';
  overlay.innerHTML = '<div class="pilot-card" id="pilotCard" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(overlay);
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
  document.getElementById('triageBtn').onclick = () => openPilot('triage');
  document.getElementById('queueBtn').onclick = () => openPilot('queue');

  fillTemplateForm();
  document.getElementById('saveTemplates').onclick = saveTemplates;
  document.querySelectorAll('[data-reset-tpl]').forEach(b => { b.onclick = () => resetTemplate(b.dataset.resetTpl); });

  document.getElementById('syncEnable').onclick = enableSync;
  document.getElementById('syncDisable').onclick = disableSync;
  document.getElementById('syncNowBtn').onclick = syncNow;
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
