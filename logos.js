/* ZCRT — logos des entreprises et agences.
 *
 * Les offres ne donnent que le nom de l'entreprise : on le relie à son site
 * grâce à une table des enseignes et agences connues, puis on affiche l'icône
 * la plus nette trouvée pour ce site. Sans correspondance, ou si l'icône
 * trouvée est trop petite, les initiales colorées restent affichées.
 */

const COMPANY_DOMAINS = [
  // Agences d'intérim et de recrutement
  [/\bside by randstad\b|\brandstad\b/, 'randstad.fr'],
  [/\bmanpower\b/, 'manpower.com'],
  [/\badecco\b/, 'adecco.fr'],
  [/\bcrit\b/, 'crit-job.com'],
  [/\bsynergie\b/, 'synergie.fr'],
  [/\bpartnaire\b/, 'partnaire.fr'],
  [/\bstart people\b/, 'startpeople.fr'],
  [/\bgroupe actual\b/, 'groupeactual.eu'],
  [/\badequat\b/, 'adequat.fr'],
  [/\bproman\b/, 'proman-emploi.fr'],
  [/\bsamsic\b/, 'samsic-emploi.fr'],
  [/\bexpectra\b/, 'expectra.fr'],
  [/\bmichael page\b/, 'michaelpage.fr'],
  [/\blhh\b/, 'lhh.com'],
  [/\bstaffmatch\b/, 'staffmatch.com'],
  [/\bmistertemp\b/, 'mistertemp.com'],
  [/\biziwork\b/, 'iziwork.com'],
  [/\bside\b$/, 'side.co'],
  [/\btemporis\b/, 'temporis-franchise.fr'],
  [/\bhosco\b/, 'hosco.com'],
  [/\bderichebourg\b/, 'derichebourg.com'],
  [/\bsupplay\b/, 'supplay.fr'],
  [/\bfed group\b/, 'fed-group.com'],
  // Grande distribution et alimentaire
  [/\bmonoprix\b/, 'monoprix.fr'],
  [/leclerc\b/, 'e.leclerc'],
  [/\bintermarche\b/, 'intermarche.com'],
  [/\bmousquetaires\b/, 'mousquetaires.com'],
  [/\bbricomarche\b/, 'bricomarche.com'],
  [/\bcarrefour\b/, 'carrefour.fr'],
  [/\bauchan\b/, 'auchan.fr'],
  [/\bu les commercants\b|\bmagasins u\b|\bsuper u\b|\bhyper u\b/, 'magasins-u.com'],
  [/\baldi\b/, 'aldi.fr'],
  [/\blidl\b/, 'lidl.fr'],
  [/\bfranprix\b/, 'franprix.fr'],
  [/\bmetro france\b|^metro\b/, 'metro.fr'],
  [/\bpicard\b/, 'picard.fr'],
  [/\bbio c bon\b/, 'bio-c-bon.eu'],
  [/\bservair\b/, 'servair.fr'],
  [/\bsodexo\b/, 'sodexo.com'],
  [/\belior\b/, 'elior.com'],
  [/\bareas\b/, 'areas.com'],
  [/\bstarbucks\b/, 'starbucks.fr'],
  [/\bbuffalo grill\b/, 'buffalo-grill.fr'],
  [/^paul$/, 'paul.fr'],
  [/\bdalloyau\b/, 'dalloyau.fr'],
  [/\bangelina\b/, 'angelina-paris.fr'],
  [/\bpotel et chabot\b/, 'potel-et-chabot.com'],
  [/\bpalais des thes\b/, 'palaisdesthes.com'],
  [/\bsavencia\b/, 'savencia.com'],
  [/\bgrands moulins de paris\b/, 'gmp.fr'],
  // Mode, beauté, maison, loisirs
  [/\bsmcp\b/, 'smcp.com'],
  [/\bcelio\b/, 'celio.com'],
  [/\bmaje\b/, 'maje.com'],
  [/\bmango\b/, 'mango.com'],
  [/\bh ?& ?m\b|\bh and m\b/, 'hm.com'],
  [/\bprimark\b/, 'primark.com'],
  [/\bjonak\b/, 'jonak.fr'],
  [/\barmand thiery\b/, 'armandthiery.fr'],
  [/\bsephora\b/, 'sephora.com'],
  [/\bprintemps\b/, 'printemps.com'],
  [/\bgaleries lafayette\b/, 'galerieslafayette.com'],
  [/\bloccitane\b/, 'loccitane.com'],
  [/\baroma ?zone\b/, 'aroma-zone.com'],
  [/\badopt\b/, 'adopt.com'],
  [/\bsunglass hut\b/, 'sunglasshut.com'],
  [/\beric bompard\b/, 'eric-bompard.com'],
  [/\bmonceau fleurs\b/, 'monceaufleurs.com'],
  [/\bokaidi\b/, 'okaidi.fr'],
  [/\bjacadi\b/, 'jacadi.fr'],
  [/\bcyrillus\b/, 'cyrillus.fr'],
  [/\bvilebrequin\b/, 'vilebrequin.com'],
  [/\bsezane\b/, 'sezane.com'],
  [/\bsaint james\b/, 'saint-james.com'],
  [/\bcaroll\b/, 'caroll.com'],
  [/\bkiabi\b/, 'kiabi.com'],
  [/\bc ?& ?a\b/, 'c-and-a.com'],
  [/\bmichael kors\b/, 'michaelkors.fr'],
  [/\bnyx\b/, 'nyxcosmetics.fr'],
  [/\bkiko\b/, 'kikocosmetics.com'],
  [/\bpandora\b/, 'pandora.net'],
  [/\blovisa\b/, 'lovisa.com'],
  [/\bfaguo\b/, 'faguo-store.com'],
  [/\badidas\b/, 'adidas.fr'],
  [/\bnike\b/, 'nike.com'],
  [/\bhermes\b/, 'hermes.com'],
  [/\bdecathlon\b/, 'decathlon.fr'],
  [/\bintersport\b/, 'intersport.fr'],
  [/\bfnac\b/, 'fnac.com'],
  [/\bdarty\b/, 'darty.com'],
  [/\bboulanger\b/, 'boulanger.com'],
  [/^but$/, 'but.fr'],
  [/\bcultura\b/, 'cultura.com'],
  [/\bking jouet\b/, 'king-jouet.com'],
  [/\bleroy merlin\b/, 'leroymerlin.fr'],
  [/\btruffaut\b/, 'truffaut.com'],
  [/\bkave home\b/, 'kavehome.com'],
  [/\bla foir ?fouille\b/, 'lafoirfouille.fr'],
  [/\bcash converters\b/, 'cashconverters.fr'],
  [/\bmaxi ?zoo\b/, 'maxizoo.fr'],
  [/\banimalis\b/, 'animalis.com'],
  [/\bnespresso\b/, 'nespresso.com'],
  [/\bsaint ?gobain\b/, 'saint-gobain.com'],
  [/\bhowdens\b/, 'howdens.com'],
  // Logistique, transport, autres
  [/\bfedex\b|\bfederal express\b/, 'fedex.com'],
  [/\bdpd\b/, 'dpd.fr'],
  [/\bvinci\b/, 'vinci.com'],
  [/\bpartouche\b/, 'partouche.com'],
  [/\bsoho house\b/, 'sohohouse.com'],
  [/\bgroupe sos\b/, 'groupe-sos.org'],
  [/\bramsay\b/, 'ramsaysante.fr'],
];

