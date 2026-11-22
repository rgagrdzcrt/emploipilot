/* ZCRT — générateur de lettre de motivation.
 *
 * On colle le texte d'une annonce, on coche le CV à joindre : la lettre est composée
 * par compose.js (accroche, expériences choisies selon l'annonce, qualités, conclusion),
 * sans IA. Le poste, l'entreprise, la ville et le contrat sont devinés dans l'annonce et
 * restent modifiables. Le dernier texte collé est gardé sur l'appareil.
 */

const LM_DRAFT = nsKey('zcrt_lm_draft');
const LM_FIELDS = ['lmTitle', 'lmCompany', 'lmCity', 'lmContract'];
let lmSeed = 0;

function lmEl(id) { return document.getElementById(id); }

// Annonce copiée d'un site d'emploi (Indeed, HelloWork, LinkedIn, France Travail…) : l'intitulé
// en tête, l'entreprise et la ville sur les lignes voisines, parmi des lignes de détail à ignorer.
const LM_SKIP_RE = /^(offre|annonce|description|postuler|publi|il y a|r[ée]f|lieu|salaire|contrat)\b/i;
const LM_HF_RE = /\b[hf]\s*\/\s*[hf]\b/i;
const LM_JOB_START_RE = /^(?:stock|magasinier|pr[ée]parat|vendeu|employ[ée]|agent|chef|manager|responsable|adjoint|[ée]quipier|caissi|cariste|r[ée]ceptionn|op[ée]rat|assistant|conseill|h[oô]te|serveu|barista|commis|coordinat|gestionnaire|approvision|manutention|livreu|r[ée]serviste|logisticien|inventori|technicien|warehouse|sales|retail|inventory)/i;
const LM_PLACE_RE = /\(\d{2,3}\)|\b\d{5}\b|\s[-–]\s\d{2,3}\s*$|^\d{2,3}\s*[-–]\s|^(?:lieu|localisation|adresse)\s*:|\blocaliser\b/i;
// Bornes de mot écrites à la main : en JavaScript, \b ne connaît pas les lettres accentuées (« Publié », « Société »).
const LM_META_RE = /(?:^|[^a-zà-ÿ0-9])(?:cdi|cdd|int[ée]rim|alternance|apprentissage|stage|temps (?:plein|partiel)|salaire|brut|publi[a-zà-ÿ]*|il y a|aujourd'hui|hier|[ée]toiles?|postuler|candidature|candidats|r[ée]f[ée]rence|urgent|t[ée]l[ée]travail)(?![a-zà-ÿ0-9])|€|\b\d+\s*h\b|^\d|sur 5\b/i;
const LM_SECTION_RE = /^(?:description|missions?|vos missions|profil|le poste|[àa] propos|qui sommes|avantages|informations|d[ée]tails|type de contrat|horaires?|comp[ée]tences|qualit[ée]s|entreprise|soci[ée]t[ée]|employeur|recruteur|enseigne)(?![a-zà-ÿ0-9])/i;
const LM_LABEL_RE = /^(?:entreprise|soci[ée]t[ée]|employeur|enseigne|recruteur)\s*:?\s*$/i;

/** Ligne de lieu : « Rosny-sous-Bois (93) », « 93140 Bondy », « Bondy », « Lieu : Paris ». */
function lmIsPlace(l) {
  return LM_PLACE_RE.test(l) || (typeof deptOf === 'function' && l.length <= 40 && !!deptOf({ location: l }));
}

/** Ligne qui peut être le nom de l'entreprise : courte, sans phrase, ni lieu, ni détail, ni intitulé. */
function lmCompanyLine(l) {
  return !!l && l.length >= 2 && l.length <= 50 && l.split(' ').length <= 6 && !/[.!?:;]$/.test(l)
    && !/^[a-zà-ÿ]/.test(l) && !LM_META_RE.test(l) && !LM_SECTION_RE.test(l) && !LM_HF_RE.test(l)
    && !LM_JOB_START_RE.test(l) && !lmIsPlace(l);
}

/** « 93 - ROSNY SOUS BOIS - Localiser avec Mappy », « Rosny-sous-Bois - 93 », « Paris, Île-de-France » → la ville. */
function lmPlace(l) {
  let c = l.replace(/^(?:lieu|localisation|adresse)\s*:\s*/i, '').replace(/\s*[-–]?\s*localiser\b.*$/i, '')
    .replace(/^\d{2,3}\s*[-–]\s*/, '').replace(/\s*[-–]\s*\d{2,3}\s*$/, '').replace(/\s*\(\d{2,3}\)/g, '')
    .replace(/\b\d{5}\b/g, '').split(',')[0].replace(/\s+/g, ' ').replace(/^[\s–-]+|[\s–-]+$/g, '');
  if (c && c === c.toUpperCase()) c = c.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return c.length <= 50 ? c : '';
}

/** Poste, entreprise, ville et contrat lus dans le texte de l'annonce. */
function lmDetect(text) {
  const lines = text.split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Intitulé : ligne de tête qui nomme un métier (« H/F », « Stockiste… »), sinon la première ligne plausible.
  let ti = lines.slice(0, 8).findIndex(l => l.length <= 90 && !LM_SKIP_RE.test(l) && (LM_HF_RE.test(l) || LM_JOB_START_RE.test(l)));
  if (ti < 0) ti = lines.findIndex(l => l.length <= 90 && !LM_SKIP_RE.test(l));
  // Annonce collée d'un seul bloc (copie depuis un téléphone) : l'intitulé s'arrête à « H/F ».
  const block = ti < 0 && text.match(/^\s*(.{3,80}?\(?\b[hf]\s*\/\s*[hf]\b\)?)/i);
  const title = ti >= 0 ? lines[ti] : block ? block[1].replace(/\s+/g, ' ').trim() : '';
  // Entreprise : « Entreprise : X », « X recrute », ligne voisine de l'intitulé, ligne sous « Entreprise », « chez X ».
  const label = lines.findIndex(l => LM_LABEL_RE.test(l));
  const near = ti >= 0 ? [lines[ti + 1], lines[ti - 1], lines[ti + 2], lines[ti + 3]] : [];
  const company = ((text.match(/(?:entreprise|soci[ée]t[ée]|employeur|enseigne)\s*:\s*([^\n]{2,60})/i) || [])[1]
    || (text.match(/^([^\n]{2,60}?)\s+recrute\b/im) || [])[1]
    || near.find(lmCompanyLine)
    || (label >= 0 && lmCompanyLine(lines[label + 1]) ? lines[label + 1] : '')
    || (text.match(/\bchez ([A-Z][\p{L}\d&'’.\- ]{1,40}?)(?=[,.\n]| et | pour |$)/u) || [])[1] || '').trim();
  // Ville : première ligne de lieu en tête d'annonce (« Paris, Île-de-France · il y a 2 jours » : avant le « · »).
  const place = lines.slice(0, 12).map(l => l.split(/\s+[·•|]\s+/)[0])
    .find((l, i) => i !== ti && l !== company && l.length <= 80 && lmIsPlace(l));
  const contract = /\bint[ée]rim|\bmission\b/i.test(text) ? 'Intérim'
    : /\bCDD\b/.test(text) ? 'CDD' : /\bCDI\b/.test(text) ? 'CDI' : 'À vérifier';
  return { title, company, location: place ? lmPlace(place) : '', contract };
}

function lmCat() {
  return (document.querySelector('input[name="lmCv"]:checked') || {}).value || CATS[0];
}

function lmOffer() {
  return {
    id: 'lm' + lmSeed,
    title: lmEl('lmTitle').value.trim(),
    company: lmEl('lmCompany').value.trim(),
    location: (lmEl('lmCity') || { value: '' }).value.trim(), // ville de l'en-tête du PDF
    contract: lmEl('lmContract').value,
    notes: lmEl('lmText').value,
    category: lmCat(),
  };
}

/** Même lettre que la fenêtre Préparer (pilot.js) : composée selon l'annonce pour Ryan, sinon modèle
 * du métier (profil de Zia, ou modèle personnalisé dans Critères). composeLetter seul laissait Zia sans lettre. */
function lmLetter(o) {
  if (typeof fillTemplate === 'function') return fillTemplate(o);
  return typeof composeLetter === 'function' ? composeLetter(o) : '';
}

function lmRender() {
  const o = lmOffer();
  const ready = o.title || o.notes.trim();
  lmEl('lmOut').value = ready ? lmLetter(o) : '';
  lmEl('lmCvFile').textContent = cvOf(o.category) || '—';
  document.getElementById('lmResult').classList.toggle('empty', !ready);
}

/** Remplit poste / entreprise / ville / contrat tant que l'utilisateur ne les a pas modifiés. */
function lmAutofill() {
  const found = lmDetect(lmEl('lmText').value);
  [['lmTitle', found.title], ['lmCompany', found.company], ['lmCity', found.location], ['lmContract', found.contract]].forEach(([id, value]) => {
    const el = lmEl(id);
    if (el && el.dataset.touched !== '1') el.value = value;
  });
  // CV proposé selon le métier de l'annonce, tant qu'aucun n'a été coché à la main.
  const box = lmEl('lmCvs');
  if (box.dataset.touched !== '1' && found.title) {
    const cat = typeof categoryOf === 'function' ? categoryOf({ title: found.title }) : '';
    const radio = document.querySelector(`input[name="lmCv"][value="${cat}"]`);
    if (radio) radio.checked = true;
  }
  try { localStorage.setItem(LM_DRAFT, lmEl('lmText').value); } catch (e) { /* stockage indisponible */ }
  lmRender();
}

/** Lettre affichée (modifications comprises) en fichier PDF : letterpdf.js. */
function lmPdf() {
  const text = lmEl('lmOut').value;
  if (!text) return;
  if (typeof downloadLetterPdf !== 'function') { toast('Recharge la page pour télécharger la lettre en PDF'); return; }
  downloadLetterPdf(text, lmOffer());
}

function lmClear() {
  ['lmText', 'lmTitle', 'lmCompany', 'lmCity'].forEach(id => { const el = lmEl(id); if (el) { el.value = ''; delete el.dataset.touched; } });
  lmEl('lmContract').value = 'À vérifier';
  delete lmEl('lmContract').dataset.touched;
  delete lmEl('lmCvs').dataset.touched;
  try { localStorage.removeItem(LM_DRAFT); } catch (e) { /* stockage indisponible */ }
  lmRender();
  lmEl('lmText').focus();
}

function lmInit() {
  const box = lmEl('lmCvs');
  if (!box) return;
  box.innerHTML = CATS.map((c, i) => `<label class="lm-cv"><input type="radio" name="lmCv" value="${c}"${i ? '' : ' checked'}>`
    + `<span>${ic((CAT_INFO[c] || {}).icon || 'file')}${uiEsc((CAT_INFO[c] || {}).label || c)}</span></label>`).join('');
  box.addEventListener('change', () => { box.dataset.touched = '1'; lmRender(); });
  lmEl('lmText').addEventListener('input', lmAutofill);
  LM_FIELDS.forEach(id => lmEl(id) && lmEl(id).addEventListener('input', () => {
    lmEl(id).dataset.touched = '1';
    lmRender();
  }));
  lmEl('lmAgain').onclick = () => { lmSeed++; lmRender(); };
  lmEl('lmCopy').onclick = () => lmEl('lmOut').value && copyText(lmEl('lmOut').value, 'Lettre');
  lmEl('lmPrint').onclick = lmPdf; // identifiant d'origine : une ancienne copie en cache trouve toujours son bouton
  lmEl('lmClear').onclick = lmClear;
  try { lmEl('lmText').value = localStorage.getItem(LM_DRAFT) || ''; } catch (e) { /* stockage indisponible */ }
  lmAutofill();
}

document.addEventListener('DOMContentLoaded', lmInit);
