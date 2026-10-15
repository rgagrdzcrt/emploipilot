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
