/* ZCRT — animations de l'interface.
 *
 * Tout passe par transform et opacity (fluide, y compris sur téléphone) ; rien ne bouge
 * si l'appareil demande moins d'animations (« Réduire les animations »).
 * Chargé après ui.js : ne fait qu'ajouter des effets autour des fonctions existantes.
 */

const MOTION_OK = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- Listes en cascade (changement d'onglet, de métier, de filtre) ---------- */

const STAGGER_LISTS = ['jobs', 'queueRows', 'applicationRows', 'appsKanban', 'mailRows'];

function staggerIn(el) {
  if (!MOTION_OK || !el) return;
  el.classList.remove('stagger');
  void el.offsetWidth; // relance l'animation
  el.classList.add('stagger');
  clearTimeout(el._staggerTimer);
  el._staggerTimer = setTimeout(() => el.classList.remove('stagger'), 900);
}

function staggerVisibleLists() {
  STAGGER_LISTS.map(id => document.getElementById(id))
    .filter(el => el && el.offsetParent !== null)
    .forEach(staggerIn);
}

// Après le clic (le rendu de la liste a déjà eu lieu dans le gestionnaire de l'élément).
document.addEventListener('click', e => {
  if (e.target.closest('[data-tab], [data-category], [data-queue-cat], [data-apps-filter], [data-mail-filter], [data-apps-view]')) {
    staggerVisibleLists();
  }
});

// Première apparition des offres (chargement de offres.json).
(() => {
  const jobs = document.getElementById('jobs');
  if (!jobs) return;
  const once = new MutationObserver(() => {
    if (jobs.querySelector('.job')) { once.disconnect(); staggerIn(jobs); }
  });
  once.observe(jobs, { childList: true });
})();

/* ---------- Changement de statut depuis une liste : l'offre s'en va en douceur ---------- */

// setStatus est défini par le script principal d'index.html, chargé après ce fichier.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof setStatus !== 'function') return;
  const original = setStatus;
  window.setStatus = function (id, status) {
    // L'offre dans la liste visible (le menu de statut porte son identifiant).
    const select = [...document.querySelectorAll(`select[onchange*="'${id}'"]`)].find(el => el.offsetParent !== null);
    const item = select && select.closest('#jobs .job, #queueRows tr, #applicationRows tr, .kcard');
    // Dans « Offres repérées » et « À postuler », tout changement de statut retire l'offre de la liste.
    const leaves = item && item.closest('#jobs, #queueRows');
    if (!MOTION_OK || !leaves) {
      original(id, status);
      if (MOTION_OK && item) flashAfterRender(id);
      return;
    }
    item.style.height = item.offsetHeight + 'px';
    void item.offsetWidth;
    item.classList.add('leaving');
    setTimeout(() => original(id, status), 260);
  };

  /** Ligne mise à jour dans Candidatures / Kanban : bref surlignage après le nouveau rendu. */
  function flashAfterRender(id) {
    // Après le rendu du tableau et du Kanban (ce dernier suit par un MutationObserver).
    setTimeout(() => {
      document.querySelectorAll(`select[onchange*="'${id}'"]`).forEach(s => {
        const row = s.closest('tr, .kcard, .job');
        if (!row) return;
        row.classList.remove('flash');
        void row.offsetWidth;
        row.classList.add('flash');
      });
    }, 30);
  }
});

/* ---------- Compteurs : les nombres défilent jusqu'à leur nouvelle valeur ---------- */

(() => {
  if (!MOTION_OK) return;
  const selector = '#statOffers, #statNew, #statSent, #statExcluded, #triageCount, #queueCount, .nav-count, .ct-count';
  const last = new WeakMap();
  // Valeur réellement affichée par le site (la cible), à distinguer des nombres intermédiaires
  // écrits par l'animation : le MutationObserver voit aussi ces derniers, après coup.
  function write(el, value) {
    el.textContent = String(value);
    el._ownNode = el.firstChild; // nœud texte créé par l'animation
  }

  function animate(el, from, to) {
    const start = performance.now(), dur = Math.min(600, 250 + Math.abs(to - from) * 8);
    el._countTo = to;
    const step = now => {
      if (el._countTo !== to) return; // une valeur plus récente a pris le relais
      const t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 3);
      write(el, t < 1 ? Math.round(from + (to - from) * eased) : to);
      if (t < 1) requestAnimationFrame(step);
    };
    write(el, from);
    requestAnimationFrame(step);
  }

  const observer = new MutationObserver(records => {
    const changed = new Set();
    for (const r of records) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (el && el.matches(selector)) changed.add(el);
    }
    changed.forEach(el => {
      if (el.firstChild && el.firstChild === el._ownNode) return; // notre propre écriture
      const to = Number(el.textContent.trim());
      const from = last.get(el);
      last.set(el, to);
      el._countTo = undefined; // toute animation en cours s'arrête : le site vient d'écrire la vraie valeur
      if (Number.isFinite(from) && Number.isFinite(to) && from !== to && el.textContent.trim() !== '' && el.offsetParent !== null) {
        animate(el, from, to);
      }
    });
  });

  function watch() {
    document.querySelectorAll(selector).forEach(el => {
      if (last.has(el)) return;
      last.set(el, Number(el.textContent));
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
  watch();
  // Les pastilles des onglets métiers sont créées après coup : on surveille aussi les nouvelles,
  // au plus une fois par image pour ne pas peser sur les gros rendus de liste.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; watch(); });
  }).observe(document.body, { childList: true, subtree: true });
})();
