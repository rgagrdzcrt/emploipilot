// Tests des règles du site (pilot.js, profiles.js), sans navigateur.
// Lancer : node --test tests/front.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// Faux navigateur minimal : profiles.js touche au DOM en se chargeant.
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub), apply: () => stub, set: () => true,
});
function profileOf(id) {
  const ctx = { document: stub, window: stub, navigator: stub, location: { search: '', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('profiles.js') + `;this.__p = ZCRT_PROFILES[${JSON.stringify(id)}];`, ctx);
  return ctx.__p;
}

/** Extrait du code de pilot.js entre deux repères, exécuté avec les variables données. */
function slice(from, to, vars) {
  const src = read('pilot.js');
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `repères introuvables : ${from} / ${to}`);
  const names = Object.keys(vars);
  return new Function(...names, src.slice(a, b) + ';return {isPurged, isUnwanted, applySync: typeof applySync === "function" ? applySync : null};')(
    ...names.map(n => vars[n]));
}

const ryan = profileOf('ryan');
const rules = slice('const PURGE_BEFORE', 'function purgeOffers', {
  ACTIVE_PROFILE: ryan, CATS: ryan.cats, categoryOf: o => o.category || 'stock',
});

test('remise à zéro : candidatures envoyées avant le 12/11 supprimées, entretiens gardés', () => {
  const cases = [
    [{ status: 'Candidature envoyée', appliedDate: '2026-11-05' }, true],
    [{ status: 'Refus', appliedDate: '2026-11-01' }, true],
    [{ status: 'À relancer', appliedDate: '2026-11-10' }, true],
    [{ status: 'Candidature envoyée', appliedDate: '2026-11-15' }, false],
    [{ status: 'Entretien', appliedDate: '2026-11-01' }, false],
    [{ status: 'À examiner' }, false],
  ];
  for (const [o, expected] of cases) assert.strictEqual(rules.isPurged(o), expected, JSON.stringify(o));
});

test('« À postuler » : offres non voulues retirées, les autres gardées', () => {
  const cases = [
    ['Approvisionneur H/F', '', true], ['Magasinier approvisionneur', '', false],
    ['Magasinier cariste H/F', '', true], ['Stockiste / conseiller de vente', '', true],
    ["Responsable d'exploitation logistique", '', true],
    ['Préparateur de commandes', 'Vous êtes titulaire du CACES 1 et 3.', true],
    ['Préparateur de commandes', 'CACES 1 souhaité.', false],
    ['Gestionnaire de stock H/F', '', false], ['Assistant logistique', '', false],
    ['E.Leclerc - Réceptionnaire - H/F', '', true], ['Magasinier réceptionnaire', '', false],
    ['Responsable optimisation des stocks', '', false], ['Assistant achats', '', true],
    ['Gestionnaire stock et approvisionnements', '', false],
  ];
  for (const [title, notes, expected] of cases) {
    assert.strictEqual(rules.isPurged({ status: 'À postuler', title, notes }), expected, title);
  }
  // Une candidature déjà envoyée n'est jamais retirée pour son intitulé.
  assert.strictEqual(rules.isPurged({ status: 'Candidature envoyée', appliedDate: '2026-11-18', title: 'Cariste' }), false);
  // Michael Page : retiré de « À postuler » quel que soit le métier, jamais une candidature envoyée.
  assert.strictEqual(rules.isPurged({ status: 'À postuler', title: 'Magasinier H/F', company: 'MICHAEL PAGE ADVERTISING' }), true);
  assert.strictEqual(rules.isPurged({ status: 'À postuler', title: 'Chef de rayon', category: 'encadrement', company: 'Michael Page' }), true);
  assert.strictEqual(rules.isPurged({ status: 'À postuler', title: 'Magasinier H/F', company: 'Darty' }), false);
  assert.strictEqual(rules.isPurged({ status: 'Candidature envoyée', appliedDate: '2026-11-18', title: 'Magasinier', company: 'Michael Page' }), false);
});

