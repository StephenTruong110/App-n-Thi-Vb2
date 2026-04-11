/* ================================================================
   app.js  — PRACTICE MODE
   (original code + difficulty filter + mode switch integration)
================================================================ */

/* ── STATE ── */
let questions   = [];
let userAnswers = [];
let current     = 0;
let answered    = false;
let selectedIdx = -1;
let solTab      = 'giai';

let totalDone  = 0;
let totalRight = 0;
let totalWrong = 0;
let grades     = [];

const LETTERS = ['A','B','C','D','E','F'];
const DIFF_LABEL = { 1:'Dễ', 2:'Trung bình', 3:'Khó' };
const DIFF_CLASS = { 1:'diff-1', 2:'diff-2', 3:'diff-3' };

/* ================================================================
   MODE SWITCH
================================================================ */
function switchMode(mode) {
  if (mode === 'exam') {
    // Delegate to exam.js
    document.getElementById('btn-mode-practice').classList.remove('active');
    document.getElementById('btn-mode-exam').classList.add('active');
    initExamMode();
    return;
  }
  // Practice mode
  document.getElementById('btn-mode-practice').classList.add('active');
  document.getElementById('btn-mode-exam').classList.remove('active');
  showScreen('screen-practice');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.classList.add('active');
  el.style.display = (id === 'screen-exam') ? 'flex' : 'block';
}

/* ================================================================
   SAVE / LOAD PROGRESS (practice)
================================================================ */
function saveProgress() {
  localStorage.setItem('vb2_exam', JSON.stringify({
    questions, current, userAnswers, grades,
    totalDone, totalRight, totalWrong
  }));
}

function loadProgress() {
  const raw = localStorage.getItem('vb2_exam');
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    // Only restore if it's practice data (not exam data which has different shape)
    if (p.examQuestions) return false; // skip exam data
    questions   = p.questions   || [];
    current     = p.current     || 0;
    userAnswers = p.userAnswers || [];
    grades      = p.grades      || [];
    totalDone   = p.totalDone   || 0;
    totalRight  = p.totalRight  || 0;
    totalWrong  = p.totalWrong  || 0;
    normalizeArrays();
    recomputeTotals();
    return true;
  } catch { return false; }
}

function normalizeArrays() {
  if (!Array.isArray(userAnswers)) userAnswers = [];
  if (!Array.isArray(grades))      grades = [];
  if (questions.length) {
    if (userAnswers.length !== questions.length)
      userAnswers = Array(questions.length).fill(-1).map((v,i) => userAnswers[i] ?? -1);
    if (grades.length !== questions.length)
      grades = Array(questions.length).fill(null).map((v,i) => grades[i] ?? null);
  }
}

function recomputeTotals() {
  totalDone = totalRight = totalWrong = 0;
  for (const g of grades) {
    if (g !== true && g !== false) continue;
    totalDone++;
    if (g === true) totalRight++; else totalWrong++;
  }
}

