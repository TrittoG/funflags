'use strict';

const API_URL =
  'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2,region,population';

// ── Easy pool: well-known countries ──────────────────────────────────────────
const EASY = new Set([
  'US','GB','FR','DE','IT','ES','CA','AU','JP','CN',
  'IN','BR','RU','MX','AR','SA','ZA','NG','EG','TR',
  'KR','ID','TH','VN','PK','BD','UA','PL','NL','SE',
  'NO','FI','DK','CH','BE','AT','PT','GR','CZ','HU',
  'RO','BG','HR','RS','SK','SI','LT','LV','EE','BY',
  'KZ','UZ','AZ','AM','GE','IL','JO','LB','SY','IQ',
  'AF','MM','NP','LK','KH','PH','NZ','CL','CO','PE',
  'VE','EC','BO','UY','PY','CU','DO','GT','HN','SV',
  'NI','CR','PA','JM','MA','TN','DZ','ET','KE','TZ',
  'UG','GH','CI','CM','SN','MZ','ZM','ZW','AO','SD',
  'MG','MK','BA','AL','ME','MN','KW','QA','AE','BH',
  'OM','YE','LA','KG','TM','TJ','MD','CD','LY','SO',
  'RW','TG','BJ','BF','ML','NE','TD','GM','GN','SL',
  'LR','CF','GQ','GA','DJ','ER','SS','CY','MT','LU',
  'IS','IE','HT','TT','CG','MW','NA','BW','IR','KP',
  'TL','BN','MV','SC','KM','ST','GW','SR','GY','BZ',
  'FJ','VU','SB','WS','TO','KI','PG','BB','LC','VC',
  'AG','KN','DM','GD'
]);

const REGION_MAP = {
  europe:   'Europe',
  americas: 'Americas',
  asia:     'Asia',
  africa:   'Africa',
  oceania:  'Oceania',
};
const REGION_LABELS = {
  all:      '🌍 Todas',
  europe:   '🇪🇺 Europa',
  americas: '🌎 Américas',
  asia:     '🌏 Asia',
  africa:   '🌍 África',
  oceania:  '🌊 Oceanía',
};

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  gameMode:      'flags',
  difficulty:    'easy',    // 'easy' | 'hard' | 'all'
  inputType:     'multiple',
  capDir:        'toCapital',
  region:        'all',     // 'all' | 'europe' | 'americas' | 'asia' | 'africa' | 'oceania'
  gameStyle:     'normal',  // 'normal' | 'timed' | 'streak'
  score:         0,
  wrong:         0,
  streak:        0,
  timeLeft:      60,
  question:      null,
  answered:      false,
  selectedAnswer:null,
  explorerRegion:'all',
};

let countries       = [];
let timerInterval   = null;
let streakTimeout   = null;

// ── Utils ─────────────────────────────────────────────────────────────────────
const app = () => document.getElementById('app');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rand(arr, n = 1) {
  const copy = [...arr], out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return n === 1 ? out[0] : out;
}

// ── Storage ───────────────────────────────────────────────────────────────────
function getStats() {
  try { return JSON.parse(localStorage.getItem('ff_stats') || '{}'); } catch { return {}; }
}
function getDiscovered() {
  try { return new Set(JSON.parse(localStorage.getItem('ff_disc') || '[]')); } catch { return new Set(); }
}
function markDiscovered(code) {
  const d = getDiscovered();
  if (!d.has(code)) { d.add(code); localStorage.setItem('ff_disc', JSON.stringify([...d])); }
}

function statKey() {
  const base = S.gameMode === 'flags' ? `flags_${S.difficulty}` : `caps_${S.capDir}`;
  if (S.gameStyle === 'timed')  return `${base}_timed`;
  if (S.gameStyle === 'streak') return `${base}_${S.inputType}_streak`;
  return `${base}_${S.inputType}`;
}