function companyKey(company) {
  return String(company || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();
}

function companyDomain(company) {
  const key = companyKey(company);
  if (!key) return '';
  const hit = COMPANY_DOMAINS.find(([re]) => re.test(key));
  return hit ? hit[1] : '';
}

/* Plusieurs services d'icônes, de qualité très variable selon le site : on les
 * interroge tous et on garde l'image la plus grande. Le résultat est mémorisé
 * sur l'appareil pour ne pas refaire la recherche à chaque ouverture. */
const LOGO_SOURCES = [
  d => 'https://icon.horse/icon/' + d,
  d => 'https://unavatar.io/' + d + '?fallback=false',
  d => 'https://www.google.com/s2/favicons?sz=128&domain=' + d,
  d => 'https://icons.duckduckgo.com/ip3/' + d + '.ico',
];
const LOGO_CACHE_KEY = 'zcrt_logos_v1';
const LOGO_TTL = { found: 14 * 864e5, missing: 3 * 864e5 };
const LOGO_MIN_WIDTH = 30;   // en dessous : icône par défaut ou trop floue
const LOGO_HD_WIDTH = 96;    // au-dessus : assez nette pour remplir la vignette

let logoCache = {};
try { logoCache = JSON.parse(localStorage.getItem(LOGO_CACHE_KEY) || '{}'); } catch { logoCache = {}; }
const logoPending = {};

function logoCached(domain) {
  const hit = logoCache[domain];
  if (!hit || Date.now() - hit.t > (hit.src ? LOGO_TTL.found : LOGO_TTL.missing)) return undefined;
  return hit;
}

function probeLogo(url) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve({ src: url, w: 0 }), 8000);
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { clearTimeout(timer); resolve({ src: url, w: img.naturalWidth }); };
    img.onerror = () => { clearTimeout(timer); resolve({ src: url, w: 0 }); };
    img.src = url;
  });
}

