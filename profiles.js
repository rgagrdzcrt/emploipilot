/* ZCRT — profils (Ryan / Zia) sur le même site.
 *
 * Chaque profil a ses propres données sur l'appareil (offres suivies, critères,
 * modèles, synchro) grâce à un suffixe sur les clés du navigateur, ses métiers
 * et ses modèles de lettre. Toucher le logo (RGRD pour Ryan, ZCRT pour Zia)
 * bascule de l'un à l'autre.
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
    brand: 'RGRD',               // logo affiché sur ce profil
    cv: { stock: 'CV_Ryan_Gazard_stock.pdf', rayon: 'CV_Ryan_Gazard_rayon.pdf', vente: 'CV_Ryan_Gazard_vente.pdf' },
    ns: '',                      // clés historiques, sans suffixe
    syncFile: 'zcrt-suivi.json', // lu aussi par mail.py (tri Gmail)
    cats: ['stock', 'rayon', 'vente'],
    mails: true,
    feminine: false,
    // Adéquation offre / CV (pilot.js, cvFit) : d'après cv/cv_stock.html, cv_rayon.html, cv_vente.html.
    fit: {
      languages: ['anglais', 'espagnol'],
      degree: 3,          // Bachelor (bac + 3)
      permis: true,
      caces: false,
      management: true,   // chef de rayon, responsable logistique (équipe de 6)
      cats: {
        stock: {
          years: 4,
          titles: ['magasinier', 'gestionnaire de stock', 'gestionnaire des stocks', 'stockiste', 'preparateur de commandes',
            'agent logistique', 'agent de logistique', 'coordinateur logistique', 'responsable logistique', 'receptionnaire',
            'approvisionneur', 'logisticien', 'employe logistique', 'assistant logistique'],
          skills: ['reception', 'controle', 'inventaire', 'gestion des stocks', 'stock', 'preparation', 'expedition', 'commande',
            'fournisseur', 'approvisionnement', 'wms', 'gold', 'excel', 'reserve', 'encadrement', 'hygiene', 'securite',
            'logistique', 'reassort', 'ecart', 'livraison', 'quai', 'emballage', 'colis'],
          brands: ['darty'],
        },
        rayon: {
          years: 3,
          titles: ['employe libre service', 'employe de rayon', 'employe commercial', 'mise en rayon', 'chef de rayon',
            'referent rayon', 'rayonniste', 'rayoniste', 'employe polyvalent', 'reassortisseur', 'employe de magasin'],
          skills: ['mise en rayon', 'reassort', 'rotation', 'fraicheur', 'fruits et legumes', 'epicerie', 'stock', 'commande',
            'reception', 'plv', 'etiquetage', 'accueil', 'conseil', 'hygiene', 'frais', 'casse', 'facing', 'balisage',
            'merchandising', 'grande distribution', 'supermarche', 'hypermarche'],
          brands: ['monoprix', 'leclerc'],
        },
        vente: {
          years: 3,
          titles: ['conseiller de vente', 'conseillere de vente', 'vendeur', 'vendeuse', 'conseiller client', 'sales advisor',
            'sales associate', 'conseiller commercial', 'conseiller vendeur'],
          skills: ['accueil', 'conseil', 'besoin', 'vente additionnelle', 'service', 'objectif', 'merchandising', 'encaissement',
            'caisse', 'reassort', 'multimedia', 'telephonie', 'informatique', 'electromenager', 'mode', 'pret a porter',
            'cabine', 'clientele internationale', 'fidelisation', 'vitrine', 'collection'],
          brands: ['darty', 'cos'],
        },
      },
    },
  },
  zia: {
    id: 'zia',
    name: 'Zia',
    // Profil mis en pause (Zia a trouvé un travail) : masqué, ses données restent intactes.
    // Pour le réactiver : disabled: false.
    disabled: true,
    brand: 'ZCRT',
    ns: '__zia',
    syncFile: 'zcrt-suivi-zia.json',
    cats: ['rayon', 'vente', 'restauration'],
    triageLast: ['rayon'],       // tri au doigt : grande distribution en dernier, pour l'instant
    mails: false,
    feminine: true,
    keywords: 'Employée libre-service, hôtesse de caisse, mise en rayon, grande distribution\n'
      + 'Conseillère de vente, vendeuse prêt-à-porter, boutique\n'
      + 'Serveuse, chef de rang, runner, barista, café',
    priority: 'Paris → Bondy/93 → Île-de-France',
    hiddenTypes: ['auto', 'cariste', 'direction', 'animalerie'],
    // Adéquation offre / CV : d'après ses CV vente (COS, H&M) et restauration (chef de rang).
    fit: {
      languages: ['anglais'],   // espagnol scolaire : pas compté
      degree: 3,                // licence
      permis: null,             // non précisé sur ses CV : jamais pénalisé
      caces: false,
      management: false,
      cats: {
        rayon: {
          years: 3,
          titles: ['employee libre service', 'employe libre service', 'hotesse de caisse', 'hote de caisse', 'caissiere',
            'employee de rayon', 'employe de rayon', 'mise en rayon', 'equipiere', 'employee polyvalente', 'employe polyvalent',
            'employee commerciale', 'employe commercial'],
          skills: ['reassort', 'mise en rayon', 'reception', 'livraison', 'inventaire', 'encaissement', 'caisse', 'merchandising',
            'accueil', 'presentation', 'stock', 'client', 'etiquetage', 'facing', 'reapprovisionnement'],
          brands: ['h m', 'cos'],
        },
        vente: {
          years: 3,
          titles: ['conseillere de vente', 'conseiller de vente', 'vendeuse', 'vendeur', 'sales advisor', 'sales associate',
            'conseillere clientele', 'conseiller client', 'styliste conseil', 'conseillere mode', 'caissiere', 'caissier',
            'hotesse de caisse', 'vendeuse caissiere'],
          skills: ['accueil', 'accompagnement', 'conseil', 'retour', 'echange', 'commande', 'reclamation', 'visual merchandising',
            'merchandising', 'reception', 'livraison', 'inventaire', 'encaissement', 'caisse', 'reassort', 'fidelisation',
            'vente additionnelle', 'objectif', 'pret a porter', 'mode', 'textile', 'collection', 'clientele internationale'],
          brands: ['cos', 'h m'],
        },
        restauration: {
          years: 4,
          titles: ['chef de rang', 'cheffe de rang', 'serveuse', 'serveur', 'runner', 'commis de salle', 'barista', 'barmaid',
            'barman', 'maitre d hotel', 'hotesse d accueil', 'equipiere de salle', 'employee de salle'],
          skills: ['service en salle', 'salle', 'accueil', 'prise de commande', 'commande', 'vin', 'oenologie', 'sommellerie',
            'cocktail', 'bar', 'cave', 'encaissement', 'fort debit', 'gastronomique', 'bistronomie', 'brasserie', 'bistrot',
            'restaurant', 'carte', 'dressage', 'mise en place', 'cafe'],
          brands: ['lagano', 'clown bar', 'pouliche', 'del arte'],
        },
      },
    },
    cv: { rayon: 'CV_ZIA_CARTIER_vente.pdf', vente: 'CV_ZIA_CARTIER_vente.pdf', restauration: 'CV_ZIA_CARTIER_restauration.pdf' },
    templates: {
      rayon: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Forte de plusieurs années d'expérience en magasin et en restauration, je connais le rythme d'un point de vente à forte affluence et l'importance d'un service soigné.

Conseillère de vente chez COS à Paris 8e, je réceptionnais et traitais les livraisons, participais aux inventaires tournants et annuels et mettais en place le merchandising selon les consignes du siège. Chez H&M, j'ai assuré la présentation des articles, le réapprovisionnement de la boutique et l'encaissement. Mes expériences en restaurant m'ont appris à rester efficace et souriante dans les moments de rush.

Polyvalente, autonome et à l'aise en équipe, je m'adapte rapidement à l'organisation d'un nouveau magasin.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      vente: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Diplômée d'un BTS Commerce international, j'ai près de trois ans d'expérience comme conseillère de vente en prêt-à-porter.

Chez COS à Paris 8e, en CDI, j'ai accueilli et accompagné une clientèle française et internationale, géré les retours, échanges et commandes, fidélisé les clients réguliers et été référente d'un univers produit. J'ai également mis en place le visual merchandising et participé aux briefs d'équipe sur les objectifs. Auparavant, chez H&M, j'assurais la présentation des articles, l'encaissement et le réassort.

À l'écoute, souriante et à l'aise à l'oral, en français comme en anglais, j'aime valoriser les produits et proposer la vente additionnelle.

{accroche}

Disponible {disponibilite}, je serais heureuse de vous rencontrer pour vous présenter ma motivation.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

{prenom} {nom}
{telephone} — {email}`,
      restauration: `Madame, Monsieur,

Votre offre de {poste} a retenu toute mon attention. Cheffe de rang depuis plusieurs années dans des restaurants parisiens, j'aime le service en salle et le lien avec les clients.

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
  const p = ZCRT_PROFILES[id];
  return p && !p.disabled ? p : ZCRT_PROFILES.ryan;
})();
document.title = ACTIVE_PROFILE.brand + ' — Recherche d’emploi';

/** Clé du navigateur propre au profil actif. */
function nsKey(key) { return key + ACTIVE_PROFILE.ns; }