/* ================================================================
   LOAD DATA
================================================================ */
async function loadData() {
  const type = document.getElementById('type').value;
  const diff = document.getElementById('diff-filter').value;
  showSpinner();

  try {
    const res = await fetch('data/' + type + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let data = await res.json();

    // Filter by difficulty
    if (diff !== 'all') {
      data = data.filter(q => String(q.difficulty) === diff);
      if (!data.length) {
        showError('Không có câu nào ở mức độ <b>' + ({'1':'Dễ','2':'Trung bình','3':'Khó'}[diff]) + '</b> cho chủ đề này.');
        return;
      }
    }

    questions   = shuffleArr(data);
    current     = 0; answered = false; selectedIdx = -1; solTab = 'giai';
    userAnswers = Array(questions.length).fill(-1);
    grades      = Array(questions.length).fill(null);
    totalDone = totalRight = totalWrong = 0;
    saveProgress();
    renderQ();
  } catch(e) {
    showError('Không tải được file <b>' + type + '.json</b>.<br>Hãy mở qua web server (Live Server hoặc <code>python -m http.server</code>).');
  }
}

/* ================================================================
   RENDER QUESTION
================================================================ */
function renderQ() {
  if (!questions.length) { showError('Không có câu hỏi.'); return; }
  normalizeArrays(); recomputeTotals();

  const q    = questions[current];
  solTab     = 'giai';
  selectedIdx = userAnswers[current] ?? -1;
  answered   = grades[current] === true || grades[current] === false;
  updateStats();

  const optsHtml = q.options.map((opt, i) => `
    <button class="opt-btn" id="opt-${i}" data-idx="${i}" onclick="pick(${i})">
      <div class="opt-letter">${LETTERS[i]}</div>
      <div class="opt-text" id="otext-${i}">${opt}</div>
    </button>`).join('');

  const matrixHtml = q.matrix ? renderMatrix(q.matrix) : '';
  const qText = q.question + (matrixHtml ? '<div style="margin:12px 0">' + matrixHtml + '</div>' : '');
  const diffBadge = q.difficulty ? `<span class="diff-badge ${DIFF_CLASS[q.difficulty]}">${DIFF_LABEL[q.difficulty]}</span>` : '';
  const typeBadge = q.type ? `<span class="type-badge">${q.type}</span>` : '';

  document.getElementById('q-card').innerHTML = `
    <div class="q-meta">
      <span class="badge">Câu ${current + 1}</span>
      ${typeBadge}
      ${diffBadge}
    </div>
    <div class="q-body">
      <div class="q-text" id="qtext">${qText}</div>
      <div class="options" id="opts">${optsHtml}</div>
      <div id="res-area"></div>
      <button class="btn" style="margin-top:14px;width:100%;" onclick="showAnswer()">Xem đáp án</button>
    </div>
    <div id="sol-wrap" style="display:none">
      <div class="sol-wrap">
        <div class="sol-tabs">
          <button class="sol-tab active" data-t="giai"  onclick="switchTab('giai')">Giải nhanh</button>
          <button class="sol-tab"        data-t="day"   onclick="switchTab('day')">Giải chi tiết</button>
          <button class="sol-tab"        data-t="nhanh" onclick="switchTab('nhanh')">💡 Mẹo</button>
          <button class="sol-tab"        data-t="casio" onclick="switchTab('casio')">🖩 CASIO</button>
        </div>
        <div class="sol-content" id="sol-content">${getSolHtml('giai')}</div>
      </div>
    </div>`;

  if (selectedIdx !== -1) document.getElementById('opt-' + selectedIdx)?.classList.add('selected');
  if (answered) showAnswer(true);
  typeset('q-card');
}

function renderMatrix(matrix) {
  const rows = matrix.map(r => r.join(' & ')).join(' \\\\ ');
  return '\\[\\begin{pmatrix}' + rows + '\\end{pmatrix}\\]';
}

/* ================================================================
   PICK & SHOW ANSWER
================================================================ */
function pick(idx) {
  if (grades[current] === true || grades[current] === false) return;
  selectedIdx = idx;
  userAnswers[current] = idx;
  document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('opt-' + idx)?.classList.add('selected');
  saveProgress();
}

function showAnswer(renderOnly = false) {
  answered = true;
  const q = questions[current];
  const correctIdx = q.options.indexOf(q.correct);
  const isRight = selectedIdx !== -1 && q.options[selectedIdx] === q.correct;

  // Only count once
  if (grades[current] === null) {
    grades[current] = isRight;
    if (isRight) totalRight++; else totalWrong++;
    totalDone++;
    saveProgress();
  }
  updateStats();

  q.options.forEach((_, i) => {
    const btn = document.getElementById('opt-' + i);
    if (!btn) return;
    btn.disabled = true;
    if (i === correctIdx)
      btn.classList.add(selectedIdx === correctIdx ? 'correct' : 'show-correct');
    else if (i === selectedIdx && !isRight)
      btn.classList.add('wrong');
  });

  document.getElementById('res-area').innerHTML = `
    <div class="result-badge ${isRight ? 'correct' : 'wrong'}">
      <span class="result-icon">${isRight ? '✓' : '✗'}</span>
      <span>${isRight
        ? 'Chính xác!'
        : (selectedIdx === -1
          ? 'Bạn chưa chọn — đáp án đúng: ' + q.correct
          : 'Sai rồi — Đáp án đúng: ' + q.correct)}</span>
    </div>`;

  document.getElementById('sol-wrap').style.display = 'block';
  renderSolContent();
  typeset('q-card');
}

/* ================================================================
   SOLUTION TABS
================================================================ */
function switchTab(tab) {
  solTab = tab;
  document.querySelectorAll('.sol-tab').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
  renderSolContent();
  typeset('sol-content');
}

function renderSolContent() {
  const el = document.getElementById('sol-content');
  if (el) el.innerHTML = getSolHtml(solTab);
}

function getSolHtml(tab) {
  const q = questions[current];
  if (!q) return '';
  if (tab === 'giai')  return '<b>Giải nhanh:</b> '     + (q.quick    || '—');
  if (tab === 'day')   return '<b>Lời giải:</b><br>'     + (q.solution || '—');
  if (tab === 'nhanh') return '<b>💡 Mẹo nhớ:</b><br>'  + (q.quick    || '—');
  if (tab === 'casio') return `<div class="casio-box">🖩 CASIO fx-580VNX\n──────────────────\n${q.casio || 'Không có hướng dẫn CASIO.'}</div>`;
  return '';
}

/* ================================================================
   NAVIGATION
================================================================ */
function goNext() {
  if (!questions.length) return;
  current = (current + 1) % questions.length;
  saveProgress(); renderQ();
}
function goPrev() {
  if (!questions.length) return;
  current = (current - 1 + questions.length) % questions.length;
  saveProgress(); renderQ();
}
function shuffle() {
  if (!questions.length) return;
  questions = shuffleArr(questions);
  current = 0; answered = false; selectedIdx = -1; renderQ();
}
function resetData() {
  localStorage.removeItem('vb2_exam');
  location.reload();
}

/* ================================================================
   STATS
================================================================ */
function updateStats() {
  const total = questions.length;
  document.getElementById('s-cur').textContent  = total ? (current+1) + ' / ' + total : '—';
  document.getElementById('s-tot').textContent  = totalDone;
  document.getElementById('s-rig').textContent  = totalRight;
  document.getElementById('s-wro').textContent  = totalWrong;
  document.getElementById('nav-info').textContent = total ? 'Câu ' + (current+1) + ' / ' + total : '—';
  const pct = total ? (current / total * 100).toFixed(0) : 0;
  document.getElementById('prog').style.width = pct + '%';
}

/* ================================================================
   MATHJAX
================================================================ */
function typeset(containerId) {
  if (!window.MathJax || !MathJax.typesetPromise) return;
  const el = containerId ? document.getElementById(containerId) : document.body;
  if (el) MathJax.typesetPromise([el]).catch(() => {});
}

/* ================================================================
   SPINNER / ERROR
================================================================ */
function showSpinner() {
  document.getElementById('q-card').innerHTML =
    '<div class="center-box"><div class="spinner"></div><p>Đang tải dữ liệu...</p></div>';
}
function showError(msg) {
  document.getElementById('q-card').innerHTML =
    `<div class="center-box"><p style="font-size:32px;margin-bottom:10px">⚠️</p><p style="color:#dc2626;font-weight:600;margin-bottom:8px">Không tải được dữ liệu</p><p style="color:#6b7090;font-size:13px">${msg}</p></div>`;
}

/* ================================================================
   UTILS
================================================================ */
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ================================================================
   KEYBOARD SHORTCUTS (practice)
================================================================ */
document.addEventListener('keydown', e => {
  // Only active on practice screen
  if (!document.getElementById('screen-practice').classList.contains('active')) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  const map = {
    ArrowRight:'next', n:'next', ArrowLeft:'prev', p:'prev',
    a:'0', b:'1', c:'2', d:'3', A:'0', B:'1', C:'2', D:'3',
    Enter:'answer', ' ':'answer'
  };
  const act = map[e.key];
  if (!act) return;
  e.preventDefault();
  if (act === 'next')   goNext();
  else if (act === 'prev')   goPrev();
  else if (act === 'answer') showAnswer();
  else pick(parseInt(act));
});

/* ================================================================
   COUNTDOWN
================================================================ */
function updateCountdown() {
  const examDate = new Date('2026-09-20T00:00:00');
  const diff = examDate - new Date();
  const el = document.getElementById('countdown');
  if (!el) return;
  if (diff <= 0) { el.innerHTML = '🔥 Hôm nay thi rồi! Chúc bạn may mắn!'; return; }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.innerHTML = `⏳ Còn <b>${d}</b> ngày ${h}h ${m}m ${s}s đến kỳ thi VB2`;
}
updateCountdown();
setInterval(updateCountdown, 1000);

/* ================================================================
   INIT
================================================================ */
window.onload = () => {
  showScreen('screen-practice');
  const ok = loadProgress();
  if (ok && questions.length) renderQ();
  // else: wait for user to click Load
};