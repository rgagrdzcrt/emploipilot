/* ZCRT — lettre de motivation en PDF, sans bibliothèque externe.
 *
 * Page A4 en Helvetica (police standard de tous les lecteurs PDF, codage WinAnsi : accents
 * français, « », ’, —, €, œ) : coordonnées en tête, destinataire, date, objet, texte justifié
 * et signature. Le fichier est fabriqué dans le navigateur : rien n'est envoyé nulle part.
 * buildLetterPdf() est pure (testée dans tests/front.test.js) ; downloadLetterPdf() télécharge.
 */

// Largeurs Helvetica et Helvetica-Bold (millièmes du corps) : codes 32 à 126, puis 160 à 255,
// et les signes WinAnsi de 128 à 159 (€, ’, —, œ…).
const PDF_WIDTHS = (() => {
  const nums = s => s.split(' ').map(Number);
  const table = (ascii, high, ext) => {
    const w = new Array(256).fill(0);
    nums(ascii).forEach((v, i) => { w[32 + i] = v; });
    nums(high).forEach((v, i) => { w[160 + i] = v; });
    Object.entries(ext).forEach(([c, v]) => { w[c] = v; });
    return w;
  };
  return {
    regular: table(
      '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 '
      + '667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 '
      + '556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584',
      '278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611 '
      + '667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 '
      + '556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500',
      { 128: 556, 130: 222, 131: 556, 132: 333, 133: 1000, 134: 556, 135: 556, 136: 333, 137: 1000, 138: 667, 139: 333, 140: 1000,
        142: 611, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 150: 556, 151: 1000, 152: 333, 153: 1000, 154: 500, 155: 333,
        156: 944, 158: 500, 159: 667 }),
    bold: table(
      '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 '
      + '722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 '
      + '556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584',
      '278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611 '
      + '722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 '
      + '556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556',
      { 128: 556, 130: 278, 131: 556, 132: 500, 133: 1000, 134: 556, 135: 556, 136: 333, 137: 1000, 138: 667, 139: 333, 140: 1000,
        142: 611, 145: 278, 146: 278, 147: 500, 148: 500, 149: 350, 150: 556, 151: 1000, 152: 333, 153: 1000, 154: 556, 155: 333,
        156: 944, 158: 500, 159: 667 }),
  };
})();

// Unicode → WinAnsi pour les signes de 128 à 159.
const PDF_WINANSI = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138,
  '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153,
  'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };

/** Texte → codes WinAnsi (lettres hors codage : sans leur accent, sinon « ? »). */
function pdfEncode(str) {
  const codes = [];
  for (const ch of String(str || '')) {
    const c = ch.codePointAt(0);
    if (c === 9) codes.push(32);
    else if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) codes.push(c);
    else if (PDF_WINANSI[ch]) codes.push(PDF_WINANSI[ch]);
    else if (c === 0x202F || c === 0x2009 || c === 0x2007) codes.push(160); // espaces fines insécables
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const b = base.codePointAt(0);
      codes.push(base && ((b >= 32 && b <= 126) || (b >= 160 && b <= 255)) ? b : 63);
    }
  }
  return codes;
}

function pdfWidth(codes, size, bold) {
  const w = PDF_WIDTHS[bold ? 'bold' : 'regular'];
  return codes.reduce((s, c) => s + (w[c] || 556), 0) * size / 1000;
}

/** Coupe une ligne (codes) en lignes de largeur `max` ; un mot trop long est coupé lui-même. */
function pdfWrap(codes, size, bold, max) {
  const words = [];
  let word = [];
  for (const c of codes) {
    if (c === 32) { if (word.length) words.push(word); word = []; } else word.push(c);
  }
  if (word.length) words.push(word);
  const lines = [];
  let line = [];
  const space = pdfWidth([32], size, bold);
  for (let w of words) {
    while (pdfWidth(w, size, bold) > max) { // mot plus long que la ligne (adresse e-mail, lien…)
      if (line.length) { lines.push(line); line = []; }
      let n = w.length;
      while (n > 1 && pdfWidth(w.slice(0, n), size, bold) > max) n--;
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    if (!w.length) continue;
    if (line.length && pdfWidth(line, size, bold) + space + pdfWidth(w, size, bold) > max) { lines.push(line); line = []; }
    line = line.length ? [...line, 32, ...w] : [...w];
  }
  if (line.length || !lines.length) lines.push(line);
  return lines;
}

function pdfString(codes) {
  return codes.map(c => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c)
    : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c))).join('');
}