test('« À postuler » : règles d’intitulé limitées aux métiers de la logistique', () => {
  const r = slice('const PURGE_BEFORE', 'function purgeOffers', {
    ACTIVE_PROFILE: ryan, CATS: ryan.cats, categoryOf: o => o.category || 'stock',
  });
  const cases = [
    // Encadrement (revue du 21/11/2026) : chefs de rayon et de caisse oui, responsables ou adjoints de magasin non.
    ['Responsable de point de vente', 'encadrement', '', true], ['Chef de caisse', 'encadrement', '', false],
    ['Responsable adjoint de magasin', 'encadrement', '', true], ['Chef de rayon fruits et légumes', 'encadrement', '', false],
    ['Manager Drive (F/H) - Hypermarché', 'encadrement', '', false],
    // Stock : ni gros sites, quai, manutention ou livraison ; « Stock Manager », chef d'équipe et coordinateur restent.
    ['Responsable de Secteur Logistique H/F', 'stock', '', true], ['Chef d’équipe logistique', 'stock', '', false],
    ['Agent de quai H/F', 'stock', '', true], ['Agent de quai H/F', 'aeroport', '', false], ['MAGASINIER LIVREUR', 'stock', '', true],
    ['Stock Manager H/F', 'stock', '', false], ['Coordinateur logistique', 'stock', '', false],
    ['Préparateur de commandes vendeur', 'preparation', '', true],
    ['Agent de piste', 'aeroport', 'CACES 1 obligatoire.', true], ['Agent de tri', 'tri', '', false],
  ];
  for (const [title, category, notes, expected] of cases) {
    assert.strictEqual(r.isPurged({ status: 'À postuler', title, category, notes }), expected, title);
  }
});

