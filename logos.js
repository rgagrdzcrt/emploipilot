/* ZCRT — logos des entreprises et agences.
 *
 * Les offres ne donnent que le nom de l'entreprise : on le relie à son site
 * grâce à une table des enseignes et agences connues, puis on affiche l'icône
 * du site (service d'icônes de Google). Sans correspondance, ou si l'icône
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

function companyLogoUrl(company) {
  const domain = companyDomain(company);
  return domain ? 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(domain) : '';
}

/** Icône chargée : gardée si elle est assez nette ; sinon on essaie DuckDuckGo, puis on laisse les initiales. */
function logoLoaded(img) {
  if (img.naturalWidth >= 30) { img.parentElement?.classList.add('has-logo'); return; }
  logoFailed(img);
}

function logoFailed(img) {
  const domain = img.dataset.domain;
  if (domain && !img.dataset.retried) {
    img.dataset.retried = '1';
    img.src = 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico';
  } else {
    img.remove();
  }
}
