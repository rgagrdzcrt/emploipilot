/* ZCRT — un site plus vivant : confettis, paliers, combos, série de jours, accueil selon l'heure.
 *
 * S'ajoute autour des fonctions existantes (updateGoal) sans les modifier.
 * Confettis : un canvas temporaire, retiré dès que la pluie est finie (rien ne tourne au repos).
 * Rien ne bouge si l'appareil demande moins d'animations (MOTION_OK, motion.js).
 */

/* ---------- Confettis ---------- */

const CONFETTI_COLORS = ['#c6ef6b', '#4cc887', '#ff9f43', '#7c6cff', '#ff6b9a', '#3fc1ff', '#ffd23f'];

function confetti({ x = innerWidth / 2, y = innerHeight / 2, count = 40, spread = 70, power = 9, rain = false } = {}) {
  if (typeof MOTION_OK !== 'undefined' && !MOTION_OK) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const angle = rain ? Math.PI / 2 : (-90 + (Math.random() - .5) * spread * 2) * Math.PI / 180;
    const speed = rain ? 2 + Math.random() * 3 : power * (.55 + Math.random() * .6);
    return {
      x: rain ? Math.random() * innerWidth : x, y: rain ? -20 - Math.random() * innerHeight * .4 : y,
      vx: Math.cos(angle) * speed + (rain ? (Math.random() - .5) * 2 : 0), vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)], life: 0,
    };
  });

  const maxLife = rain ? 260 : 110;
  // Filet de sécurité : si l'onglet passe en arrière-plan, les images sont suspendues ; on retire quand même le canvas.
  setTimeout(() => canvas.remove(), rain ? 6000 : 3000);
  const frame = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.life++;
      if (p.life > maxLife || p.y > innerHeight + 30) continue;
      alive++;
      p.vy += rain ? .03 : .28;          // gravité
      p.vx *= .99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (maxLife - p.life) / 30);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Point de départ des confettis : la fenêtre de candidature si elle est ouverte, sinon l'objectif du jour. */
function confettiOrigin() {
  const pilotOpen = document.getElementById('pilot')?.classList.contains('open');
  const el = pilotOpen ? document.getElementById('pilotCard') : document.getElementById('goalBox');
  const r = el?.getBoundingClientRect();
  if (!r || !r.width) return { x: innerWidth / 2, y: innerHeight * .7 };
  return { x: r.left + r.width / 2, y: pilotOpen ? r.bottom - 60 : r.top + r.height / 2 };
}

/* ---------- Série de jours (au moins une candidature par jour) ---------- */

function dayStreak() {
  const days = new Set(offers.map(o => o.appliedDate).filter(Boolean));
  const d = new Date();
  const key = () => d.toLocaleDateString('sv-SE');
  if (!days.has(key())) d.setDate(d.getDate() - 1); // la série tient encore tant que la journée n'est pas finie
  let n = 0;
  while (days.has(key())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderStreak() {
  const top = document.querySelector('#goalBox .goal-top');
  if (!top) return;
  let el = document.getElementById('goalStreak');
  if (!el) {
    el = document.createElement('span');
    el.id = 'goalStreak';
    el.className = 'goal-streak';
    top.insertBefore(el, top.querySelector('.goal-check'));
  }
  const n = dayStreak();
  el.hidden = n < 2;
  el.textContent = '🔥 ' + n + ' j';
  el.title = n + ' jours d’affilée avec au moins une candidature';
}

/* ---------- Paliers de l'objectif et combos ---------- */

const CHEERS = {
  25: ['Bien lancé ! 🚀', 'Le moteur est chaud 🔥', 'Un quart de fait 💪'],
  50: ['La moitié ! On lâche rien 💥', 'Mi-parcours, t’es en feu 🔥', '50 % : la machine est lancée ⚙️'],
  75: ['Plus que la dernière ligne droite 🏁', 'Trois quarts, c’est presque fini 🙌', 'Le sprint final commence ⚡'],
};
const COMBO_STEPS = [3, 5, 10, 15, 20, 30];
let funLastSent = null, combo = 0, lastSendAt = 0, userSentAt = 0;

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

function onSentCountChange(sent, goal) {
  if (funLastSent === null) { funLastSent = sent; return; } // premier calcul au chargement : pas de fête
  // Seulement une candidature envoyée à l'instant sur cet appareil (pas la synchro ni le robot Gmail).
  if (sent <= funLastSent || Date.now() - userSentAt > 3000) { funLastSent = sent; return; }
  const before = funLastSent;
  funLastSent = sent;

  // Combo : candidatures envoyées à moins de 4 minutes d'intervalle.
  const now = Date.now();
  combo = now - lastSendAt < 4 * 60000 ? combo + (sent - before) : sent - before;
  lastSendAt = now;

  // Paliers comptés dans la session en cours ; la fin de session et la fin de journée ont leur fête.
  const dayGoal = goal * (typeof GOAL_SESSIONS === 'number' ? GOAL_SESSIONS : 1);
  if (before < dayGoal && sent >= dayGoal) {
    confetti({ rain: true, count: 160 });              // journée bouclée : grande pluie (le toast existe déjà)
    document.getElementById('goalBox')?.classList.add('celebrate');
    setTimeout(() => document.getElementById('goalBox')?.classList.remove('celebrate'), 1600);
    return;
  }
  if (Math.floor(before / goal) < Math.floor(sent / goal)) {
    confetti({ ...confettiOrigin(), count: 90, spread: 90, power: 12 }); // fin de session
    return;
  }
  confetti({ ...confettiOrigin(), count: 28, spread: 55, power: 8 });
  const base = Math.floor(sent / goal) * goal;
  const crossed = p => before - base < Math.ceil(goal * p / 100) && sent - base >= Math.ceil(goal * p / 100);
  const milestone = before >= base ? [75, 50, 25].find(crossed) : undefined;
  if (milestone) {
    setTimeout(() => toast(pick(CHEERS[milestone]) + ' ' + (sent - base) + ' / ' + goal), 350);
    confetti({ ...confettiOrigin(), count: 60, spread: 80, power: 11 });
  } else if (COMBO_STEPS.includes(combo)) {
    setTimeout(() => toast('🔥 Combo x' + combo + ' ! Continue comme ça'), 350);
  }
}

/* ---------- Accueil selon l'heure ---------- */

function greeting() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const name = (typeof profile !== 'undefined' && profile.infos && profile.infos.prenom) || ACTIVE_PROFILE.name;
  return `${hello}, ${name} ${h < 5 ? '🌙' : h < 18 ? '👋' : '✨'}`;
}

function applyGreeting() {
  const dashboardActive = document.getElementById('dashboard')?.classList.contains('active');
  const title = document.getElementById('pageTitle');
  if (dashboardActive && title) title.textContent = greeting();
}

/* ---------- Branchements ---------- */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof setTrack === 'function') {
    const originalTrack = setTrack;
    window.setTrack = function (o, status) {
      originalTrack(o, status);
      if (status === 'Candidature envoyée' && o.appliedDate === today()) userSentAt = Date.now();
    };
  }
  if (typeof updateGoal === 'function') {
    const original = updateGoal;
    window.updateGoal = function () {
      original();
      const sent = offers.filter(o => o.appliedDate === today()).length;
      onSentCountChange(sent, goalOf());
      renderStreak();
    };
    window.updateGoal();
  }
  applyGreeting();
  // Le titre de l'onglet « Offres » est réécrit au changement d'onglet : on remet l'accueil.
  document.addEventListener('click', e => { if (e.target.closest('[data-tab]')) applyGreeting(); });
});