test('profil de Ryan : chaque onglet a libellé, icône, CV, modèle de lettre, score et missions', () => {
  const ctx = { document: stub, window: stub, navigator: stub, location: { search: '', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('profiles.js') + ';this.__info = CAT_INFO;', ctx);
  vm.runInContext(read('compose.js') + ';this.__lp = LETTER_PROFILE;', ctx);
  vm.runInContext(read('letters.js') + ';this.__lt = LETTER_TAILOR;', ctx);
  const html = read('index.html'), pilot = read('pilot.js');
  assert.deepStrictEqual([...ryan.cats], ['stock', 'preparation', 'encadrement', 'aeroport', 'tri']);
  for (const c of ryan.cats) {
    assert.ok(ctx.__info[c] && ctx.__info[c].label, `libellé ${c}`);
    assert.ok(html.includes(`<symbol id="i-${ctx.__info[c].icon}"`), `icône ${c}`);
    assert.ok(ryan.cv[c], `CV ${c}`);
    assert.ok(ryan.fit.cats[c] && ryan.fit.cats[c].titles.length, `score ${c}`);
    assert.ok(new RegExp(`\\n  ${c}: \`Madame, Monsieur,`).test(pilot), `modèle de lettre ${c}`);
    assert.ok(ctx.__lp.ryan.domains[c] && ctx.__lp.ryan.defaultQualities[c], `lettre composée ${c}`);
    assert.ok((ctx.__lt.ryan.missions[c] || []).length >= 4, `missions ${c}`);
  }
  // Jamais « c'est précisément le métier que j'exerce » pour un poste jamais occupé tel quel.
  for (const c of ['preparation', 'encadrement', 'aeroport', 'tri']) assert.strictEqual(ctx.__lp.ryan.domains[c].exact, false);
});

test('lettres de Ryan : conformes au CV stock et propres à chaque entreprise', () => {
  const pilot = read('pilot.js').replace(/\r\n/g, '\n'); // copie Windows : fins de ligne CRLF
  const fn = name => {
    const a = pilot.indexOf(`function ${name}(`), b = pilot.indexOf('\n}\n', a);
    assert.ok(a >= 0 && b > a, `fonction ${name} introuvable`);
    return pilot.slice(a, b + 2);
  };
  const jobWord = pilot.indexOf('const JOB_WORD_RE');
  const ctx = {
    ACTIVE_PROFILE: ryan,
    norm: s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''),
    jobCategory: o => o.category,
    infosOf: () => ({ prenom: 'Ryan', nom: 'CARTIER GAZARD', disponibilite: 'immédiatement' }),
  };
  vm.createContext(ctx);
  vm.runInContext([fn('fitText'), pilot.slice(jobWord, pilot.indexOf('\n', jobWord)), fn('letterPoste'), fn('cityOf'),
    read('letters.js'), read('compose.js'), 'this.__letter = composeLetter;'].join('\n'), ctx);
  const letter = o => ctx.__letter({ id: o.title + '|' + o.company, contract: 'CDI', notes: '', ...o });
  const out = Object.fromEntries(Object.entries({
    carrefour: { title: 'Magasinier H/F', company: 'CARREFOUR', category: 'stock',
      notes: 'Réception des marchandises et mise en rayon. Chaussures de sécurité fournies, mutuelle santé.' },
    sephora: { title: 'Coordinateur stock', company: 'Sephora', category: 'stock', notes: 'Suivi des stocks, gestion des ruptures et inventaires.' },
    darty: { title: 'Magasinier', company: 'Darty', category: 'stock', notes: 'Réception des livraisons.' },
    interim: { title: 'Préparateur de commandes', company: 'Manpower', category: 'preparation', contract: 'Intérim',
      notes: 'Préparation des commandes. Chaussures de sécurité, mutuelle santé.' },
    piste: { title: 'Agent de piste', company: 'Swissport', category: 'aeroport', notes: 'Chargement des bagages.' },
    kenvue: { title: 'Agent de tri colis', company: 'Kenvue', category: 'tri', notes: 'Tri des colis et contrôle des écarts.' },
  }).map(([k, o]) => [k, letter(o)]));
  for (const [k, l] of Object.entries(out)) {
    // CV stock seulement : ni rayon (Monoprix, E.Leclerc), ni vente (COS), ni ancien intitulé, ni WMS.
    assert.ok(!/Monoprix|Leclerc|\bCOS\b|WMS|Agent de stock|Plus récemment/.test(l), `${k} :\n${l}`);
  }
  assert.match(out.carrefour, /Carrefour/);
  assert.match(out.carrefour, /la distribution alimentaire/);
  // Intitulé introuvable (annonce collée sans titre) : jamais « un poste de ce poste ».
  for (let i = 0; i < 6; i++) {
    for (const company of ['', 'Picard']) {
      const l = letter({ title: '', company, category: 'stock', id: 'x' + i + company, notes: 'Vous rangez la réserve.' });
      assert.ok(!/de ce poste|que ce poste/.test(l), l);
    }
  }
  assert.match(out.sephora, /Coordinateur stock chez Aroma-Zone|Chez Aroma-Zone, comme coordinateur stock/);
  assert.match(out.sephora, /beauté/);
  assert.match(out.darty, /Revenir chez Darty/);
  // Agence jamais nommée ; « chaussures de sécurité » n'est pas la mode, « mutuelle santé » pas la santé.
  assert.ok(!/Manpower|la mode|la santé/.test(out.interim), out.interim);
  assert.match(out.piste, /Swissport/);
  assert.match(out.piste, /aéroportuaire/);
  assert.match(out.kenvue, /la santé/);
  // Temps de trajet calculé par la collecte : le site est proche du domicile (jamais pour un département).
  assert.match(letter({ title: 'Magasinier', company: 'Picard', category: 'stock', location: 'Rosny-sous-Bois (93)', trajetMin: 22 }),
    /J'habite à Bondy, à environ 20 minutes de Rosny-sous-Bois/);
  assert.ok(!/J'habite/.test(letter({ title: 'Magasinier', company: 'Picard', category: 'stock', location: 'Seine-Saint-Denis (93)', trajetMin: 22 })));
});

test('lettre en PDF : fichier valide, accents, justifiée, coordonnées en tête, nom de fichier', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('letterpdf.js') + ';this.__pdf = buildLetterPdf; this.__name = letterPdfName; this.__city = pdfSenderCity;', ctx);
  const infos = { prenom: 'Ryan', nom: 'CARTIER GAZARD', adresse: '12 rue de la Gare, 93140 Bondy', telephone: '+33 6 00 00 00 00', email: 'ryan@example.com' };
  const text = 'Madame, Monsieur,\n\nVotre offre de magasinier chez Carrefour a retenu toute mon attention : '
    + 'c’est précisément le métier que j’exerce depuis près de 4 ans. '
    + 'Réception, contrôle et mise en stock « au quotidien » — sans écart, avec rigueur et méthode. '.repeat(3)
    + '\n\nJe vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.'
    + '\n\nRyan CARTIER GAZARD\n+33 6 00 00 00 00 — ryan@example.com';
  const pdf = ctx.__pdf({ text, infos, company: 'Carrefour', city: 'Rosny-sous-Bois', poste: 'magasinier', date: new Date(2026, 10, 21) });
  assert.ok(pdf.startsWith('%PDF-1.4\n') && pdf.endsWith('%%EOF\n'));
  assert.ok(/^[\n\x20-\x7e]*$/.test(pdf), 'PDF en ASCII : les décalages sont des octets');
  // Table xref : chaque décalage pointe sur son objet, startxref sur « xref » ; longueurs de flux exactes.
  const start = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.strictEqual(pdf.slice(start, start + 5), 'xref\n');
  pdf.slice(start).match(/^\d{10} 00000 n $/gm).forEach((e, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, Number(e.slice(0, 10))), `objet ${i + 1}`));
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const end = m.index + m[0].length + Number(m[1]);
    assert.strictEqual(pdf.slice(end, end + 10), '\nendstream');
  }
  assert.match(pdf, /\(Madame, Monsieur,\) Tj/);
  assert.match(pdf, /\(Objet : Candidature au poste de magasinier\) Tj/);
  assert.match(pdf, /\(Bondy, le 21 novembre 2026\) Tj/);
  assert.match(pdf, /\(Carrefour\) Tj/);
  assert.match(pdf, /\\351/); // « é » en WinAnsi
  assert.match(pdf, /\\222/); // « ’ »
  assert.match(pdf, /\\227/); // « — »
  assert.match(pdf, /\\253/); // « « »
  assert.match(pdf, / [1-9][\d.]* Tw /, 'lignes justifiées');
  assert.strictEqual(pdf.split('(ryan@example.com) Tj').length, 2, 'coordonnées une seule fois, en tête');
  assert.match(pdf, /\/Count 1 /);
  // Lettre longue : deuxième page.
  const long = ctx.__pdf({ text: text.replace('Madame, Monsieur,', 'Madame, Monsieur,\n\n' + 'Une phrase de plus. '.repeat(330)), infos });
  assert.match(long, /\/Count 2 /);
  assert.strictEqual(ctx.__name(infos, 'Carrefour'), 'Lettre_motivation_CARTIER_GAZARD_Ryan_Carrefour.pdf');
  assert.strictEqual(ctx.__name({}, 'L’Oréal'), 'Lettre_motivation_L_Oreal.pdf');
  assert.deepStrictEqual(['Bondy 93140', '12 rue X, 93140 Bondy', 'Bondy (93)', '12 rue X'].map(a => ctx.__city(a)), ['Bondy', 'Bondy', 'Bondy', '']);
});

