'use strict';

const API_URL =
  'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2,region,population';

// ── Well-known countries → "easy" flag pool ──────────────────────────────────
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

// ── State ────────────────────────────────────────────────────────────────────
const S = {
  gameMode:  'flags',      // 'flags' | 'capitals'
  difficulty:'easy',       // 'easy'  | 'hard'
  inputType: 'multiple',   // 'multiple' | 'select'
  capDir:    'toCapital',  // 'toCapital' | 'toCountry'
  score: 0, wrong: 0, streak: 0,
  question: null, answered: false, selectedAnswer: null,
};

let countries = [];

// ── Utilities ────────────────────────────────────────────────────────────────
const app = () => document.getElementById('app');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rand(arr, n = 1) {
  const copy = [...arr];
  const out  = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return n === 1 ? out[0] : out;
}

// ── Storage ──────────────────────────────────────────────────────────────────
function getStats() {
  try { return JSON.parse(localStorage.getItem('ff_stats') || '{}'); }
  catch { return {}; }
}

function statKey() {
  return S.gameMode === 'flags'
    ? `flags_${S.difficulty}_${S.inputType}`
    : `caps_${S.capDir}_${S.inputType}`;
}

function recordStat(correct) {
  const stats = getStats();
  const k     = statKey();
  if (!stats[k]) stats[k] = { correct: 0, wrong: 0, bestStreak: 0 };
  if (correct) {
    stats[k].correct++;
    if (S.streak > stats[k].bestStreak) stats[k].bestStreak = S.streak;
  } else {
    stats[k].wrong++;
  }
  localStorage.setItem('ff_stats', JSON.stringify(stats));
}

