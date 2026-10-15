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
  // Sans date de publication : on affiche depuis quand ZCRT connaît l'annonce.
  if (!o.date) return days === 0 ? "Repérée aujourd'hui" : days === 1 ? 'Repérée hier' : 'Repérée il y a ' + days + ' j';
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

/** Dernier e-mail de l'entreprise, trouvé par le tri Gmail (mail.py). */
const UI_MAIL_KINDS = { entretien: 'Entretien', refus: 'Refus', reponse: 'Réponse', action: 'Action demandée', accuse: 'Accusé de réception' };
function uiMail(o) {
  if (!o.mailKind || !UI_MAIL_KINDS[o.mailKind]) return '';
  const title = [o.mailFrom, o.mailSubject].filter(Boolean).join(' — ');
  return `<div class="kcard-meta mail-${o.mailKind}" title="${uiEsc(title)}">${ic('inbox')}E-mail : ${UI_MAIL_KINDS[o.mailKind]}, ${uiDay(o.mailDate)}</div>`;
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
  document.querySelectorAll('[data-count]').forEach(el => {
    el.textContent = repereesOf(el.dataset.count).length;
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
          <div class="kcard-meta">${ic('calendar')}Candidature : ${uiDay(o.appliedDate)}</div>${uiMail(o)}
          <div class="kcard-actions">${uiStatusSelect(o, 'compact')}<button class="secondary small-btn" onclick="prep('${o.id}')">Préparer</button>${o.url ? `<a class="icon-link" href="${uiEsc(o.url)}" target="_blank" rel="noopener" title="Ouvrir l'annonce" aria-label="Ouvrir l'annonce">${ic('external')}</a>` : ''}</div>
        </article>`).join('') : '<div class="kempty">Aucune candidature</div>'}</div></div>`;
    }).join('');
  }
}

/* ---------- À postuler : liste des offres mises de côté ---------- */

function uiRenderQueue() {
  const rows = document.getElementById('queueRows');
  if (!rows || typeof pilotList !== 'function') return;
  const list = pilotList('queue');
  const summary = document.getElementById('queueSummary');
  const order = typeof queueSort === 'function' && queueSort() === 'date' ? 'les plus récentes en premier' : 'les mieux placées en premier';
  if (summary) summary.textContent = list.length ? list.length + ' offre(s) à postuler, ' + order + '.' : '';
  const start = document.getElementById('queueStart');
  if (start) start.disabled = !list.length;
  rows.innerHTML = list.length ? list.map(o => `<tr><td data-label="Poste"><div class="cell-job">${uiLogo(o.company)}<div><b>${uiEsc(o.title)}</b><span class="muted small">${uiEsc(o.company)}${o.location ? ' · ' + uiEsc(o.location) : ''}</span></div></div></td><td data-label="Publiée">${uiEsc(uiAge(o))}</td><td data-label="Statut">${uiStatusSelect(o, 'compact')}</td><td><div class="row-actions"><button class="secondary small-btn" onclick="prep('${o.id}')">Préparer</button>${o.url ? `<a class="icon-link" href="${uiEsc(o.url)}" target="_blank" rel="noopener" title="Ouvrir l'annonce" aria-label="Ouvrir l'annonce">${ic('external')}</a>` : ''}</div></td></tr>`).join('')
    : `<tr class="empty-row"><td colspan="4">${uiEmpty('Rien à postuler pour le moment', 'Passe une offre en « À postuler » (touche A pendant le tri) pour la retrouver ici.')}</td></tr>`;
}

/* ---------- Initialisation ---------- */

/* ---------- Mails : e-mails triés par mail.py (lus dans le gist de synchro) ---------- */

const UI_MAIL_LABELS = {
  entretien: { name: 'Entretien', icon: 'calendar' },
  action: { name: 'À faire', icon: 'zap' },
  reponse: { name: 'Réponse', icon: 'send' },
  refus: { name: 'Refus', icon: 'xcircle' },
  verifier: { name: 'À vérifier', icon: 'eyeoff' },
  accuse: { name: 'Accusé', icon: 'check' },
};
let uiMailFilter = 'all';

function uiMailData() {
  try { return JSON.parse(localStorage.getItem(MAIL_CACHE) || '{}') || {}; } catch (e) { return {}; }
}

function uiRenderMails() {
  const rows = document.getElementById('mailRows');
  if (!rows) return;
  const data = uiMailData();
  const all = (Array.isArray(data.mails) ? data.mails : []).filter(m => UI_MAIL_LABELS[m.label]);

  // Pastille du menu : entretiens et démarches des 14 derniers jours.
  const recent = Date.now() - 14 * 864e5;
  const urgent = all.filter(m => (m.label === 'entretien' || m.label === 'action') && m.at >= recent).length;
  document.querySelectorAll('[data-nav-count="mails"]').forEach(el => { el.textContent = urgent || ''; el.hidden = !urgent; });

  const present = Object.keys(UI_MAIL_LABELS).filter(k => all.some(m => m.label === k));
  if (uiMailFilter !== 'all' && !present.includes(uiMailFilter)) uiMailFilter = 'all';
  const bar = document.getElementById('mailFilters');
  if (bar) bar.innerHTML = all.length ? `<button class="seg${uiMailFilter === 'all' ? ' active' : ''}" data-mail-filter="all">Tous <b>${all.length}</b></button>` +
    present.map(k => `<button class="seg${uiMailFilter === k ? ' active' : ''}" data-mail-filter="${k}">${ic(UI_MAIL_LABELS[k].icon)}${UI_MAIL_LABELS[k].name} <b>${all.filter(m => m.label === k).length}</b></button>`).join('') : '';

  const summary = document.getElementById('mailSummary');
  if (summary) summary.textContent = data.lastRun ? 'Dernier tri : ' + new Date(data.lastRun).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const list = all.filter(m => uiMailFilter === 'all' || m.label === uiMailFilter);
  const gmail = id => data.account
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(data.account)}#all/${encodeURIComponent(id)}`
    : `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
  rows.innerHTML = list.length ? list.map(m => {
    const l = UI_MAIL_LABELS[m.label];
    const linked = m.company ? ' · ' + uiEsc(m.company) + (m.title ? ' — ' + uiEsc(m.title) : '') : '';
    return `<tr><td data-label="Mail"><div class="cell-job">${uiLogo(m.company || m.from)}<div><b>${uiEsc(m.subject || '(sans objet)')}</b><span class="muted small">${uiEsc(m.from || '')}${linked}</span></div></div></td><td data-label="Type"><span class="mail-tag mail-${m.label}">${ic(l.icon)}${l.name}</span></td><td data-label="Reçu">${uiDay(m.date)}</td><td><div class="row-actions"><a class="icon-link" href="${uiEsc(gmail(m.id))}" target="_blank" rel="noopener" title="Ouvrir dans Gmail" aria-label="Ouvrir dans Gmail">${ic('external')}</a></div></td></tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="4">${uiEmpty('Aucun mail pour le moment', 'Les mails triés par le robot Gmail apparaissent ici après la synchronisation (onglet Synchro).')}</td></tr>`;
}

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
  const queueSortSelect = document.getElementById('queueSort');
  if (queueSortSelect && typeof queueSort === 'function') {
    queueSortSelect.value = queueSort();
    queueSortSelect.addEventListener('change', () => { store('zcrt_queue_sort', queueSortSelect.value); uiRenderQueue(); });
  }

  document.getElementById('mailFilters')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mail-filter]');
    if (b) { uiMailFilter = b.dataset.mailFilter; uiRenderMails(); }
  });
  uiRenderMails();

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