/** Accord au féminin pour le profil actif : fem('prêt', 'prête'). */
function fem(masc, femi) { return ACTIVE_PROFILE.feminine ? femi : masc; }

function otherProfile() {
  return Object.values(ZCRT_PROFILES).find(p => p.id !== ACTIVE_PROFILE.id && !p.disabled);
}

function switchProfile() {
  try { localStorage.setItem(ZCRT_PROFILE_KEY, otherProfile().id); } catch (e) { return; }
  location.reload();
}

/** Logo du profil actif ; le toucher bascule vers l'autre profil (barre latérale et en-tête mobile). */
function brandHtml() {
  const other = otherProfile(), b = ACTIVE_PROFILE.brand;
  // Un seul profil actif : simple logo, sans bascule.
  if (!other) {
    return `<span class="brand-btn" role="img" aria-label="${b}"><span class="brand-mark" aria-hidden="true">${b.charAt(0)}</span>`
      + `<span class="brand-name" aria-hidden="true">${b}<i>.</i></span></span>`;
  }
  return `<button class="brand-btn" type="button" onclick="switchProfile()" title="Passer au profil de ${other.name}" aria-label="${b} — passer au profil de ${other.name}">`
    + `<span class="brand-mark" aria-hidden="true">${b.charAt(0)}</span><span class="brand-name" aria-hidden="true">${b}<i>.</i></span></button>`;
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
  if (!ZCRT_NEW_DEVICE || storedSafe(ZCRT_PROFILE_KEY) || !otherProfile()) return;
  const box = document.createElement('div');
  box.className = 'welcome';
  box.innerHTML = `<div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
    <h2 id="welcomeTitle">Qui utilise ZCRT ?</h2><p>Sur cet appareil. Tu pourras changer à tout moment en touchant le logo.</p>
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
