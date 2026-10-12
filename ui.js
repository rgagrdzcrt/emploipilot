/* ZCRT — aides d'affichage uniquement : badges, icônes, filtres actifs, compteurs
   et vue Kanban des candidatures. Aucune donnée n'est modifiée ici, hormis les
   changements de statut demandés par l'utilisateur (via setStatus existant). */

const UI_STATUS = {
  'À examiner': { key: 'examiner', icon: 'dot' },
  'À postuler': { key: 'postuler', icon: 'bookmark' },
  'Candidature envoyée': { key: 'envoyee', icon: 'send' },
  'Entretien': { key: 'entretien', icon: 'calendar' },
  'À relancer': { key: 'relancer', icon: 'bell' },
  'Refus': { key: 'refus', icon: 'xcircle' },
  'Ignorée': { key: 'ignoree', icon: 'eyeoff' },
};
const UI_ALL_STATUSES = ['À examiner', 'À postuler', 'Candidature envoyée', 'Entretien', 'À relancer', 'Refus', 'Ignorée'];
const UI_APP_COLUMNS = ['À relancer', 'Candidature envoyée', 'Entretien', 'Refus'];

function uiEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ic(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function uiStatus(status) {
  const s = status || 'À examiner';
  const meta = UI_STATUS[s] || UI_STATUS['À examiner'];
  return `<span class="status s-${meta.key}">${ic(meta.icon)}${uiEsc(s)}</span>`;
}

function uiContract(contract) {
  const c = contract || 'À vérifier';
  const key = /cdi/i.test(c) ? 'cdi' : /cdd/i.test(c) ? 'cdd' : /int[eé]rim/i.test(c) ? 'interim' : 'verifier';
  return `<span class="contract c-${key}">${uiEsc(c)}</span>`;
}

function uiInitials(company) {
  const name = String(company || '').trim();
  if (!name || /^entreprise à vérifier/i.test(name)) return { text: '?', hue: 220 };
  const words = name.replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(Boolean);
  const text = ((words[0] || '?')[0] + (words[1] ? words[1][0] : (words[0][1] || ''))).toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { text, hue: hash % 360 };
}

function uiLogo(company) {
  const { text, hue } = uiInitials(company);
  return `<div class="job-logo" style="--h:${hue}" aria-hidden="true">${uiEsc(text)}</div>`;
}

function uiDays(o) {
  const d = typeof parseDate === 'function' ? parseDate(typeof offerDate === 'function' ? offerDate(o) : o.date) : null;
  return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5)) : null;
}

function uiAge(o) {
  const days = uiDays(o);
  if (days === null) return 'Date à vérifier';
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return 'Il y a ' + days + ' j';
}

function uiTravel(o) {
  const label = typeof travelLabel === 'function' ? travelLabel(o) : '';
  return String(label || '').replace(/^[^\p{L}\p{N}≈~]+/u, '').trim();
}

function uiIsNew(o) {
  const days = uiDays(o);
  return days !== null && days <= 2 && (o.status || 'À examiner') === 'À examiner';
}

function uiDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? uiEsc(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function uiStatusSelect(o, extraClass) {
  const st = o.status || 'À examiner';
  return `<select class="status-select${extraClass ? ' ' + extraClass : ''}" aria-label="Changer le statut" onchange="setStatus('${o.id}',this.value)">${UI_ALL_STATUSES.map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}

function uiEmpty(title, text, action) {
  return `<div class="empty">${ic('inbox', 'empty-ic')}<strong>${title}</strong><span>${text}</span>${action || ''}</div>`;
}

/* ---------- Filtres : panneau repliable (mobile) et filtres actifs ---------- */

const UI_FILTERS = [['zone', 'Zone'], ['freshness', 'Publication'], ['contract', 'Contrat'], ['status', 'Statut']];

function uiRefreshFilters() {
  const box = document.getElementById('activeFilters');
  if (!box) return;
  const chips = [];
  const q = document.getElementById('q');
  if (q && q.value.trim()) chips.push(`<button class="filter-chip" data-clear="q">« ${uiEsc(q.value.trim())} »${ic('x')}</button>`);
  UI_FILTERS.forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el && el.value !== 'all') {
      const text = el.options[el.selectedIndex]?.text || el.value;
      chips.push(`<button class="filter-chip" data-clear="${id}"><span class="muted">${label} :</span> ${uiEsc(text)}${ic('x')}</button>`);
    }
  });
  box.innerHTML = chips.length ? chips.join('') + '<button class="filter-chip clear-all" data-clear="all">Tout effacer</button>' : '';
  box.hidden = !chips.length;
  const count = document.getElementById('filtersCount');
  const n = UI_FILTERS.filter(([id]) => document.getElementById(id)?.value !== 'all').length;
  if (count) { count.textContent = n || ''; count.hidden = !n; }
}

function uiClearFilter(id) {
  const ids = id === 'all' ? ['q', ...UI_FILTERS.map(f => f[0])] : [id];
  ids.forEach(x => {
    const el = document.getElementById(x);
    if (!el) return;
    el.value = x === 'q' ? '' : 'all';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  uiRefreshFilters();
}

/* ---------- Compteurs (onglets métiers, menu) ---------- */

function uiRefreshCounts() {
  if (typeof offers === 'undefined') return;
  const visible = o => !(typeof isExcluded === 'function' && isExcluded(o)) && o.status !== 'Ignorée';
  document.querySelectorAll('[data-count]').forEach(el => {
    const cat = el.dataset.count;
    el.textContent = offers.filter(o => visible(o) && categoryOf(o) === cat).length;
  });
  const apps = offers.filter(o => UI_APP_COLUMNS.includes(o.status)).length;
  document.querySelectorAll('[data-nav-count="applications"]').forEach(el => { el.textContent = apps || ''; el.hidden = !apps; });
}

/* ---------- Candidatures : tableau / Kanban, filtre par statut ---------- */

let uiAppsFilter = 'all';
function uiAppsView() {
  try { return localStorage.getItem('zcrt_apps_view') || 'table'; } catch (e) { return 'table'; }
}

function uiAppsList() {
  if (typeof offers === 'undefined') return [];
  return offers.filter(o => !['À examiner', 'À postuler', 'Ignorée'].includes(o.status || 'À examiner'));
}

function uiRenderApps() {
  const list = uiAppsList();
  const view = uiAppsView();
  document.querySelectorAll('[data-apps-view]').forEach(b => b.classList.toggle('active', b.dataset.appsView === view));
  const table = document.getElementById('appsTable');
  const board = document.getElementById('appsKanban');
  if (!table || !board) return;
  table.hidden = view !== 'table';
  board.hidden = view !== 'kanban';

  // Pastilles de filtre par statut, avec leur nombre.
  const bar = document.getElementById('appsFilters');
  if (bar) {
    const count = s => list.filter(o => o.status === s).length;
    const present = UI_APP_COLUMNS.filter(s => count(s));
    if (uiAppsFilter !== 'all' && !present.includes(uiAppsFilter)) uiAppsFilter = 'all';
    bar.innerHTML = `<button class="seg${uiAppsFilter === 'all' ? ' active' : ''}" data-apps-filter="all">Toutes <b>${list.length}</b></button>` +
      present.map(s => `<button class="seg${uiAppsFilter === s ? ' active' : ''}" data-apps-filter="${uiEsc(s)}">${ic(UI_STATUS[s].icon)}${uiEsc(s)} <b>${count(s)}</b></button>`).join('');
  }

  document.querySelectorAll('#applicationRows tr[data-status]').forEach(tr => {
    tr.hidden = uiAppsFilter !== 'all' && tr.dataset.status !== uiAppsFilter;
  });

  if (view === 'kanban') {
    const cols = uiAppsFilter === 'all' ? UI_APP_COLUMNS : [uiAppsFilter];
    board.innerHTML = cols.map(s => {
      const items = list.filter(o => o.status === s)
        .sort((a, b) => String(b.appliedDate || '').localeCompare(String(a.appliedDate || '')));
      return `<div class="kcol s-${UI_STATUS[s].key}"><div class="kcol-head">${uiStatus(s)}<span class="kcount">${items.length}</span></div>
        <div class="kcol-body">${items.length ? items.map(o => `<article class="kcard">
          <div class="kcard-top">${uiLogo(o.company)}<div><h4>${uiEsc(o.title)}</h4><div class="muted small">${uiEsc(o.company)}</div></div></div>
          <div class="kcard-meta">${ic('pin')}${uiEsc(o.location || 'Lieu non précisé')}</div>
          <div class="kcard-meta">${ic('calendar')}Candidature : ${uiDay(o.appliedDate)}</div>
          <div class="kcard-actions">${uiStatusSelect(o, 'compact')}<button class="secondary small-btn" onclick="prep('${o.id}')">Préparer</button>${o.url ? `<a class="icon-link" href="${uiEsc(o.url)}" target="_blank" rel="noopener" title="Ouvrir l'annonce" aria-label="Ouvrir l'annonce">${ic('external')}</a>` : ''}</div>
        </article>`).join('') : '<div class="kempty">Aucune candidature</div>'}</div></div>`;
    }).join('');
  }
}

/* ---------- Initialisation ---------- */

function uiInit() {
  // Panneau de filtres repliable sur mobile.
  const toggle = document.getElementById('filtersToggle');
  const panel = document.getElementById('searchPanel');
  if (toggle && panel) toggle.onclick = () => {
    const open = panel.classList.toggle('filters-open');
    toggle.setAttribute('aria-expanded', open);
  };
  document.getElementById('activeFilters')?.addEventListener('click', e => {
    const b = e.target.closest('[data-clear]');
    if (b) uiClearFilter(b.dataset.clear);
  });
  ['q', ...UI_FILTERS.map(f => f[0])].forEach(id => document.getElementById(id)?.addEventListener('input', uiRefreshFilters));
  document.getElementById('resetFilters')?.addEventListener('click', () => setTimeout(uiRefreshFilters));

  // Vue des candidatures.
  document.querySelectorAll('[data-apps-view]').forEach(b => b.onclick = () => {
    try { localStorage.setItem('zcrt_apps_view', b.dataset.appsView); } catch (e) {}
    uiRenderApps();
  });
  document.getElementById('appsFilters')?.addEventListener('click', e => {
    const b = e.target.closest('[data-apps-filter]');
    if (b) { uiAppsFilter = b.dataset.appsFilter; uiRenderApps(); }
  });

  // Chaque nouveau rendu des listes met à jour compteurs, pastilles et Kanban.
  const jobs = document.getElementById('jobs');
  const rows = document.getElementById('applicationRows');
  const after = () => { uiRefreshCounts(); uiRenderApps(); };
  if (jobs) new MutationObserver(after).observe(jobs, { childList: true });
  if (rows) new MutationObserver(after).observe(rows, { childList: true });

  // Changement de page : retour en haut (utile sur mobile).
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));

  uiRefreshFilters();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', uiInit);
else uiInit();
