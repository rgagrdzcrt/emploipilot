/* ZCRT — générateur de lettre de motivation.
 *
 * On colle le texte d'une annonce, on coche le CV à joindre : la lettre est composée
 * par compose.js (accroche, expériences choisies selon l'annonce, qualités, conclusion),
 * sans IA. Le poste, l'entreprise et le contrat sont devinés dans l'annonce et restent
 * modifiables. Le dernier texte collé est gardé sur l'appareil.
 */

const LM_DRAFT = nsKey('zcrt_lm_draft');
let lmSeed = 0;

function lmEl(id) { return document.getElementById(id); }

/** Poste, entreprise et contrat lus dans le texte de l'annonce. */
function lmDetect(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const title = lines.find(l => l.length <= 90 && !/^(offre|annonce|description|postuler|publi|il y a|r[ée]f|lieu|salaire|contrat)\b/i.test(l)) || '';
  const company = (text.match(/(?:entreprise|soci[ée]t[ée]|employeur|enseigne)\s*:\s*([^\n]{2,60})/i)
    || text.match(/^([^\n]{2,60}?)\s+recrute\b/im)
    || text.match(/\bchez ([A-Z][\w&'’.\- ]{1,40}?)(?=[,.\n]| et | pour |$)/) || [])[1] || '';
  const contract = /\bint[ée]rim|\bmission\b/i.test(text) ? 'Intérim'
    : /\bCDD\b/.test(text) ? 'CDD' : /\bCDI\b/.test(text) ? 'CDI' : 'À vérifier';
  return { title: title.replace(/\s+/g, ' '), company: company.trim(), contract };
}

function lmCat() {
  return (document.querySelector('input[name="lmCv"]:checked') || {}).value || CATS[0];
}

function lmOffer() {
  return {
    id: 'lm' + lmSeed,
    title: lmEl('lmTitle').value.trim(),
    company: lmEl('lmCompany').value.trim(),
    contract: lmEl('lmContract').value,
    notes: lmEl('lmText').value,
    category: lmCat(),
  };
}

function lmRender() {
  const o = lmOffer();
  const ready = o.title || o.notes.trim();
  lmEl('lmOut').value = ready ? composeLetter(o) : '';
  lmEl('lmCvFile').textContent = cvOf(o.category) || '—';
  document.getElementById('lmResult').classList.toggle('empty', !ready);
}

/** Remplit poste / entreprise / contrat tant que l'utilisateur ne les a pas modifiés. */
function lmAutofill() {
  const found = lmDetect(lmEl('lmText').value);
  [['lmTitle', found.title], ['lmCompany', found.company], ['lmContract', found.contract]].forEach(([id, value]) => {
    const el = lmEl(id);
    if (el.dataset.touched !== '1') el.value = value;
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

function lmPrint() {
  const text = lmEl('lmOut').value;
  if (!text) return;
  const win = window.open('', '_blank');
  if (!win) { toast('Autorise les fenêtres pour imprimer'); return; }
  win.document.write('<!doctype html><meta charset="utf-8"><title>Lettre de motivation</title>'
    + '<style>body{font:12pt/1.55 Georgia,serif;margin:22mm 20mm;white-space:pre-wrap;color:#111}</style>'
    + uiEsc(text));
  win.document.close();
  win.focus();
  win.print();
}

function lmClear() {
  ['lmText', 'lmTitle', 'lmCompany'].forEach(id => { lmEl(id).value = ''; delete lmEl(id).dataset.touched; });
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
  ['lmTitle', 'lmCompany', 'lmContract'].forEach(id => lmEl(id).addEventListener('input', () => {
    lmEl(id).dataset.touched = '1';
    lmRender();
  }));
  lmEl('lmAgain').onclick = () => { lmSeed++; lmRender(); };
  lmEl('lmCopy').onclick = () => lmEl('lmOut').value && copyText(lmEl('lmOut').value, 'Lettre');
  lmEl('lmPrint').onclick = lmPrint;
  lmEl('lmClear').onclick = lmClear;
  try { lmEl('lmText').value = localStorage.getItem(LM_DRAFT) || ''; } catch (e) { /* stockage indisponible */ }
  lmAutofill();
}

document.addEventListener('DOMContentLoaded', lmInit);
