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
});

test('« À postuler » : règles d’intitulé limitées aux métiers de la logistique', () => {
  const r = slice('const PURGE_BEFORE', 'function purgeOffers', {
    ACTIVE_PROFILE: ryan, CATS: ryan.cats, categoryOf: o => o.category || 'stock',
  });
  const cases = [
    ['Responsable de point de vente', 'encadrement', '', false], ['Chef de caisse', 'encadrement', '', false],
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

test('aucun caractère de contrôle dans les fichiers du site', () => {
  for (const f of ['app.js', 'pilot.js', 'profiles.js', 'ui.js', 'compose.js', 'letters.js', 'sw.js', 'index.html']) {
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(read(f)), f);
  }
});