test('stockistes : 15 jours et jamais masqués par un type, sauf cariste et direction', () => {
  const src = read('pilot.js');
  const a = src.indexOf('const JOB_TYPES'), b = src.indexOf('function hiddenTypes', a);
  assert.ok(a >= 0 && b > a);
  const t = new Function('norm', 'profile', 'ACTIVE_PROFILE', 'parseDate', 'offerDate', 'deptOf', 'categoryOf',
    src.slice(a, b) + '\nfunction hiddenTypes() { return DEFAULT_HIDDEN_TYPES; }\nreturn { maxAgeDays, hidingType, tooOld, zoneHides };')(
    s => String(s || '').toLowerCase(), {}, { zones: ryan.zones }, s => (s ? new Date(s) : null), o => o.date, o => o.dept, o => o.category);
  // Zones de Ryan : 93 et 75 toujours ; en 92, 77 et 94, seulement les stockistes (onglet Aéroport à part).
  assert.deepStrictEqual([...ryan.zones.stockisteOnly], ['92', '77', '94']);
  assert.strictEqual(t.zoneHides({ title: 'Magasinier', dept: '77', category: 'stock' }), true);
  assert.strictEqual(t.zoneHides({ title: 'Stockiste H/F', dept: '92', category: 'stock' }), false);
  assert.strictEqual(t.zoneHides({ title: 'Magasinier', dept: '93', category: 'stock' }), false);
  assert.strictEqual(t.zoneHides({ title: 'Magasinier', dept: '95', category: 'stock' }), false);
  assert.strictEqual(t.zoneHides({ title: 'Agent de piste', dept: '94', category: 'aeroport' }), false);
  const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();
  assert.strictEqual(t.maxAgeDays({ title: 'Stockiste H/F' }), 15);
  assert.strictEqual(t.maxAgeDays({ title: 'Employé de réserve' }), 15);
  assert.strictEqual(t.maxAgeDays({ title: 'Magasinier' }), 5);
  assert.strictEqual(t.tooOld({ title: 'Stockiste', date: daysAgo(10) }), false);
  assert.strictEqual(t.tooOld({ title: 'Magasinier', date: daysAgo(10) }), true);
  assert.strictEqual(t.tooOld({ title: 'Stockiste', date: daysAgo(16) }), true);
  // Types masqués par défaut (luxe, cosmétique, week-end…) : sans effet sur un stockiste.
  assert.strictEqual(t.hidingType({ title: 'Stockiste luxe H/F' }), undefined);
  assert.strictEqual(t.hidingType({ title: 'Stockiste parfumerie week-end' }), undefined);
  assert.strictEqual((t.hidingType({ title: 'Conseiller de vente luxe' }) || {}).id, 'luxe');
  assert.strictEqual((t.hidingType({ title: 'Stockiste cariste CACES' }) || {}).id, 'cariste');
});