// ── Data ─────────────────────────────────────────────────────────────────────
async function loadData() {
  const cached = sessionStorage.getItem('ff_countries');
  if (cached) return JSON.parse(cached);

  const res  = await fetch(API_URL);
  const raw  = await res.json();
  const data = raw
    .filter(c => c.name?.common && c.flags?.svg && c.cca2)
    .map(c => ({
      code:    c.cca2,
      name:    c.name.common,
      capital: c.capital?.[0] ?? null,
      flag:    c.flags.svg,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  sessionStorage.setItem('ff_countries', JSON.stringify(data));
  return data;
}

function buildPool() {
  if (S.gameMode === 'flags') {
    const pool = S.difficulty === 'easy'
      ? countries.filter(c => EASY.has(c.code))
      : countries.filter(c => !EASY.has(c.code));
    return pool.length >= 4 ? pool : countries;
  }
  const withCap = countries.filter(c => c.capital);
  const pool    = S.difficulty === 'easy'
    ? withCap.filter(c => EASY.has(c.code))
    : withCap.filter(c => !EASY.has(c.code));
  return pool.length >= 4 ? pool : withCap;
}

// ── Question generation ───────────────────────────────────────────────────────
function makeQuestion() {
  const pool    = buildPool();
  const country = rand(pool);

  let label, questionType, questionText, answer;

  if (S.gameMode === 'flags') {
    label        = '¿De qué país es esta bandera?';
    questionType = 'flag';
    answer       = country.name;
  } else if (S.capDir === 'toCapital') {
    label        = '¿Cuál es la capital de…';
    questionType = 'text';
    questionText = country.name;
    answer       = country.capital;
  } else {
    label        = '¿En qué país se encuentra esta capital?';
    questionType = 'text';
    questionText = country.capital;
    answer       = country.name;
  }

  let options = null;
  if (S.inputType === 'multiple') {
    const others = pool.filter(c => c.code !== country.code);

    let wrongPool = S.gameMode === 'capitals' && S.capDir === 'toCapital'
      ? others.filter(c => c.capital && c.capital !== answer)
      : others;

    if (wrongPool.length < 3) {
      const fallback = countries.filter(c => c.code !== country.code);
      wrongPool = S.gameMode === 'capitals' && S.capDir === 'toCapital'
        ? fallback.filter(c => c.capital && c.capital !== answer)
        : fallback;
    }

    const wrongs = rand(wrongPool, 3).map(c =>
      S.gameMode === 'flags' || S.capDir === 'toCountry' ? c.name : c.capital
    );

    options = [...wrongs, answer].sort(() => Math.random() - .5);
  }

  return { country, label, questionType, questionText, answer, options };
}

// ── Answer submission ─────────────────────────────────────────────────────────
function submitAnswer(answer) {
  if (S.answered) return;
  const correct =
    answer.trim().toLowerCase() === S.question.answer.trim().toLowerCase();
  S.answered       = true;
  S.selectedAnswer = answer;
  if (correct) { S.score++;  S.streak++; }
  else         { S.wrong++;  S.streak = 0; }
  recordStat(correct);
  renderGame();
}

function confirmSelect() {
  const sel = document.getElementById('sel');
  if (sel?.value) submitAnswer(sel.value);
}

// ── Event delegation ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const action = el.dataset.a;
  const val    = el.dataset.v;

  switch (action) {
    case 'mode':    S.gameMode  = val; renderHome(); break;
    case 'diff':    S.difficulty = val; renderHome(); break;
    case 'input':   S.inputType  = val; renderHome(); break;
    case 'capdir':  S.capDir     = val; renderHome(); break;

    case 'play':
      S.score = 0; S.wrong = 0; S.streak = 0;
      S.answered = false; S.selectedAnswer = null;
      S.question = makeQuestion();
      renderGame();
      break;

    case 'answerIdx':
      if (!S.answered) submitAnswer(S.question.options[+val]);
      break;

    case 'confirm': confirmSelect(); break;

    case 'next':
      S.answered = false; S.selectedAnswer = null;
      S.question = makeQuestion();
      renderGame();
      break;

    case 'home':       renderHome();  break;
    case 'stats':      renderStats(); break;

    case 'clearstats':
      if (confirm('¿Borrar todas las estadísticas?')) {
        localStorage.removeItem('ff_stats');
        renderStats();
      }
      break;
  }
});

// ── Render: Home ──────────────────────────────────────────────────────────────
function renderHome() {
  const f = S.gameMode === 'flags';
  const c = S.gameMode === 'capitals';

  app().innerHTML = `
  <div class="screen">
    <header class="app-header">
      <h1 class="logo">🌍 FunFlags</h1>
      <button class="btn-ghost" data-a="stats">📊 Stats</button>
    </header>

    <p class="section-title">Modo de juego</p>
    <div class="mode-grid">
      <div class="mode-card ${f ? 'active' : ''}" data-a="mode" data-v="flags">
        <span class="icon">🚩</span>
        <h3>Banderas</h3>
        <p>Identificá países por su bandera</p>
      </div>
      <div class="mode-card ${c ? 'active' : ''}" data-a="mode" data-v="capitals">
        <span class="icon">🏙️</span>
        <h3>Capitales</h3>
        <p>Adiviná capitales del mundo</p>
      </div>
    </div>

    ${f ? `
    <p class="section-title">Dificultad</p>
    <div class="option-row">
      <button class="tog-btn ${S.difficulty === 'easy' ? 'active' : ''}" data-a="diff" data-v="easy">
        😊 Fácil <span class="sub">Países conocidos (~130)</span>
      </button>
      <button class="tog-btn ${S.difficulty === 'hard' ? 'active' : ''}" data-a="diff" data-v="hard">
        💀 Difícil <span class="sub">Micronaciones y territorios</span>
      </button>
    </div>
    ` : ''}

    ${c ? `
    <p class="section-title">Dirección</p>
    <div class="option-row">
      <button class="tog-btn ${S.capDir === 'toCapital' ? 'active' : ''}" data-a="capdir" data-v="toCapital">
        🗺️ País → Capital
      </button>
      <button class="tog-btn ${S.capDir === 'toCountry' ? 'active' : ''}" data-a="capdir" data-v="toCountry">
        🏛️ Capital → País
      </button>
    </div>
    ` : ''}

    <p class="section-title">Tipo de respuesta</p>
    <div class="option-row">
      <button class="tog-btn ${S.inputType === 'multiple' ? 'active' : ''}" data-a="input" data-v="multiple">
        🔘 Múltiple opción
      </button>
      <button class="tog-btn ${S.inputType === 'select' ? 'active' : ''}" data-a="input" data-v="select">
        📋 Seleccionar de lista
      </button>
    </div>

    <button class="btn-play" data-a="play">▶ JUGAR</button>
  </div>`;
}

// ── Render: Game ──────────────────────────────────────────────────────────────
function renderGame() {
  const q = S.question;
  if (!q) { renderHome(); return; }

  const isCorrect = S.answered &&
    S.selectedAnswer?.trim().toLowerCase() === q.answer.trim().toLowerCase();

  // Answer UI
  let answerHTML = '';
  if (S.inputType === 'multiple') {
    const btns = q.options.map((opt, i) => {
      let cls = 'opt-btn';
      if (S.answered) {
        if (opt === q.answer)           cls += ' correct';
        else if (opt === S.selectedAnswer) cls += ' wrong';
        else                            cls += ' dim';
      }
      return `<button class="${cls}" data-a="answerIdx" data-v="${i}"
        ${S.answered ? 'disabled' : ''}>${esc(opt)}</button>`;
    }).join('');
    answerHTML = `<div class="opts-grid">${btns}</div>`;
  } else {
    let opts = '';
    if (S.gameMode === 'flags' || S.capDir === 'toCountry') {
      opts = countries
        .map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`)
        .join('');
    } else {
      const caps = [...new Set(
        countries.filter(c => c.capital).map(c => c.capital)
      )].sort((a, b) => a.localeCompare(b));
      opts = caps
        .map(cap => `<option value="${esc(cap)}">${esc(cap)}</option>`)
        .join('');
    }
    answerHTML = `
    <div class="sel-wrap">
      <select id="sel" class="answer-sel" ${S.answered ? 'disabled' : ''}>
        <option value="" disabled selected>Seleccioná una opción…</option>
        ${opts}
      </select>
      <button class="btn-confirm" data-a="confirm" ${S.answered ? 'disabled' : ''}>
        Confirmar
      </button>
    </div>`;
  }

  const modeLabel = S.gameMode === 'flags'
    ? `Banderas ${S.difficulty === 'easy' ? 'Fácil' : 'Difícil'}`
    : `Capitales ${S.capDir === 'toCapital' ? 'País→Capital' : 'Capital→País'}`;

  app().innerHTML = `
  <div class="screen game-screen">
    <div class="game-header">
      <button class="btn-ghost" data-a="home">← Volver</button>
      <span class="mode-tag">${modeLabel}</span>
      <div class="score-bar">
        <span class="score-pill c">✅ ${S.score}</span>
        <span class="score-pill w">❌ ${S.wrong}</span>
        ${S.streak >= 2 ? `<span class="score-pill s">🔥 ${S.streak}</span>` : ''}
      </div>
    </div>

    <p class="q-label">${q.label}</p>

    ${q.questionType === 'flag' ? `
    <div class="flag-wrap">
      <img src="${esc(q.country.flag)}" alt="Bandera" class="flag-img" />
    </div>
    ` : `
    <div class="text-q-wrap">
      <p class="text-q">${esc(q.questionText)}</p>
    </div>
    `}

    ${answerHTML}

    ${S.answered ? `
    <div class="feedback ${isCorrect ? 'fb-ok' : 'fb-err'}">
      ${isCorrect
        ? '✅ ¡Correcto!'
        : `❌ La respuesta era: <strong>${esc(q.answer)}</strong>`}
    </div>
    <button class="btn-next" data-a="next">Siguiente →</button>
    ` : ''}
  </div>`;
}

// ── Render: Stats ─────────────────────────────────────────────────────────────
function renderStats() {
  const stats = getStats();

  const LABELS = {
    flags_easy_multiple:  '🚩 Banderas Fácil — Múltiple opción',
    flags_easy_select:    '🚩 Banderas Fácil — Seleccionar',
    flags_hard_multiple:  '💀 Banderas Difícil — Múltiple opción',
    flags_hard_select:    '💀 Banderas Difícil — Seleccionar',
    caps_toCapital_multiple: '🏙️ País → Capital — Múltiple opción',
    caps_toCapital_select:   '🏙️ País → Capital — Seleccionar',
    caps_toCountry_multiple: '🏛️ Capital → País — Múltiple opción',
    caps_toCountry_select:   '🏛️ Capital → País — Seleccionar',
  };

  const rows = Object.entries(LABELS).map(([k, label]) => {
    const s = stats[k];
    if (!s) return '';
    const total = s.correct + s.wrong;
    const pct   = total ? Math.round(s.correct / total * 100) : 0;
    return `
    <div class="stat-card">
      <h3>${label}</h3>
      <div class="stat-nums">
        <span class="sn c">✅ ${s.correct} aciertos</span>
        <span class="sn w">❌ ${s.wrong} errores</span>
        <span class="sn a">🎯 ${pct}%</span>
        <span class="sn st">🔥 Mejor racha: ${s.bestStreak}</span>
      </div>
      <div class="prog-bar">
        <div class="prog-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).filter(Boolean).join('');

  app().innerHTML = `
  <div class="screen">
    <header class="app-header">
      <button class="btn-ghost" data-a="home">← Volver</button>
      <h2 style="font-size:1.1rem;font-weight:800">📊 Estadísticas</h2>
      <button class="btn-ghost danger" data-a="clearstats">🗑️ Borrar</button>
    </header>
    <div class="stats-wrap">
      ${rows || `<div class="empty">
        🎮 Jugá algunas partidas para ver tus estadísticas acá.<br/>
        <small style="color:#64748b">Los datos se guardan en tu navegador.</small>
      </div>`}
    </div>
  </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    countries = await loadData();
    renderHome();
  } catch (err) {
    app().innerHTML = `
    <div class="loading-screen">
      <p style="color:#ef4444;text-align:center;max-width:300px">
        ❌ Error al cargar datos.<br/>Verificá tu conexión e intentá de nuevo.
      </p>
      <button onclick="location.reload()"
        style="margin-top:18px;padding:11px 22px;background:#6366f1;color:#fff;
               border:none;border-radius:10px;cursor:pointer;font-weight:700">
        Reintentar
      </button>
    </div>`;
  }
})();