function pdfUtf16(str) {
  let hex = 'FEFF';
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const PDF_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function pdfDateFr(d) { return `${d.getDate() === 1 ? '1er' : d.getDate()} ${PDF_MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

/** Ville de l'expéditeur dans « Adresse / ville » : « 12 rue X, 93140 Bondy » ou « Bondy 93140 » → « Bondy ». */
function pdfSenderCity(adresse) {
  const a = String(adresse || '').replace(/\n+/g, ', ').replace(/\(.*?\)/g, ' ');
  const m = a.match(/\b\d{5}\s+([^\d,]+)$/);
  if (m) return m[1].trim();
  const parts = a.split(',').map(s => s.replace(/\b\d{5}\b/g, '').trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return /\d/.test(last) ? '' : last;
}

const pdfNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Lettre en PDF (chaîne ASCII, prête pour un Blob). */
function buildLetterPdf({ text, infos = {}, company = '', city = '', poste = '', date = new Date() }) {
  const W = 595.28, H = 841.89, LEFT = 62, RIGHT = 62, TOP = 60, BOTTOM = 62, MAX = W - LEFT - RIGHT, COL = 330;
  const fmt = v => (Math.round(v * 100) / 100).toString();
  const pages = [[]];
  let y = TOP;
  const put = (codes, x, size, bold, tw) => pages[pages.length - 1].push(
    `BT /${bold ? 'F2' : 'F1'} ${fmt(size)} Tf ${fmt(tw || 0)} Tw 1 0 0 1 ${fmt(x)} ${fmt(H - y)} Tm (${pdfString(codes)}) Tj ET`);
  // Ligne(s) de texte : x, corps, gras, interligne, alignement, largeur, justification.
  const write = (str, o = {}) => {
    const size = o.size || 11, lead = o.lead || size * 1.4, x0 = o.x || LEFT, width = o.width || (W - RIGHT - x0);
    const lines = pdfWrap(pdfEncode(str), size, !!o.bold, width);
    lines.forEach((codes, i) => {
      if (y + size > H - BOTTOM) { pages.push([]); y = TOP; }
      y += size;
      let x = x0, tw = 0;
      if (o.align === 'right') x = W - RIGHT - pdfWidth(codes, size, o.bold);
      const spaces = codes.filter(c => c === 32).length;
      if (o.justify && i < lines.length - 1 && spaces) {
        tw = (width - pdfWidth(codes, size, o.bold)) / spaces;
        if (tw > size * 0.6) tw = 0; // ligne trop courte : pas d'étirement
      }
      put(codes, x, size, o.bold, tw);
      y += lead - size;
    });
  };

  // Le texte de la lettre : paragraphes séparés par une ligne vide ; signature = nom du profil.
  const fullName = [infos.prenom, infos.nom].filter(Boolean).join(' ').trim();
  const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map(p => p.trim()).filter(Boolean);
  let signature = '';
  const last = (paragraphs[paragraphs.length - 1] || '').split('\n')[0].trim();
  if (fullName && pdfNorm(last) === pdfNorm(fullName)) { signature = last; paragraphs.pop(); }

  // En-tête : expéditeur, destinataire, date, objet.
  if (fullName) write(fullName, { size: 12, bold: true, lead: 16 });
  String(infos.adresse || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(l => write(l, { size: 10, lead: 13.5 }));
  if (infos.telephone) write(infos.telephone, { size: 10, lead: 13.5 });
  if (infos.email) write(infos.email, { size: 10, lead: 13.5 });
  if (company) {
    y += 18;
    write(company, { x: COL, size: 11, bold: true, lead: 14.5 });
    if (city) write(city, { x: COL, size: 10, lead: 13.5 });
  }
  y += 20;
  const from = pdfSenderCity(infos.adresse);
  write(`${from ? from + ', le' : 'Le'} ${pdfDateFr(date)}`, { size: 10.5, align: 'right' });
  y += 22;
  const p = String(poste || '').trim();
  write(p && p !== 'ce poste' ? `Objet : Candidature au poste ${/^[aeiouyhàâéèêëîïôûü]/i.test(p) ? "d'" : 'de '}${p}` : 'Objet : Candidature',
    { size: 11, bold: true, lead: 15 });
  y += 18;

  // Corps, justifié ; une ligne simple dans un paragraphe reste un retour à la ligne.
  paragraphs.forEach(par => {
    par.split('\n').forEach(l => write(l.trim(), { size: 11, lead: 15.4, justify: true }));
    y += 7;
  });
  if (signature) { y += 10; write(signature, { x: COL, size: 11, bold: true }); }

  // Assemblage : catalogue, pages, polices, informations, puis pages et contenus.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfUtf16('Lettre de motivation' + (company ? ' – ' + company : ''))} /Author ${pdfUtf16(fullName)} /Creator (ZCRT) /Producer (ZCRT)`
      + ` /CreationDate (D:${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}) >>`,
  ];
  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** « Lettre_motivation_CARTIER_GAZARD_Ryan_Carrefour.pdf » (sans accents ni espaces). */
function letterPdfName(infos, company) {
  const part = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return ['Lettre_motivation', part((infos || {}).nom), part((infos || {}).prenom), part(company)].filter(Boolean).join('_') + '.pdf';
}

/** Destinataire : l'entreprise de l'annonce (agence comprise : c'est à elle qu'on écrit). */
function letterRecipient(o) {
  const c = String((o && o.company) || '').trim();
  if (!c || /à vérifier/i.test(c) || (typeof LETTER_NO_COMPANY_RE !== 'undefined' && LETTER_NO_COMPANY_RE.test(c))) return '';
  return c.length > 4 && c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : c;
}

/** Télécharge la lettre affichée (texte modifié compris) en PDF. */
function downloadLetterPdf(text, o) {
  if (!String(text || '').trim()) { toast('Pas de lettre à télécharger'); return; }
  const infos = infosOf();
  const company = letterRecipient(o);
  const raw = o && (o.title || '').trim() ? letterPoste(o) : '';
  const poste = typeof accentPoste === 'function' ? accentPoste(raw) : raw;
  const pdf = buildLetterPdf({ text, infos, company, city: o && o.location ? cityOf(o) : '', poste, date: new Date() });
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: letterPdfName(infos, company) });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Lettre téléchargée en PDF');
}