test('synchro : un appareil neuf ne remplace jamais le profil du gist', () => {
  const src = read('pilot.js');
  const a = src.indexOf('function applySync'), b = src.indexOf('function applySyncCache');
  const run = (localProfile, remote, firstSync) => {
    const env = { offers: [], profile: { ...localProfile }, stored: [] };
    const fn = new Function('env', 'isPurged', 'TRACK_FIELDS', 'store', 'refreshProfileForms', 'PROFILE',
      `let offers = env.offers, profile = env.profile;\n${src.slice(a, b)}\n` +
      'const changed = applySync(env.remote, env.firstSync); return { changed, profile };');
    env.remote = remote; env.firstSync = firstSync;
    return fn(env, () => false, [], () => {}, () => {}, 'profil');
  };
  const remote = { entries: {}, profileUpdatedAt: 1000, profile: { infos: { nom: 'Ryan CARTIER GAZARD' }, updatedAt: 1000 } };
  // Profil local vide mais daté de « maintenant » (ancien défaut de migration).
  const first = run({ keywords: 'x', updatedAt: Date.now() }, remote, true);
  assert.strictEqual(first.profile.infos.nom, 'Ryan CARTIER GAZARD');
  assert.strictEqual(first.profile.updatedAt, 1000);
  // Ensuite, la modification la plus récente gagne comme avant.
  const later = run({ infos: { nom: 'Local' }, updatedAt: 2000 }, remote, false);
  assert.strictEqual(later.profile.infos.nom, 'Local');
  const older = run({ infos: { nom: 'Local' }, updatedAt: 500 }, remote, false);
  assert.strictEqual(older.profile.infos.nom, 'Ryan CARTIER GAZARD');
});