function recordNormal(correct) {
  const stats = getStats(), k = statKey();
  if (!stats[k]) stats[k] = { correct: 0, wrong: 0, bestStreak: 0 };
  if (correct) { stats[k].correct++; if (S.streak > stats[k].bestStreak) stats[k].bestStreak = S.streak; }
  else stats[k].wrong++;
  localStorage.setItem('ff_stats', JSON.stringify(stats));
}
function recordTimedEnd(score) {
  const stats = getStats(), k = statKey();
  if (!stats[k]) stats[k] = { bestScore: 0, played: 0 };
  stats[k].played++;
  if (score > stats[k].bestScore) stats[k].bestScore = score;
  localStorage.setItem('ff_stats', JSON.stringify(stats));
}
function recordStreakEnd(streak) {
  const stats = getStats(), k = statKey();
  if (!stats[k]) stats[k] = { bestStreak: 0, played: 0 };
  stats[k].played++;
  if (streak > stats[k].bestStreak) stats[k].bestStreak = streak;
  localStorage.setItem('ff_stats', JSON.stringify(stats));
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function loadData() {
  const cached = sessionStorage.getItem('ff_countries');
  if (cached) return JSON.parse(cached);
  const raw  = await (await fetch(API_URL)).json();
  const data = raw
    .filter(c => c.name?.common && c.flags?.svg && c.cca2)
    .map(c => ({ code: c.cca2, name: c.name.common, capital: c.capital?.[0] ?? null,
                 flag: c.flags.svg, region: c.region ?? 'Other' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  sessionStorage.setItem('ff_countries', JSON.stringify(data));
  return data;
}

function buildPool() {
  const src = S.gameMode === 'capitals' ? countries.filter(c => c.capital) : countries;
  let pool =
    S.difficulty === 'easy' ? src.filter(c =>  EASY.has(c.code)) :
    S.difficulty === 'hard' ? src.filter(c => !EASY.has(c.code)) : [...src];

  if (S.region !== 'all') {
    const f = pool.filter(c => c.region === REGION_MAP[S.region]);
    if (f.length >= 4) pool = f;
  }
  return pool.length >= 4 ? pool : src;
}

// ── Question ──────────────────────────────────────────────────────────────────
function makeQuestion() {
  const pool    = buildPool();
  const country = rand(pool);
  let label, questionType, questionText, answer;

  if (S.gameMode === 'flags') {
    label = '¿De qué país es esta bandera?'; questionType = 'flag'; answer = country.name;
  } else if (S.capDir === 'toCapital') {
    label = '¿Cuál es la capital de…'; questionType = 'text';
    questionText = country.name; answer = country.capital;
  } else {
    label = '¿En qué país se encuentra esta capital?'; questionType = 'text';
    questionText = country.capital; answer = country.name;
  }

  let options = null;
  if (S.inputType === 'multiple') {
    let wrongPool = pool.filter(c => c.code !== country.code);
    if (S.gameMode === 'capitals' && S.capDir === 'toCapital')
      wrongPool = wrongPool.filter(c => c.capital && c.capital !== answer);
    if (wrongPool.length < 3) {
      wrongPool = countries.filter(c => c.code !== country.code &&
        (S.gameMode !== 'capitals' || S.capDir !== 'toCapital' || (c.capital && c.capital !== answer)));
    }
    const wrongs = rand(wrongPool, 3).map(c =>
      S.gameMode === 'flags' || S.capDir === 'toCountry' ? c.name : c.capital);
    options = [...wrongs, answer].sort(() => Math.random() - .5);
  }
  return { country, label, questionType, questionText, answer, options };
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
function startTimer() {
  stopTimer(); S.timeLeft = 60;
  timerInterval = setInterval(() => {
    S.timeLeft--;
    if (S.timeLeft <= 0) { stopTimer(); renderGameOver(); return; }
    const el = document.getElementById('ff-timer');
    const bar = document.getElementById('ff-timer-bar');
    if (el)  el.textContent = S.timeLeft + 's';
    if (bar) {
      const pct = (S.timeLeft / 60) * 100;
      bar.style.width = pct + '%';
      bar.style.background =
        pct > 40 ? 'linear-gradient(90deg,#6366f1,#22c55e)' :
        pct > 20 ? '#f59e0b' : '#ef4444';
    }
  }, 1000);
}

// ── Game logic ────────────────────────────────────────────────────────────────
function submitAnswer(answer) {
  if (S.answered) return;
  const correct = answer.trim().toLowerCase() === S.question.answer.trim().toLowerCase();
  S.answered = true; S.selectedAnswer = answer;
  if (correct) { S.score++; S.streak++; markDiscovered(S.question.country.code); }
  else         { S.wrong++;  S.streak = 0; }
  if (S.gameStyle === 'normal') recordNormal(correct);
  renderGame();
  if (S.gameStyle === 'streak') {
    if (correct) {
      streakTimeout = setTimeout(() => {
        S.answered = false; S.selectedAnswer = null; S.question = makeQuestion(); renderGame();
      }, 900);
    } else {
      streakTimeout = setTimeout(() => renderGameOver(), 1400);
    }
  }
}
function confirmSelect() {
  const sel = document.getElementById('sel');
  if (sel?.value) submitAnswer(sel.value);
}

// ── Events ────────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const action = el.dataset.a, val = el.dataset.v;

  const resetGame = () => {
    if (streakTimeout) { clearTimeout(streakTimeout); streakTimeout = null; }
    S.score = 0; S.wrong = 0; S.streak = 0; S.answered = false; S.selectedAnswer = null;
    S.question = makeQuestion();
  };

  switch (action) {
    case 'mode':   S.gameMode   = val; renderHome(); break;
    case 'diff':   S.difficulty = val; renderHome(); break;
    case 'input':  S.inputType  = val; renderHome(); break;
    case 'capdir': S.capDir     = val; renderHome(); break;
    case 'region': S.region     = val; renderHome(); break;
    case 'style':  S.gameStyle  = val; renderHome(); break;

    case 'play':
    case 'play-again':
      resetGame();
      if (S.gameStyle === 'timed') startTimer(); else stopTimer();
      renderGame();
      break;

    case 'answerIdx': if (!S.answered) submitAnswer(S.question.options[+val]); break;
    case 'confirm':   confirmSelect(); break;

    case 'next':
      S.answered = false; S.selectedAnswer = null; S.question = makeQuestion(); renderGame(); break;

    case 'home':
      stopTimer();
      if (streakTimeout) { clearTimeout(streakTimeout); streakTimeout = null; }
      renderHome(); break;

    case 'stats':    renderStats();    break;
    case 'explorer': S.explorerRegion = 'all'; renderExplorer(); break;
    case 'exp-region': S.explorerRegion = val; renderExplorer(); break;

    case 'clearstats':
      if (confirm('¿Borrar todas las estadísticas?'))
        { localStorage.removeItem('ff_stats'); renderStats(); }
      break;
    case 'cleardisc':
      if (confirm('¿Borrar el registro de países descubiertos?'))
        { localStorage.removeItem('ff_disc'); renderExplorer(); }
      break;
  }
});

// ── Render: Home ──────────────────────────────────────────────────────────────
function renderHome() {
  const f = S.gameMode === 'flags', c = S.gameMode === 'capitals';

  const regionBtns = Object.entries(REGION_LABELS).map(([k, lbl]) =>
    `<button class="region-btn ${S.region === k ? 'active' : ''}" data-a="region" data-v="${k}">${lbl}</button>`
  ).join('');

  app().innerHTML = `
  <div class="screen">
    <header class="app-header">
      <h1 class="logo">🌍 FunFlags</h1>
      <div style="display:flex;gap:6px">
        <button class="btn-ghost" data-a="stats">📊</button>
        <button class="btn-ghost" data-a="explorer">🗺️</button>
      </div>
    </header>

    <p class="section-title">Modo de juego</p>
    <div class="mode-grid">
      <div class="mode-card ${f ? 'active' : ''}" data-a="mode" data-v="flags">
        <span class="icon">🚩</span><h3>Banderas</h3><p>Identificá países por su bandera</p>
      </div>
      <div class="mode-card ${c ? 'active' : ''}" data-a="mode" data-v="capitals">
        <span class="icon">🏙️</span><h3>Capitales</h3><p>Adiviná capitales del mundo</p>
      </div>
    </div>

    ${c ? `
    <p class="section-title">Dirección</p>
    <div class="option-row">
      <button class="tog-btn ${S.capDir === 'toCapital' ? 'active' : ''}" data-a="capdir" data-v="toCapital">
        🗺️ País → Capital
      </button>
      <button class="tog-btn ${S.capDir === 'toCountry' ? 'active' : ''}" data-a="capdir" data-v="toCountry">
        🏛️ Capital → País
      </button>
    </div>` : ''}

    <p class="section-title">Dificultad</p>
    <div class="option-row">
      <button class="tog-btn ${S.difficulty === 'easy' ? 'active' : ''}" data-a="diff" data-v="easy">
        😊 Fácil<span class="sub">Países conocidos</span>
      </button>
      <button class="tog-btn ${S.difficulty === 'hard' ? 'active' : ''}" data-a="diff" data-v="hard">
        💀 Difícil<span class="sub">Micronaciones</span>
      </button>
      <button class="tog-btn ${S.difficulty === 'all' ? 'active' : ''}" data-a="diff" data-v="all">
        🌎 Todo<span class="sub">Sin filtro</span>
      </button>
    </div>

    <p class="section-title">Estilo</p>
    <div class="option-row">
      <button class="tog-btn ${S.gameStyle === 'normal' ? 'active' : ''}" data-a="style" data-v="normal">
        🎯 Normal<span class="sub">Sin límite</span>
      </button>
      <button class="tog-btn ${S.gameStyle === 'timed' ? 'active' : ''}" data-a="style" data-v="timed">
        ⏱️ Contrarreloj<span class="sub">60 segundos</span>
      </button>
      <button class="tog-btn ${S.gameStyle === 'streak' ? 'active' : ''}" data-a="style" data-v="streak">
        💥 Racha<span class="sub">Un error y fin</span>
      </button>
    </div>

    <p class="section-title">Región</p>
    <div class="region-filter">${regionBtns}</div>

    <p class="section-title">Tipo de respuesta</p>
    <div class="option-row">
      <button class="tog-btn ${S.inputType === 'multiple' ? 'active' : ''}" data-a="input" data-v="multiple">
        🔘 Múltiple opción
      </button>
      <button class="tog-btn ${S.inputType === 'select' ? 'active' : ''}" data-a="input" data-v="select">
        📋 Seleccionar
      </button>
    </div>

    <button class="btn-play" data-a="play">▶ JUGAR</button>
    <button class="btn-explorer" data-a="explorer">🗺️ Explorador de países</button>
  </div>`;
}

// ── Render: Game ──────────────────────────────────────────────────────────────
function renderGame() {
  const q = S.question;
  if (!q) { renderHome(); return; }

  const isCorrect = S.answered &&
    S.selectedAnswer?.trim().toLowerCase() === q.answer.trim().toLowerCase();

  // Timer strip
  const pct0 = (S.timeLeft / 60) * 100;
  const barColor0 = pct0 > 40 ? 'linear-gradient(90deg,#6366f1,#22c55e)' : pct0 > 20 ? '#f59e0b' : '#ef4444';
  const timerHTML = S.gameStyle === 'timed' ? `
  <div class="timer-wrap">
    <div class="timer-top">
      <span>⏱️ <span id="ff-timer" class="timer-num">${S.timeLeft}s</span></span>
      <span class="timer-pts">✅ <strong>${S.score}</strong> correctas</span>
    </div>
    <div class="timer-bar-bg">
      <div id="ff-timer-bar" class="timer-bar" style="width:${pct0}%;background:${barColor0}"></div>
    </div>
  </div>` : '';

  // Answer UI
  let answerHTML = '';
  if (S.inputType === 'multiple') {
    const btns = q.options.map((opt, i) => {
      let cls = 'opt-btn';
      if (S.answered) {
        if (opt === q.answer)              cls += ' correct';
        else if (opt === S.selectedAnswer) cls += ' wrong';
        else                               cls += ' dim';
      }
      return `<button class="${cls}" data-a="answerIdx" data-v="${i}" ${S.answered ? 'disabled' : ''}>${esc(opt)}</button>`;
    }).join('');
    answerHTML = `<div class="opts-grid">${btns}</div>`;
  } else {
    const opts =
      S.gameMode === 'flags' || S.capDir === 'toCountry'
        ? countries.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')
        : [...new Set(countries.filter(c => c.capital).map(c => c.capital))].sort()
            .map(cap => `<option value="${esc(cap)}">${esc(cap)}</option>`).join('');
    answerHTML = `
    <div class="sel-wrap">
      <select id="sel" class="answer-sel" ${S.answered ? 'disabled' : ''}>
        <option value="" disabled selected>Seleccioná una opción…</option>${opts}
      </select>
      <button class="btn-confirm" data-a="confirm" ${S.answered ? 'disabled' : ''}>Confirmar</button>
    </div>`;
  }

  const diffLabel  = S.difficulty === 'easy' ? 'Fácil' : S.difficulty === 'hard' ? 'Difícil' : 'Todo';
  const styleLabel = S.gameStyle === 'timed' ? ' ⏱️' : S.gameStyle === 'streak' ? ' 💥' : '';
  const modeLabel  = S.gameMode === 'flags'
    ? `Banderas ${diffLabel}${styleLabel}`
    : `Capitales${styleLabel}`;

  app().innerHTML = `
  <div class="screen game-screen">
    <div class="game-header">
      <button class="btn-ghost" data-a="home">← Volver</button>
      <span class="mode-tag">${modeLabel}</span>
      <div class="score-bar">
        ${S.gameStyle !== 'timed' ? `<span class="score-pill c">✅ ${S.score}</span><span class="score-pill w">❌ ${S.wrong}</span>` : ''}
        ${S.streak >= 2 ? `<span class="score-pill s">🔥 ${S.streak}</span>` : ''}
      </div>
    </div>

    ${timerHTML}
    <p class="q-label">${q.label}</p>

    ${q.questionType === 'flag'
      ? `<div class="flag-wrap"><img src="${esc(q.country.flag)}" alt="Bandera" class="flag-img"/></div>`
      : `<div class="text-q-wrap"><p class="text-q">${esc(q.questionText)}</p></div>`}

    ${answerHTML}

    ${S.answered ? `
    <div class="feedback ${isCorrect ? 'fb-ok' : 'fb-err'}">
      ${isCorrect ? '✅ ¡Correcto!' : `❌ Era: <strong>${esc(q.answer)}</strong>`}
    </div>
    ${S.gameStyle !== 'streak' ? `<button class="btn-next" data-a="next">Siguiente →</button>` : ''}
    ` : ''}
  </div>`;
}

// ── Render: Game Over ─────────────────────────────────────────────────────────
function renderGameOver() {
  let emoji, title, mainStat, record, isNewRecord;

  if (S.gameStyle === 'timed') {
    const k = statKey();
    const prev = getStats()[k]?.bestScore ?? 0;
    isNewRecord = S.score > prev;
    recordTimedEnd(S.score);
    emoji    = S.score >= 20 ? '🏆' : S.score >= 10 ? '🎉' : '⏱️';
    title    = '¡Se acabó el tiempo!';
    mainStat = `${S.score} ${S.score === 1 ? 'respuesta correcta' : 'respuestas correctas'}`;
    record   = isNewRecord && S.score > 0 ? '🏆 ¡Nuevo récord!' : `Récord: ${Math.max(prev, S.score)}`;
  } else {
    const k = statKey();
    const prev = getStats()[k]?.bestStreak ?? 0;
    isNewRecord = S.score > prev;
    recordStreakEnd(S.score);
    emoji    = S.score >= 20 ? '🔥' : S.score >= 10 ? '💪' : '💥';
    title    = 'Game Over';
    mainStat = `Racha: ${S.score} ${S.score === 1 ? 'acierto' : 'aciertos'}`;
    record   = isNewRecord && S.score > 0 ? '🏆 ¡Nuevo récord!' : `Tu mejor racha: ${Math.max(prev, S.score)}`;
  }

  app().innerHTML = `
  <div class="screen game-over-screen">
    <div class="go-inner">
      <div class="go-emoji">${emoji}</div>
      <h1 class="go-title">${title}</h1>
      <p class="go-score">${mainStat}</p>
      <p class="go-record ${isNewRecord && S.score > 0 ? 'new' : ''}">${record}</p>
      <div class="go-btns">
        <button class="btn-play" data-a="play-again">▶ Jugar de nuevo</button>
        <button class="btn-next" style="margin-top:0" data-a="home">← Menú principal</button>
      </div>
    </div>
  </div>`;
}

// ── Render: Stats ─────────────────────────────────────────────────────────────
const STAT_LABELS = {
  'flags_easy_multiple':'🚩 Fácil · Múltiple','flags_easy_select':'🚩 Fácil · Seleccionar',
  'flags_hard_multiple':'💀 Difícil · Múltiple','flags_hard_select':'💀 Difícil · Seleccionar',
  'flags_all_multiple': '🌎 Todo · Múltiple',  'flags_all_select': '🌎 Todo · Seleccionar',
  'flags_easy_timed':   '🚩 Fácil · ⏱️','flags_hard_timed':'💀 Difícil · ⏱️','flags_all_timed':'🌎 Todo · ⏱️',
  'flags_easy_multiple_streak':'🚩 Fácil · 💥 · Múltiple','flags_easy_select_streak':'🚩 Fácil · 💥 · Seleccionar',
  'flags_hard_multiple_streak':'💀 Difícil · 💥 · Múltiple','flags_hard_select_streak':'💀 Difícil · 💥 · Seleccionar',
  'flags_all_multiple_streak': '🌎 Todo · 💥 · Múltiple',  'flags_all_select_streak': '🌎 Todo · 💥 · Seleccionar',
  'caps_toCapital_multiple':'🏙️ País→Capital · Múltiple','caps_toCapital_select':'🏙️ País→Capital · Seleccionar',
  'caps_toCountry_multiple':'🏛️ Capital→País · Múltiple','caps_toCountry_select':'🏛️ Capital→País · Seleccionar',
  'caps_toCapital_timed':'🏙️ País→Capital · ⏱️','caps_toCountry_timed':'🏛️ Capital→País · ⏱️',
  'caps_toCapital_multiple_streak':'🏙️ País→Capital · 💥 · Múltiple','caps_toCapital_select_streak':'🏙️ País→Capital · 💥 · Seleccionar',
  'caps_toCountry_multiple_streak':'🏛️ Capital→País · 💥 · Múltiple','caps_toCountry_select_streak':'🏛️ Capital→País · 💥 · Seleccionar',
};

function renderStats() {
  const stats = getStats();
  const keys  = Object.keys(stats);

  if (!keys.length) {
    app().innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn-ghost" data-a="home">← Volver</button>
        <h2 style="font-size:1.1rem;font-weight:800">📊 Estadísticas</h2><span></span>
      </header>
      <div class="empty">🎮 Jugá algunas partidas para ver tus estadísticas acá.</div>
    </div>`; return;
  }

  const groups = [
    { title: '🎯 Modo Normal',  filter: k => !k.includes('_timed') && !k.includes('_streak') },
    { title: '⏱️ Contrarreloj', filter: k =>  k.includes('_timed') },
    { title: '💥 Racha Máxima', filter: k =>  k.includes('_streak') },
  ];

  const groupsHTML = groups.map(g => {
    const gKeys = keys.filter(g.filter);
    if (!gKeys.length) return '';
    const cards = gKeys.map(k => {
      const s = stats[k], label = STAT_LABELS[k] || k;
      if (k.includes('_timed')) return `
        <div class="stat-card">
          <h3>${label}</h3>
          <div class="stat-nums">
            <span class="sn a">🏆 Récord: ${s.bestScore}</span>
            <span class="sn" style="color:var(--muted)">Jugado: ${s.played}x</span>
          </div>
        </div>`;
      if (k.includes('_streak')) return `
        <div class="stat-card">
          <h3>${label}</h3>
          <div class="stat-nums">
            <span class="sn st">🔥 Mejor racha: ${s.bestStreak}</span>
            <span class="sn" style="color:var(--muted)">Jugado: ${s.played}x</span>
          </div>
        </div>`;
      const total = s.correct + s.wrong, pct = total ? Math.round(s.correct / total * 100) : 0;
      return `
      <div class="stat-card">
        <h3>${label}</h3>
        <div class="stat-nums">
          <span class="sn c">✅ ${s.correct}</span>
          <span class="sn w">❌ ${s.wrong}</span>
          <span class="sn a">🎯 ${pct}%</span>
          <span class="sn st">🔥 ${s.bestStreak}</span>
        </div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    return `<p class="section-title" style="margin-top:16px">${g.title}</p>${cards}`;
  }).join('');

  app().innerHTML = `
  <div class="screen">
    <header class="app-header">
      <button class="btn-ghost" data-a="home">← Volver</button>
      <h2 style="font-size:1.1rem;font-weight:800">📊 Estadísticas</h2>
      <button class="btn-ghost danger" data-a="clearstats">🗑️ Borrar</button>
    </header>
    <div class="stats-wrap">${groupsHTML}</div>
  </div>`;
}

// ── Render: Explorer ──────────────────────────────────────────────────────────
function renderExplorer() {
  const disc     = getDiscovered();
  const filtered = S.explorerRegion === 'all'
    ? [...countries]
    : countries.filter(c => c.region === REGION_MAP[S.explorerRegion]);

  const total      = filtered.length;
  const discovered = filtered.filter(c => disc.has(c.code)).length;
  const pct        = total ? Math.round(discovered / total * 100) : 0;

  const regionBtns = Object.entries(REGION_LABELS).map(([k, lbl]) =>
    `<button class="region-btn ${S.explorerRegion === k ? 'active' : ''}" data-a="exp-region" data-v="${k}">${lbl}</button>`
  ).join('');

  const cards = filtered.map(c => {
    const found = disc.has(c.code);
    return `
    <div class="exp-card ${found ? 'found' : ''}">
      ${found ? '<span class="exp-badge">✓</span>' : ''}
      <img src="${esc(c.flag)}" alt="${esc(c.name)}" loading="lazy"/>
      <p class="exp-name">${esc(c.name)}</p>
      <p class="exp-cap">${esc(c.capital || '—')}</p>
    </div>`;
  }).join('');

  app().innerHTML = `
  <div class="screen explorer-screen">
    <header class="app-header">
      <button class="btn-ghost" data-a="home">← Volver</button>
      <h2 style="font-size:1rem;font-weight:800">🗺️ Explorador</h2>
      <button class="btn-ghost danger" style="font-size:.75rem" data-a="cleardisc">🗑️ Reset</button>
    </header>

    <div class="prog-overview">
      <div style="display:flex;justify-content:space-between;margin-bottom:7px">
        <span style="font-size:.85rem;font-weight:700">${discovered} / ${total} países descubiertos</span>
        <span style="font-size:.85rem;font-weight:800;color:var(--accent)">${pct}%</span>
      </div>
      <div class="prog-bar" style="height:8px">
        <div class="prog-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div class="region-filter" style="margin:12px 0 4px">${regionBtns}</div>
    <div class="explorer-grid">${cards}</div>
  </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    countries = await loadData();
    renderHome();
  } catch {
    app().innerHTML = `
    <div class="loading-screen">
      <p style="color:#ef4444;text-align:center;max-width:280px">
        ❌ Error al cargar datos.<br/>Verificá tu conexión.
      </p>
      <button onclick="location.reload()"
        style="margin-top:18px;padding:11px 24px;background:#6366f1;color:#fff;
               border:none;border-radius:10px;cursor:pointer;font-weight:700">
        Reintentar
      </button>
    </div>`;
  }
})();
