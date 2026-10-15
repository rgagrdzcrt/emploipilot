/* ZCRT — profils (Ryan / Zia) sur le même site.
 *
 * Chaque profil a ses propres données sur l'appareil (offres suivies, critères,
 * modèles, synchro) grâce à un suffixe sur les clés du navigateur, ses métiers
 * et ses modèles de lettre. Le bouton à côté du logo bascule de l'un à l'autre.
 *
 * Chargé dans <head>, avant tous les autres scripts.
 */

const ZCRT_PROFILE_KEY = 'zcrt_active_profile';

/** Métiers connus du site (catégories calculées par collect.py). */
const CAT_INFO = {
  stock: { label: 'Stock & logistique', icon: 'package' },
  rayon: { label: 'Magasins & grande distribution', icon: 'cart' },
  vente: { label: 'Vente', icon: 'tag' },
  restauration: { label: 'Restauration & café', icon: 'cup' },
};

const ZCRT_PROFILES = {
  ryan: {
    id: 'ryan',
    name: 'Ryan',
    ns: '',                      // clés historiques, sans suffixe
    syncFile: 'zcrt-suivi.json', // lu aussi par mail.py (tri Gmail)
    cats: ['stock', 'rayon', 'vente'],
    mails: true,
    feminine: false,
  },
  zia: {
    id: 'zia',
    name: 'Zia',
    ns: '__zia',
    syncFile: 'zcrt-suivi-zia.json',
    cats: ['rayon', 'vente', 'restauration'],
    mails: false,
    feminine: true,
    keywords: 'Employée libre-service, hôtesse de caisse, mise en rayon, grande distribution\n'
      + 'Conseillère de vente, vendeuse prêt-à-porter, boutique\n'
      + 'Serveuse, chef de rang, runner, barista, café',
    priority: 'Paris → Bondy/93 → Île-de-France',
    hiddenTypes: ['auto', 'cariste', 'direction', 'animalerie'],
    cv: { rayon: 'CV_ZIA_CARTIER_vente.pdf', vente: 'CV_ZIA_CARTIER_vente.pdf', restauration: 'CV_ZIA_CARTIER_restauration.pdf' },
    templates: {
      rayon: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Forte de plusieurs années d'expérience en magasin et en restauration, je connais le rythme d'un point de vente à forte affluence et l'importance d'un service soigné.

Conseillère de vente chez COS à Paris 8e, je réceptionnais et traitais les livraisons, participais aux inventaires tournants et annuels et mettais en place le merchandising selon les consignes du siège. Chez H&M, j'ai assuré la présentation des articles, le réapprovisionnement de la boutique et l'encaissement. Mes expériences en restaurant m'ont appris à rester efficace et souriante dans les moments de rush.

Polyvalente, autonome et à l'aise en équipe, je m'adapte rapidement à l'organisation d'un nouveau magasin.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      vente: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Diplômée d'un BTS Commerce international, j'ai près de trois ans d'expérience comme conseillère de vente en prêt-à-porter.

Chez COS à Paris 8e, en CDI, j'ai accueilli et accompagné une clientèle française et internationale, géré les retours, échanges et commandes, fidélisé les clients réguliers et été référente d'un univers produit. J'ai également mis en place le visual merchandising et participé aux briefs d'équipe sur les objectifs. Auparavant, chez H&M, j'assurais la présentation des articles, l'encaissement et le réassort.

À l'écoute, souriante et à l'aise à l'oral, en français comme en anglais, j'aime valoriser les produits et proposer la vente additionnelle.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      restauration: `Objet : candidature au poste de {poste}

Madame, Monsieur,

Votre offre de {poste} chez {entreprise} a retenu toute mon attention. Cheffe de rang depuis plusieurs années dans des restaurants parisiens, j'aime le service en salle et le lien avec les clients.

Au Lagano, à Paris 7e, j'ai participé à l'ouverture et à la croissance du restaurant, autour d'une cuisine de saison et d'une cave de vins de niche. Au Clown Bar puis chez Pouliche, adresse semi-gastronomique d'Amandine Chaignot, j'ai approfondi mes connaissances en œnologie, notamment en vins naturels, et pris part au bar avec une carte de cocktails signature. J'ai débuté chez Del Arte, en plein été et à fort débit, où j'ai acquis les bases du service et de l'organisation.

Rigoureuse sous la pression, autonome et attentive aux besoins des clients, je parle anglais couramment.

{accroche}

Disponible {disponibilite}, je serais heureuse de rejoindre votre équipe et de vous rencontrer.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
    },
  },
};

const ACTIVE_PROFILE = (() => {
  let id = '';
  try { id = localStorage.getItem(ZCRT_PROFILE_KEY) || ''; } catch (e) { /* stockage indisponible */ }
  return ZCRT_PROFILES[id] || ZCRT_PROFILES.ryan;
})();

/** Clé du navigateur propre au profil actif. */
function nsKey(key) { return key + ACTIVE_PROFILE.ns; }

/** Accord au féminin pour le profil actif : fem('prêt', 'prête'). */
function fem(masc, femi) { return ACTIVE_PROFILE.feminine ? femi : masc; }

function otherProfile() {
  return Object.values(ZCRT_PROFILES).find(p => p.id !== ACTIVE_PROFILE.id);
}

function switchProfile() {
  try { localStorage.setItem(ZCRT_PROFILE_KEY, otherProfile().id); } catch (e) { return; }
  location.reload();
}

/** Bouton de bascule, placé à droite du logo (barre latérale et en-tête mobile). */
function profileSwitchHtml() {
  const other = otherProfile();
  return `<button class="profile-switch" type="button" onclick="switchProfile()" title="Passer au profil de ${other.name}" aria-label="Passer au profil de ${other.name}">`
    + `<span class="ps-current">${ACTIVE_PROFILE.name}</span><span class="ps-arrow" aria-hidden="true">⇄</span><span class="ps-other">${other.name}</span></button>`;
}

/* ---------- Premier lancement, installation, stockage durable ---------- */

function storedSafe(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

// Évalué dès le chargement de ce fichier, avant que le site n'enregistre quoi que ce soit.
const ZCRT_NEW_DEVICE = !storedSafe(ZCRT_PROFILE_KEY)
  && !Object.values(ZCRT_PROFILES).some(p => storedSafe('emploipilot_v1_data' + p.ns));

/** Nouvel appareil (ou appli tout juste installée) : on demande qui l'utilise. */
function askProfileIfNew() {
  if (!ZCRT_NEW_DEVICE || storedSafe(ZCRT_PROFILE_KEY)) return;
  const box = document.createElement('div');
  box.className = 'welcome';
  box.innerHTML = `<div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
    <h2 id="welcomeTitle">Qui utilise ZCRT ?</h2><p>Sur cet appareil. Tu pourras changer à tout moment avec le bouton à côté du logo.</p>
    <div class="welcome-choices">${Object.values(ZCRT_PROFILES).map(p => `<button type="button" data-profile="${p.id}">${p.name}</button>`).join('')}</div></div>`;
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-profile]');
    if (!b) return;
    try { localStorage.setItem(ZCRT_PROFILE_KEY, b.dataset.profile); } catch (err) { /* stockage indisponible */ }
    if (b.dataset.profile !== ACTIVE_PROFILE.id) location.reload();
    else box.remove();
  });
  document.body.appendChild(box);
}

/** iPhone / iPad dans Safari (pas l'appli installée) : Safari peut effacer les données
 * d'un site non ouvert depuis 7 jours, pas celles d'une appli de l'écran d'accueil. */
function showInstallHint() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone === true
    || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!ios || installed || storedSafe('zcrt_install_hint_done')) return;
  const hint = document.createElement('div');
  hint.className = 'install-hint';
  hint.innerHTML = `<span>📲 Pour ne rien perdre, installe ZCRT : touche <b>Partager</b> <span aria-hidden="true">⬆︎</span> puis <b>« Sur l'écran d'accueil »</b>, et ouvre-le ensuite depuis son icône.</span>`
    + '<button type="button" class="secondary">OK</button>';
  hint.querySelector('button').onclick = () => {
    try { localStorage.setItem('zcrt_install_hint_done', '1'); } catch (e) { /* stockage indisponible */ }
    hint.remove();
  };
  document.body.appendChild(hint);
}

document.addEventListener('DOMContentLoaded', () => {
  askProfileIfNew();
  showInstallHint();
  // Demande au navigateur de ne pas effacer les données de ZCRT pour faire de la place.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
});

/** Onglets métiers du profil actif. */
function categoryTabsHtml() {
  return ACTIVE_PROFILE.cats.map((c, i) => `<button${i === 0 ? ' class="active"' : ''} data-category="${c}" role="tab">`
    + `<span class="ct-ic"><svg class="ic" aria-hidden="true"><use href="#i-${CAT_INFO[c].icon}"/></svg></span>`
    + `<span class="ct-label">${CAT_INFO[c].label}</span><span class="ct-count" data-count="${c}"></span></button>`).join('');
}

/** Modèles de lettre et CV du profil actif (onglet Critères). */
function templateFieldsHtml() {
  return ACTIVE_PROFILE.cats.map(c => `<div class="field tpl" data-cat="${c}"><label for="tpl_${c}">${CAT_INFO[c].label}</label>`
    + `<textarea id="tpl_${c}"></textarea><label for="cv_${c}" style="margin-top:10px">CV à joindre</label>`
    + `<input id="cv_${c}" placeholder="Ex. CV_${c}.pdf"><p><button class="ghost small-btn" data-reset-tpl="${c}">Revenir au modèle d’origine</button></p></div>`).join('');
}