function resolveLogo(domain) {
  const cached = logoCached(domain);
  if (cached) return Promise.resolve(cached);
  if (!logoPending[domain]) {
    const d = encodeURIComponent(domain);
    logoPending[domain] = Promise.all(LOGO_SOURCES.map(src => probeLogo(src(d)))).then(results => {
      const best = results.reduce((a, b) => (b.w > a.w ? b : a));
      const entry = best.w >= LOGO_MIN_WIDTH ? { src: best.src, w: best.w, t: Date.now() } : { src: '', w: 0, t: Date.now() };
      logoCache[domain] = entry;
      try { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(logoCache)); } catch {}
      delete logoPending[domain];
      return entry;
    });
  }
  return logoPending[domain];
}

function logoImgHtml(entry) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<img src="${esc(entry.src)}" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('has-logo','logo-sd');this.remove()">`;
}

function logoClasses(entry) {
  return entry && entry.src ? ' has-logo' + (entry.w < LOGO_HD_WIDTH ? ' logo-sd' : '') : '';
}

function applyLogo(el, entry) {
  if (!entry.src || !el.isConnected || el.querySelector('img')) return;
  el.insertAdjacentHTML('beforeend', logoImgHtml(entry));
  el.className += logoClasses(entry);
}

/* Recherche des logos manquants, quatre entreprises à la fois (une seule fois par
 * entreprise grâce au cache) ; chaque carte reçoit son logo dès qu'il est trouvé. */
const logoQueue = [];
let logoActive = 0;

function pumpLogos() {
  while (logoActive < 4 && logoQueue.length) {
    const domain = logoQueue.shift();
    logoActive++;
    resolveLogo(domain).then(entry => {
      document.querySelectorAll('.job-logo[data-domain="' + domain + '"]').forEach(el => applyLogo(el, entry));
    }).finally(() => { logoActive--; pumpLogos(); });
  }
}

function watchLogos() {
  document.querySelectorAll('.job-logo[data-domain]:not([data-watched])').forEach(el => {
    el.dataset.watched = '1';
    if (el.querySelector('img')) return;
    const domain = el.dataset.domain;
    const cached = logoCached(domain);
    if (cached) applyLogo(el, cached);
    else if (!logoQueue.includes(domain) && !logoPending[domain]) logoQueue.push(domain);
  });
  pumpLogos();
}

let logoScan = 0;
new MutationObserver(() => { clearTimeout(logoScan); logoScan = setTimeout(watchLogos, 30); })
  .observe(document.documentElement, { childList: true, subtree: true });
