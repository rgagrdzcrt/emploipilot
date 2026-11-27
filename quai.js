/* RGRD · habillage « Quai » — gabarits et comportements propres au profil de Ryan.
 *
 * Actif seulement si QUAI (profiles.js, design: 'quai') : ZCRT n'est pas concerné.
 * Chargé avant app.js : app.js, ui.js et pilot.js appellent les gabarits ci-dessous
 * (carte d'offre en étiquette, sections ★ cœur / bonnes pistes / repli, fenêtre de tri,
 * file de candidature en trois étapes). Le reste se branche au chargement de la page :
 * onglets Accueil et Plus sur téléphone, barre latérale en groupes sur ordinateur,
 * bloc « À surveiller », thème Auto / Clair / Sombre. Styles : quai.css.
 */

/* ---------- Gabarits appelés par app.js, ui.js et pilot.js ---------- */

/** Titre affiché : sans « H/F », sans contrat en tête, sans majuscules partout (le titre exact reste en infobulle). */
function quaiTitle(t) {
  const s = cleanTitle(t).replace(/^(?:cdi|cdd|int[ée]rim|alternance|stage)\s*[-–:|]\s*/i, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(t || '');
}

/** Adéquation au CV : jauge en dix cases et score sur 100. */
function quaiFit(score) {
  const lvl = score >= 60 ? ' hi' : score < 30 ? ' lo' : '';
  return `<span class="q-fit${lvl}" title="Adéquation avec ton CV : ${score} sur 100"><span class="q-fit-l">CV</span>`
    + `<span class="q-bar" style="--p:${Math.floor(score / 10) * 10}%"></span><b>${score}</b></span>`;
}

const QUAI_GROUPS = { coeur: '★ Cœur de cible', bon: 'Bonnes pistes', repli: 'Repli' };

/** Titre de section avant la première offre de chaque niveau (liste triée par adéquation seulement). */
function quaiGroup(list, i) {
  if (!TIERS || hiddenView || document.getElementById('sortMode')?.value !== 'score') return '';
  const t = tierOf(list[i]);
  if (i && tierOf(list[i - 1]) === t) return '';
  let n = 0;
  for (let k = i; k < list.length && tierOf(list[k]) === t; k++) n++;
  return `<div class="q-grp q-grp-${t}" role="heading" aria-level="3">${QUAI_GROUPS[t] || t}<b>${n}</b></div>`;
}

/** Carte d'offre en étiquette : l'offre en haut ; sur le talon, l'adéquation, le statut et « Préparer ». */
function quaiCard(o) {
  const st = o.status || 'À examiner', nw = uiIsNew(o), sec = sectorOf(o), why = hiddenReason(o);
  const tier = TIERS ? tierOf(o) : 'bon';
  const key = sec && ((ACTIVE_PROFILE.tiers || {}).coeurSectors || {})[sec];
  const when = o.date ? fmtDate(o.date) : o.updated ? 'Mise à jour le ' + fmtDate(o.updated) : 'Date à vérifier';
  const adzuna = o.source === 'Adzuna' || (o.sources || []).includes('Adzuna');
  return `<article class="job q-card q-${tier}${nw ? ' is-new' : ''}" data-cat="${categoryOf(o)}" data-status="${esc(st)}"><div class="job-main">`
    + `<div class="q-top">${tierBadge(o)}${nw ? '<span class="badge-new">Nouveau</span>' : ''}${o.demo ? '<span class="pill">Exemple fictif</span>' : ''}`
    + `<span class="m-date${nw ? ' fresh' : ''}" title="${esc(when)}">${uiAge(o)}</span></div>`
    + `<h3 title="${esc(o.title)}">${esc(quaiTitle(o.title))}</h3>`
    + `<div class="q-co">${uiLogo(o.company)}<div class="q-co-t"><b>${esc(o.company)}</b>`
    + (sec ? `<span class="q-sector${key ? ' key' : ''}">${key ? ic(sec === 'sante' ? 'health' : 'warehouse') : ''}${esc(sectorLabel(sec))}</span>` : '')
    + `</div></div><div class="job-meta"><span>${ic('pin')}${esc(o.location || 'Lieu non précisé')}</span>`
    + (travelLabel(o) ? `<span class="travel">${ic('route')}${esc(uiTravel(o))}</span>` : '')
    + uiContract(o.contract) + repeatBadge(o)
    + (why ? `<span class="hidden-why">${ic('eyeoff')}Masquée : ${esc(why)}</span>` : '')
    + `</div><p>${esc(o.notes || 'Pas de description.')}</p>`
    + (adzuna ? '<div class="job-tags"><a class="source-credit" href="https://www.adzuna.fr/" target="_blank" rel="noopener">Adzuna</a></div>' : '')
    + `</div><div class="job-side">${quaiFit(score(o))}${uiStatusSelect(o)}`
    + `<button class="prep-main" onclick="prep('${o.id}')">Préparer${ic('arrow')}</button></div></article>`;
}

/** Relance : jours écoulés depuis l'envoi (J+n). */
function quaiDelay(o) {
  if (o.status !== 'À relancer' || !o.appliedDate) return '';
  const days = Math.max(0, Math.floor((Date.now() - new Date(o.appliedDate + 'T12:00:00')) / 864e5));
  return ` <span class="q-delay" title="Jours depuis l’envoi">J+${days}</span>`;
}

/** Tri et file : fermer, rang, métier parcouru, avancement, puis l'offre. */
function quaiPilotHead(o, cat, total) {
  const n = pilot.i + 1, label = pilot.mode === 'triage' ? 'Tri' : pilot.single ? 'Préparer' : 'File';
  return `<div class="pilot-head q-head"><button class="ghost icon-btn q-close" data-act="close" aria-label="Fermer (Échap)" title="Fermer (Échap)">${ic('x')}</button>`
    + `<span class="q-count">${label}${pilot.single ? '' : ` · ${n} / ${total}`}</span>${pilotCatPill(cat)}</div>`
    + (pilot.single ? '' : `<div class="q-progress" role="progressbar" aria-label="Avancement" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}"><i style="width:${Math.round(n / Math.max(1, total) * 100)}%"></i></div>`)
    + `<div class="q-tags">${tierBadge(o)}${sectorBadge(o)}${repeatBadge(o)}</div>`
    + `<h2 title="${esc(o.title)}">${esc(quaiTitle(o.title))}</h2><div class="job-meta">${metaLine(o)}</div>`;
}

/** Tri : Annuler et Ouvrir au-dessus ; Ignorer, Plus tard et À postuler sous le pouce. */
function quaiTriageActions() {
  return '<p class="swipe-hint">Glisse à droite pour garder, à gauche pour ignorer</p>'
    + `<div class="pilot-actions q-actions"><div class="q-sub">`
    + `<button class="ghost" data-act="undo"${pilot.undo.length ? '' : ' disabled'}><kbd>←</kbd>${ic('undo')}Annuler</button>`
    + `<button class="ghost" data-act="open"><kbd>O</kbd>Ouvrir l’annonce${ic('external')}</button></div>`
    + `<div class="q-main"><button class="secondary" data-act="ignore"><kbd>X</kbd>${ic('x')}Ignorer</button>`
    + `<button class="secondary q-later" data-act="skip"><kbd>→</kbd>Plus tard</button>`
    + `<button class="q-go" data-act="apply"><kbd>A</kbd>${ic('check')}À postuler</button></div></div>`;
}

/** Tri : la description s'ouvre sur les missions quand l'annonce les annonce par un titre. */
const QUAI_MISSIONS_RE = /^(?:vos |les |votre |principales |description (?:du|de la) )?(?:missions?|responsabilit|activit|poste\b)/i;
function quaiAfterTriage(card) {
  const notes = card.querySelector('.pilot-notes');
  if (!notes) return;
  const blocks = [...notes.querySelectorAll('h4, p, li')];
  const h = blocks.find(x => QUAI_MISSIONS_RE.test(x.textContent.trim()));
  if (h && h !== blocks[0]) notes.scrollTop = Math.max(0, h.offsetTop - notes.offsetTop - 6);
}

/** File : la candidature en trois étapes, « Candidature envoyée » en bas. */
function quaiQueueBody(head, o, cv, chips) {
  const noUrl = o.url ? '' : ' disabled title="Pas de lien pour cette offre"';
  return `${head}<ol class="q-steps">`
    + `<li><span class="q-sn">1</span><div class="q-step"><div class="q-step-h"><b>Relis ta lettre</b>`
    + `<span class="q-cv" title="CV à joindre">${ic('file')}${cv ? esc(cv) : 'CV à définir dans Critères'}</span></div>`
    + `<textarea id="pilotLetter" rows="9" aria-label="Lettre de motivation">${esc(fillTemplate(o))}</textarea></div></li>`
    + `<li><span class="q-sn">2</span><div class="q-step"><b>Copie tes infos</b><div class="pilot-chips">`
    + `<button class="chip" data-copy="__letter">${ic('file')}Lettre</button>${chips || '<span class="small muted">Renseigne « Mes infos » dans Critères.</span>'}</div></div></li>`
    + `<li><span class="q-sn">3</span><div class="q-step"><b>Postule sur le site</b><div class="q-row">`
    + `<button data-act="go"><kbd>Entrée</kbd>${ic('external')}Ouvrir l’annonce + copier la lettre</button>`
    + `<button class="secondary" data-act="pdf" title="Pour les annonces qui demandent la lettre en fichier"><kbd>P</kbd>${ic('download')}Lettre en PDF</button>`
    + `<button class="ghost" data-act="open"${noUrl}><kbd>O</kbd>Ouvrir sans copier</button></div></div></li></ol>`
    + `<div class="pilot-actions q-actions"><div class="q-sub">`
    + `<button class="ghost" data-act="undo"${pilot.undo.length ? '' : ' disabled'}><kbd>←</kbd>${ic('undo')}Annuler</button>`
    + `<span class="q-sub-r"><button class="ghost" data-act="skip"><kbd>→</kbd>Plus tard</button>`
    + `<button class="ghost q-danger" data-act="ignore"><kbd>X</kbd>${ic('trash')}Supprimer</button></span></div>`
    + `<button class="q-go q-wide" data-act="sent"><kbd>Espace</kbd>${ic('check')}Candidature envoyée</button></div>`;
}

/** Tri ou file terminés : ce qui a été fait, puis la suite logique. */
function quaiPilotDone(total) {
  const triage = pilot.mode === 'triage', s = total > 1 ? 's' : '';
  return `<div class="pilot-head q-head"><button class="ghost icon-btn q-close" data-act="close" aria-label="Fermer (Échap)" title="Fermer (Échap)">${ic('x')}</button>`
    + `<span class="q-count">${triage ? 'Tri' : 'File'}${total ? ` · ${total} / ${total}` : ''}</span><span></span></div>`
    + (total ? '<div class="q-progress done"><i style="width:100%"></i></div>' : '')
    + `<div class="empty q-done">${ic(triage ? 'check' : 'send', 'empty-ic')}`
    + `<strong>${total ? (triage ? 'Tout est trié' : 'File terminée') : 'Rien à traiter pour le moment'}</strong>`
    + `<span>${total ? `${total} offre${s} traitée${s}.` : triage ? 'Les nouvelles offres arrivent avec la prochaine collecte.' : 'Pendant le tri, garde une offre (glisse à droite) pour la retrouver ici.'}</span>`
    + (triage ? '<button class="q-go" data-act="toqueue">Passer à la file</button>' : '<button class="secondary" data-act="close">Fermer</button>')
    + (pilot.undo.length ? `<button class="ghost" data-act="undo">${ic('undo')}Annuler la dernière action</button>` : '')
    + '</div>';
}

/* ---------- Page : téléphone (Accueil, Plus) et ordinateur (barre latérale, panneau du jour) ---------- */

const QUAI_SMALL = window.matchMedia ? matchMedia('(max-width: 900px)') : { matches: false };

function quaiStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

/** Thème : « auto » suit le réglage du téléphone et n'enregistre rien. */
function quaiThemePref() { const t = quaiStored('zcrt_theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
function quaiSetTheme(pref) {
  try { if (pref === 'auto') localStorage.removeItem('zcrt_theme'); else localStorage.setItem('zcrt_theme', pref); } catch (e) { /* stockage indisponible */ }
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark ? 'dark' : 'light');
  quaiThemeMark();
}
function quaiThemeSeg() {
  return '<div class="q-seg" role="radiogroup" aria-label="Apparence">' + [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]
    .map(([v, l]) => `<button type="button" role="radio" data-theme-pref="${v}">${l}</button>`).join('') + '</div>';
}
function quaiThemeMark() {
  const p = quaiThemePref();
  document.querySelectorAll('[data-theme-pref]').forEach(b => { const on = b.dataset.themePref === p; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}

/** Onglet ouvert par un bouton ajouté ici (même logique que les onglets d'app.js). */
function quaiActivate(b) {
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.section').forEach(x => x.classList.toggle('active', x.id === b.dataset.tab));
  const t = document.getElementById('pageTitle');
  if (t && b.dataset.tab === 'more') t.textContent = 'Plus';
}

/** Vue courante (accueil, offres ou nom de l'onglet) : quai.css s'en sert sur téléphone. */
function quaiSetView(b) {
  document.documentElement.dataset.view = b.dataset.tab === 'dashboard' ? (b.dataset.view || 'offers') : b.dataset.tab;
}

function quaiNav() {
  const nav = document.querySelector('.nav');
  const offers = nav.querySelector('[data-tab="dashboard"]');
  offers.dataset.view = 'offers';
  const make = (tab, view, icon, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-only-sm';
    b.dataset.tab = tab;
    if (view) b.dataset.view = view;
    b.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg><span>${label}</span>`;
    b.addEventListener('click', () => quaiActivate(b));
    return b;
  };
  const home = make('dashboard', 'home', 'home', 'Accueil');
  const more = make('more', '', 'grid', 'Plus');
  more.insertAdjacentHTML('beforeend', '<b class="nav-count" data-nav-count="more" hidden></b>');
  nav.append(home, more);
  ['Travail', 'Outils', 'Réglages'].forEach((t, i) => nav.insertAdjacentHTML('beforeend', `<span class="q-sec q-sec-${i + 1}" aria-hidden="true">${t}</span>`));
  nav.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) quaiSetView(b); });
  // Téléphone : l'appli s'ouvre sur l'accueil. Ordinateur : Accueil et Plus n'existent pas (barre latérale).
  if (QUAI_SMALL.matches) { quaiActivate(home); quaiSetView(home); } else quaiSetView(offers);
  QUAI_SMALL.addEventListener?.('change', e => {
    const active = nav.querySelector('[data-tab].active');
    if (!e.matches && active && active.classList.contains('q-only-sm')) offers.click();
  });
}

/** En-tête : bouton de synchro (téléphone) à côté du bouton de thème. */
function quaiTop() {
  document.querySelector('.top-actions')?.insertAdjacentHTML('afterbegin',
    '<button class="ghost icon-btn q-syncbtn" id="qSyncBtn" type="button" data-state="off" aria-label="Synchro"><svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg></button>');
  document.getElementById('qSyncBtn')?.addEventListener('click', () => quaiGo('export'));
}

/** Barre latérale (ordinateur) : état de la synchro et thème en bas. */
function quaiSide() {
  const side = document.querySelector('.side');
  if (!side) return;
  side.insertAdjacentHTML('beforeend', `<div class="q-side-foot"><p class="q-sync" data-state="off"><span class="q-dot"></span><span class="q-sync-t"></span></p>${quaiThemeSeg()}</div>`);
  const note = side.querySelector('.side-note');
  if (note) side.querySelector('.q-side-foot').append(note);
}

/** Accueil : libellés des tuiles, répartition des niveaux, bloc « À surveiller ». */
function quaiHome() {
  const bar = document.querySelector('.pilot-bar');
  if (!bar) return;
  bar.insertAdjacentHTML('afterbegin', '<span class="q-rail-h">Aujourd’hui</span>');
  const tags = bar.querySelectorAll('.tile-tag');
  if (tags[0]) tags[0].textContent = '01 · À trier';
  if (tags[1]) tags[1].textContent = '02 · À postuler';
  bar.querySelector('#triageBtn .count')?.insertAdjacentHTML('afterend', '<span class="q-mix" id="qMix" aria-hidden="true" hidden></span>');
  const label = bar.querySelector('.goal-label');
  if (label) label.textContent = 'Objectif du jour';
  const watch = document.createElement('div');
  watch.className = 'q-watch';
  watch.innerHTML = '<span class="q-watch-h">À surveiller</span><div class="q-list" id="qWatch"></div>';
  const sync = bar.querySelector('.sync-state');
  if (sync) bar.insertBefore(watch, sync); else bar.append(watch);
  watch.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) quaiGo(b.dataset.go); });
}

/** Liste des offres : lien « Masquées » (remplace la case de compteurs). */
function quaiResults() {
  document.querySelector('.results-tools')?.insertAdjacentHTML('afterbegin',
    `<button type="button" class="ghost q-hidden" id="qHidden" hidden>${ic('eyeoff')}Masquées <b>0</b></button>`);
  document.getElementById('qHidden')?.addEventListener('click', () => document.getElementById('statExcludedCard')?.click());
  const q = document.getElementById('q');
  if (q) q.placeholder = 'Poste, entreprise, ville…';
  // Mention de bas de page au nom du profil (le texte d'origine dit « ZCRT »).
  const foot = document.querySelector('.footer');
  if (foot) foot.textContent = foot.textContent.replace('ZCRT', ACTIVE_PROFILE.brand);
}

/** Onglet Plus (téléphone) : ce qui ne tient pas dans la barre du bas. */
function quaiMore() {
  const main = document.querySelector('.main');
  if (!main) return;
  const other = otherProfile();
  const row = (go, icon, t, s, extra = '') => `<button type="button" class="q-li" data-go="${go}"><span class="q-ico">${ic(icon)}</span>`
    + `<span class="q-li-t"><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span>${extra}${ic('chev', 'q-chev')}</button>`;
  const sec = document.createElement('section');
  sec.id = 'more';
  sec.className = 'section q-more';
  sec.innerHTML = (other ? `<div class="q-profile"><span class="brand-mark" aria-hidden="true"><b>${ACTIVE_PROFILE.brand.slice(0, 2)}</b><b>${ACTIVE_PROFILE.brand.slice(2)}</b></span>`
      + `<span class="q-li-t"><b>${ACTIVE_PROFILE.name}</b><small>${ACTIVE_PROFILE.tag || ''}</small></span>`
      + `<button type="button" class="secondary" onclick="switchProfile()">Passer à ${other.name}</button></div>` : '')
    + '<h2 class="q-h">Cet appareil</h2><div class="q-list">'
    + row('export', 'cloud', 'Synchro téléphone et PC', '', '<span class="q-sync q-sync-mini" data-state="off"><span class="q-dot"></span><span class="q-sync-t"></span></span>')
    + row('backup', 'download', 'Sauvegarde', 'Télécharger ou importer un fichier JSON')
    + `<div class="q-li q-li-static"><span class="q-ico">${ic('moon')}</span><span class="q-li-t"><b>Apparence</b></span>${quaiThemeSeg()}</div></div>`
    + '<h2 class="q-h">Outils</h2><div class="q-list">'
    + row('lettre', 'file', 'Générateur de lettre', 'À partir du texte d’une annonce')
    + (ACTIVE_PROFILE.mails ? row('mails', 'inbox', 'Mails triés', 'Réponses, entretiens et refus', '<b class="nav-count" data-nav-count="mails" hidden></b>') : '')
    + '</div><h2 class="q-h">Recherche</h2><div class="q-list">'
    + row('profile', 'sliders', 'Critères de recherche', 'Métiers, mots-clés, entreprises exclues')
    + row('types', 'eyeoff', 'Types de postes masqués', 'Avec le nombre d’offres concernées')
    + '</div><h2 class="q-h">Candidature</h2><div class="q-list">'
    + row('infos', 'user', 'Mes infos', 'Copiées en un geste dans Préparer')
    + row('tpl', 'file', 'Modèles de lettre et CV', 'Un modèle par métier')
    + row('goal', 'target', 'Objectif', 'Candidatures par session, deux sessions par jour')
    + '</div>';
  main.insertBefore(sec, main.querySelector('.footer'));
  sec.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) quaiGo(b.dataset.go); });
}

/** Raccourcis de l'accueil et de l'onglet Plus. */
function quaiGo(dest) {
  const tab = t => document.querySelector(`.nav [data-tab="${t}"]`)?.click();
  const reach = sel => setTimeout(() => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 380);
  const apps = filter => { uiAppsFilter = filter; tab('applications'); uiRenderApps(); };
  ({
    relances: () => apps('À relancer'),
    entretiens: () => apps('Entretien'),
    backup: () => { tab('export'); reach('#downloadData'); },
    types: () => { tab('profile'); reach('#jobTypes'); },
    infos: () => { tab('profile'); reach('#info_prenom'); },
    tpl: () => { tab('profile'); reach('#tplGrid'); },
    goal: () => { tab('profile'); reach('#goalInput'); },
  }[dest] || (() => tab(dest)))();
}

/** Bloc « À surveiller » : relances, entretiens, mails récents. */
function quaiWatchHtml() {
  const relances = offers.filter(o => o.status === 'À relancer').length;
  const talks = offers.filter(o => o.status === 'Entretien').length;
  let mails = 0;
  if (ACTIVE_PROFILE.mails) {
    const recent = Date.now() - 14 * 864e5;
    mails = ((uiMailData().mails) || []).filter(m => ['entretien', 'action', 'reponse'].includes(m.label) && m.at >= recent).length;
  }
  const s = n => (n > 1 ? 's' : '');
  const rows = [
    relances && ['relances', 'wait', 'clock', `${relances} relance${s(relances)} à faire`, `Sans réponse depuis ${RELANCE_DAYS} jours ou plus`],
    talks && ['entretiens', 'talk', 'calendar', `${talks} entretien${s(talks)}`, 'Suivi des candidatures'],
    mails && ['mails', 'ok', 'inbox', `${mails} mail${s(mails)} à lire`, 'Réponses et entretiens des 14 derniers jours'],
  ].filter(Boolean);
  return rows.length
    ? rows.map(([go, tone, icon, t, sub]) => `<button type="button" class="q-li" data-go="${go}"><span class="q-ico ${tone}">${ic(icon)}</span>`
      + `<span class="q-li-t"><b>${t}</b><small>${sub}</small></span>${ic('chev', 'q-chev')}</button>`).join('')
    : `<p class="q-calm">${ic('check')}Rien en attente : place au tri.</p>`;
}

/** Après chaque rendu : répartition des niveaux, « À surveiller », compteurs et surtitre. */
function quaiRefresh() {
  if (typeof offers === 'undefined' || typeof render !== 'function') return;
  const mix = document.getElementById('qMix');
  if (mix && TIERS) {
    const by = { coeur: 0, bon: 0, repli: 0 };
    pilotList('triage').forEach(o => { by[tierOf(o)]++; });
    const total = by.coeur + by.bon + by.repli;
    mix.hidden = !total;
    mix.innerHTML = ['coeur', 'bon', 'repli'].map(t => (by[t] ? `<i class="q-mix-${t}" style="flex:${by[t]}"></i>` : '')).join('');
    mix.title = `${by.coeur} cœur de cible · ${by.bon} bonnes pistes · ${by.repli} repli`;
  }
  const watch = document.getElementById('qWatch');
  if (watch) watch.innerHTML = quaiWatchHtml();
  const hidden = document.getElementById('qHidden');
  if (hidden) {
    const n = (document.getElementById('statExcluded')?.textContent || '0').trim();
    hidden.querySelector('b').textContent = n;
    hidden.hidden = n === '0' || hiddenView;
  }
  const mails = document.querySelector('.nav [data-nav-count="mails"]');
  document.querySelectorAll('[data-nav-count="more"]').forEach(el => { el.textContent = mails?.textContent || ''; el.hidden = !mails || mails.hidden; });
  const eyebrow = document.querySelector('.top .eyebrow');
  if (eyebrow) {
    const day = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const session = (document.getElementById('goalSession')?.textContent || '').toLowerCase();
    eyebrow.textContent = day.charAt(0).toUpperCase() + day.slice(1) + (session ? ' · ' + session : '');
  }
}

/** Synchro : état reporté sur le bouton de l'en-tête, la barre latérale et l'onglet Plus. */
function quaiSync(text, error) {
  const t = text || '';
  const state = error ? 'err' : /non activée|désactivée/i.test(t) ? 'off' : /…$/.test(t) ? 'busy' : 'ok';
  document.querySelectorAll('.q-sync').forEach(el => {
    el.dataset.state = state;
    const label = el.querySelector('.q-sync-t');
    if (label) label.textContent = el.classList.contains('q-sync-mini') ? ({ ok: 'Activée', off: 'Inactive', err: 'En échec', busy: 'En cours' })[state] : t;
  });
  const btn = document.getElementById('qSyncBtn');
  if (btn) {
    btn.dataset.state = state;
    btn.title = t;
    btn.setAttribute('aria-label', 'Synchro : ' + t);
    btn.querySelector('use')?.setAttribute('href', state === 'err' ? '#i-cloudx' : state === 'ok' ? '#i-cloudok' : '#i-cloud');
  }
}

/* ---------- Branchements (Quai seulement) ---------- */

if (QUAI) {
  // Accueil sans emoji, série de jours avec une icône (fun.js appelle ces fonctions par leur nom).
  window.greeting = function () {
    const h = new Date().getHours();
    const name = (typeof profile !== 'undefined' && profile.infos && profile.infos.prenom) || ACTIVE_PROFILE.name;
    return (h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir') + ', ' + name;
  };
  window.applyGreeting = function () {
    const title = document.getElementById('pageTitle');
    if (!title || !document.getElementById('dashboard')?.classList.contains('active')) return;
    title.textContent = QUAI_SMALL.matches && document.documentElement.dataset.view === 'offers' ? 'Offres' : greeting();
  };
  window.renderStreak = function () {
    const top = document.querySelector('#goalBox .goal-top');
    if (!top || typeof dayStreak !== 'function') return;
    let el = document.getElementById('goalStreak');
    if (!el) {
      el = document.createElement('span');
      el.id = 'goalStreak';
      el.className = 'goal-streak';
      top.insertBefore(el, top.querySelector('.goal-check'));
    }
    const n = dayStreak();
    el.hidden = n < 2;
    el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-flame"/></svg>${n} j`;
    el.title = n + ' jours d’affilée avec au moins une candidature';
  };
  // Après chaque rendu (app.js et pilot.js appellent ces fonctions par leur nom).
  const quaiPilotBar = updatePilotBar;
  window.updatePilotBar = function () { quaiPilotBar.apply(this, arguments); quaiRefresh(); };
  const quaiSyncState = setSyncState;
  window.setSyncState = function (text, error) { quaiSyncState.apply(this, arguments); quaiSync(text, error); };
  // Pastille de Suivi : les relances à faire (le total des candidatures est dans l'onglet).
  const quaiCounts = uiRefreshCounts;
  window.uiRefreshCounts = function () {
    quaiCounts.apply(this, arguments);
    if (typeof offers === 'undefined') return;
    const n = offers.filter(o => o.status === 'À relancer').length;
    document.querySelectorAll('[data-nav-count="applications"]').forEach(el => {
      el.textContent = n || '';
      el.hidden = !n;
      el.title = n ? n + ' relance' + (n > 1 ? 's' : '') + ' à faire' : '';
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    quaiNav();
    quaiTop();
    quaiSide();
    quaiHome();
    quaiResults();
    quaiMore();
    quaiThemeMark();
    document.addEventListener('click', e => { const b = e.target.closest('[data-theme-pref]'); if (b) quaiSetTheme(b.dataset.themePref); });
    document.getElementById('themeToggle')?.addEventListener('click', quaiThemeMark);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (quaiThemePref() === 'auto') quaiSetTheme('auto'); });
    const sync = document.getElementById('syncState');
    quaiSync(sync?.textContent, sync?.classList.contains('sync-error'));
    applyGreeting();
    quaiRefresh();
    uiRefreshCounts();
  });
}