test('migration « Gazard » : ne date plus un profil qu’elle ne modifie pas', () => {
  const src = read('pilot.js');
  const a = src.indexOf("if (ACTIVE_PROFILE.id === 'ryan' && !profile.gazardMigrated)");
  const b = src.indexOf('// Profil recentré sur la logistique', a);
  const block = src.slice(a, b);
  assert.ok(/if \(changedCv\) profile\.updatedAt = Date\.now\(\);/.test(block));
  assert.ok(!/^\s*profile\.updatedAt = Date\.now\(\);/m.test(block));
});

test('service worker : réseau lent → copie locale, sinon réseau', async () => {
  // Délais réduits (4 s → 40 ms, 8 s → 80 ms) pour un test rapide.
  const src = read('sw.js').replace('= 4000', '= 40').replace('= 8000', '= 80');
  const run = async ({ netMs, netOk = true, cached }) => {
    const handlers = {}, waits = [];
    const cache = new Map(cached ? [['https://site/app.js', 'copie']] : []);
    const sandbox = {
      self: { addEventListener: (t, h) => { handlers[t] = h; }, location: { origin: 'https://site' }, skipWaiting() {}, clients: { claim() {} } },
      caches: { open: async () => ({ put: (r, v) => cache.set(r.url, v) }), match: async r => cache.get(r.url), keys: async () => [] },
      fetch: () => new Promise((ok, ko) => setTimeout(() => (netOk ? ok({ ok: true, body: 'réseau', clone() { return 'réseau'; } }) : ko(new Error('hors ligne'))), netMs)),
      Response: { error: () => 'erreur' }, URL, Promise, setTimeout, clearTimeout,
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    let answer;
    handlers.fetch({ request: { method: 'GET', url: 'https://site/app.js' }, respondWith: p => { answer = p; }, waitUntil: p => waits.push(p) });
    const r = await answer;
    return typeof r === 'string' ? r : r.body;
  };
  assert.strictEqual(await run({ netMs: 5, cached: true }), 'réseau');          // réseau rapide
  assert.strictEqual(await run({ netMs: 300, cached: true }), 'copie');          // réseau lent, copie
  assert.strictEqual(await run({ netMs: 5, netOk: false, cached: false }), 'erreur'); // ni réseau ni copie
  assert.strictEqual(await run({ netMs: 120, cached: false }), 'réseau');        // lent mais sans copie : on attend
});

test('nom « CARTIER GAZARD » : une seule fois, et seulement si le nom était « Gazard »', () => {
  const src = read('pilot.js');
  const a = src.indexOf('function migrateCartierGazard'), b = src.indexOf('function cvOf', a);
  const make = p => new Function('ACTIVE_PROFILE', 'store', 'PROFILE', 'env',
    `let profile = env.profile;\n${src.slice(a, b)}\nconst r1 = migrateCartierGazard(); const r2 = migrateCartierGazard();\nreturn { r1, r2, profile };`)(
    { id: 'ryan' }, () => {}, 'profil', { profile: p });
  const moved = make({ infos: { prenom: 'Ryan', nom: 'Gazard' }, updatedAt: 1 });
  assert.strictEqual(moved.profile.infos.nom, 'CARTIER GAZARD');
  assert.strictEqual(moved.profile.infos.prenom, 'Ryan');
  assert.ok(moved.profile.updatedAt > 1);
  assert.deepStrictEqual([moved.r1, moved.r2], [true, false]);
  const other = make({ infos: { nom: 'Martin' }, updatedAt: 1 });
  assert.strictEqual(other.profile.infos.nom, 'Martin');
  assert.strictEqual(other.profile.updatedAt, 1); // rien changé : pas de date avancée
  const empty = make({ updatedAt: 1 });
  assert.strictEqual(empty.profile.updatedAt, 1);
});

test('générateur de lettre : poste, entreprise, ville et contrat lus dans l’annonce collée', () => {
  const ctx = { document: stub, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, nsKey: k => k,
    deptOf: o => (/\b(bondy|rosny-sous-bois|saint-denis|bobigny)\b/i.test(o.location) ? '93' : '') };
  vm.createContext(ctx);
  vm.runInContext(read('lettre.js'), ctx);
  const d = text => { const r = ctx.lmDetect(text); return [r.title, r.company, r.location, r.contract]; };
  // Indeed : entreprise sous l'intitulé, note et lieu ensuite.
  assert.deepStrictEqual(d('Stockiste H/F\nSephora\n4,0 sur 5 étoiles\nRosny-sous-Bois (93)\nCDI\nDescription du poste\nVous rangez la réserve.'),
    ['Stockiste H/F', 'Sephora', 'Rosny-sous-Bois', 'CDI']);
  // HelloWork : « Ville - 75 ».
  assert.deepStrictEqual(d('Employé de réserve H/F\nMonoprix\nParis 11e - 75\nCDD - 6 mois\nMissions'),
    ['Employé de réserve H/F', 'Monoprix', 'Paris 11e', 'CDD']);
  // LinkedIn : entreprise au-dessus de l'intitulé, lieu suivi de « · il y a… ».
  assert.deepStrictEqual(d('ID Logistics\nPréparateur de commandes\nSaint-Denis, Île-de-France, France · il y a 2 jours · 25 candidats\nIntérim'),
    ['Préparateur de commandes', 'ID Logistics', 'Saint-Denis', 'Intérim']);
  // France Travail : « Publié le… » n'est pas l'entreprise ; elle est sous la rubrique « Entreprise ».
  assert.deepStrictEqual(d('Magasinier (H/F)\nPublié le 20 novembre 2026\n93 - BONDY - Localiser avec Mappy\nCDI\nVous rangez la réserve.\nEntreprise\nDARTY\nGrand magasin.'),
    ['Magasinier (H/F)', 'DARTY', 'Bondy', 'CDI']);
  // Repères écrits : « Entreprise : », « Lieu : », « chez X » (accents compris).
  assert.deepStrictEqual(d('Agent de stock H/F\nEntreprise : Carrefour Market\nLieu : Bobigny\nCDD'),
    ['Agent de stock H/F', 'Carrefour Market', 'Bobigny', 'CDD']);
  assert.strictEqual(ctx.lmDetect('Vous rejoindrez l’équipe chez Picard Surgelés, en CDI.').company, 'Picard Surgelés');
  // Annonce collée d'un seul bloc (téléphone) : l'intitulé s'arrête à « H/F ».
  assert.strictEqual(ctx.lmDetect('Stockiste H/F Sephora Rosny-sous-Bois (93) CDI Temps plein Au sein de notre magasin, vous rangez la réserve et réassortissez la surface de vente.').title,
    'Stockiste H/F');
  // Lettre de l'onglet : celle de la fenêtre Préparer (modèle du métier pour Zia), pas seulement composeLetter.
  ctx.composeLetter = () => '';
  assert.strictEqual(ctx.lmLetter({ title: 'Vendeuse' }), '');
  ctx.fillTemplate = o => 'Modèle : ' + o.title;
  assert.strictEqual(ctx.lmLetter({ title: 'Vendeuse' }), 'Modèle : Vendeuse');
});

test('aucun caractère de contrôle dans les fichiers du site', () => {
  for (const f of ['app.js', 'pilot.js', 'profiles.js', 'ui.js', 'compose.js', 'letters.js', 'letterpdf.js', 'lettre.js', 'sw.js', 'index.html']) {
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(read(f)), f);
  }
});
