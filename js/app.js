/* ================================================================
   app.js  — PRACTICE MODE  v2
   ✅ Dark mode (toggle + system preference + localStorage)
   ✅ Debounce MathJax (dùng chung với exam.js)
   ✅ Random đáp án (chống học tủ)
   ✅ Lưu ngay khi chọn
================================================================ */

/* ── STATE ── */
let questions = [];
let userAnswers = [];
let current = 0;
let answered = false;
let selectedIdx = -1;
let solTab = 'giai';
let totalDone = 0;
let totalRight = 0;
let totalWrong = 0;
let grades = [];
let loadedType = '';
let loadedDiff = 'all';
let practiceViewMode = 'practice';

const PRACTICE_PROGRESS_KEY = 'vb2_practice';
const WRONG_PROGRESS_KEY = 'vb2_wrong_practice';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DIFF_LABEL = { 1: 'Biết', 2: 'Hiểu', 3: 'Vận dụng' };
const DIFF_CLASS = { 1: 'diff-1', 2: 'diff-2', 3: 'diff-3' };

/* ── MATHJAX DEBOUNCE — định nghĩa ở đây, dùng chung cho exam.js ── */
let _mjPending = null;
function typesetDebounced(el, delay) {
  delay = delay || 120;
  if (_mjPending) clearTimeout(_mjPending);
  _mjPending = setTimeout(() => {
    if (!window.MathJax || !MathJax.typesetPromise) return;
    MathJax.typesetPromise([el]).catch(() => { });
  }, delay);
}

/* ================================================================
   DARK MODE
================================================================ */
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('vb2_theme', dark ? 'dark' : 'light');
}

function toggleTheme() {
  applyTheme(!document.documentElement.classList.contains('dark'));
}

function initTheme() {
  const saved = localStorage.getItem('vb2_theme');
  if (saved) { applyTheme(saved === 'dark'); return; }
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/* ================================================================
   MODE SWITCH
================================================================ */
function switchMode(mode) {
  [
    'btn-mode-practice',
    'btn-mode-exam',
    'btn-mode-wrong'
  ].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });

  if (mode === 'exam') {
    document.getElementById('btn-mode-exam')?.classList.add('active');
    initExamMode();
    return;
  }

  if (mode === 'wrong') {
    practiceViewMode = 'wrong';

    document.getElementById('btn-mode-wrong')?.classList.add('active');
    showScreen('screen-practice');
    return;
  }

  // Quay lại luyện theo chủ đề
  practiceViewMode = 'practice';

  document.getElementById('btn-mode-practice')?.classList.add('active');

  if (typeof hideWrongBankControls === 'function') {
    hideWrongBankControls();
  }

  showScreen('screen-practice');

  const restored = restoreProgressFrom(
    PRACTICE_PROGRESS_KEY,
    true
  );

  if (restored) {
    renderQ();
  } else {
    questions = [];
    userAnswers = [];
    grades = [];
    current = 0;
    totalDone = 0;
    totalRight = 0;
    totalWrong = 0;

    updateStats();

    document.getElementById('q-card').innerHTML = `
      <div class="center-box">
        <p>Chọn chủ đề và nhấn Load đề để bắt đầu...</p>
      </div>
    `;
  }
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
function getProgressPayload() {
  return {
    questions,
    current,
    userAnswers,
    grades,
    totalDone,
    totalRight,
    totalWrong,

    // Lưu chuyên đề thực sự đã được Load,
    // không lấy giá trị dropdown vừa đổi nhưng chưa Load
    selectedType:
      loadedType ||
      document.getElementById('type')?.value ||
      '',

    selectedDiff:
      loadedDiff ||
      'all'
  };
}

function saveProgressTo(key) {
  try {
    localStorage.setItem(key, JSON.stringify(getProgressPayload()));
  } catch (e) {
    console.warn('Không thể lưu tiến độ:', e);
  }
}

function saveProgress() {
  const key = practiceViewMode === 'wrong'
    ? WRONG_PROGRESS_KEY
    : PRACTICE_PROGRESS_KEY;

  saveProgressTo(key);
}

function restoreProgressFrom(key, restoreFilters = false) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;

  try {
    const p = JSON.parse(raw);

    questions = Array.isArray(p.questions) ? p.questions : [];
    userAnswers = Array.isArray(p.userAnswers) ? p.userAnswers : [];
    grades = Array.isArray(p.grades) ? p.grades : [];

    totalDone = Number(p.totalDone) || 0;
    totalRight = Number(p.totalRight) || 0;
    totalWrong = Number(p.totalWrong) || 0;

    const savedCurrent = Number(p.current) || 0;
    current = questions.length
      ? Math.min(Math.max(savedCurrent, 0), questions.length - 1)
      : 0;

    if (restoreFilters) {
      loadedType = p.selectedType || '';
      loadedDiff = p.selectedDiff || 'all';

      const typeSelect = document.getElementById('type');
      const diffSelect = document.getElementById('diff-filter');

      if (
        typeSelect &&
        loadedType &&
        [...typeSelect.options].some(
          option => option.value === loadedType
        )
      ) {
        typeSelect.value = loadedType;
      }

      if (
        diffSelect &&
        [...diffSelect.options].some(
          option => option.value === loadedDiff
        )
      ) {
        diffSelect.value = loadedDiff;
      }
    }

    normalizeArrays();
    recomputeTotals();

    return questions.length > 0;
  } catch (e) {
    console.warn('Không thể khôi phục tiến độ:', e);
    return false;
  }
}

function loadProgress() {
  practiceViewMode = 'practice';
  return restoreProgressFrom(PRACTICE_PROGRESS_KEY, true);
}

function normalizeArrays() {
  if (!Array.isArray(userAnswers)) userAnswers = [];
  if (!Array.isArray(grades)) grades = [];
  if (!questions.length) return;
  if (userAnswers.length !== questions.length)
    userAnswers = Array(questions.length).fill(-1).map((v, i) => userAnswers[i] ?? -1);
  if (grades.length !== questions.length)
    grades = Array(questions.length).fill(null).map((v, i) => grades[i] ?? null);
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
  practiceViewMode = 'practice';
  if (typeof hideWrongBankControls === 'function') hideWrongBankControls();
  const type = document.getElementById('type').value;
  const diff = document.getElementById('diff-filter').value;
  showSpinner();
  try {
    const res = await fetch('data/' + type + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let data = await res.json();

    if (diff !== 'all') {
      data = data.filter(q => String(q.difficulty) === diff);
      if (!data.length) {
        showError('Không có câu nào ở mức <b>' + ({ 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' }[diff]) + '</b>.');
        return;
      }
    }

    // Random đáp án ngay khi load
    questions = shuffleArr(data).map(q =>
      shuffleOptionsForPractice({
        ...q,
        _src: type
      })
    );
    current = 0; answered = false; selectedIdx = -1; solTab = 'giai';
    userAnswers = Array(questions.length).fill(-1);
    grades = Array(questions.length).fill(null);
    totalDone = totalRight = totalWrong = 0;
    loadedType = type;
    loadedDiff = diff;
    saveProgress();
    renderQ();
  } catch (e) {
    showError('Không tải được <b>' + type + '.json</b>.<br>Hãy mở qua web server (Live Server / <code>python -m http.server</code>).');
  }
}

// Giống shuffleOptions trong exam.js nhưng cho practice
function shuffleOptionsForPractice(q) {
  if (!q.options || q.options.length === 0) return q;
  const orig = [...q.options];
  const correct = q.correct;
  const indices = shuffleArr([0, 1, 2, 3].slice(0, orig.length));
  const shuffled = indices.map(i => orig[i]);
  return { ...q, options: shuffled }; // ghi đè options, q.correct vẫn là chuỗi
}

/* ================================================================
   RENDER QUESTION (lazy — chỉ câu hiện tại)
================================================================ */
function renderQ() {
  if (!questions.length) { showError('Không có câu hỏi.'); return; }
  normalizeArrays(); recomputeTotals();

  const q = questions[current];
  solTab = 'giai';
  selectedIdx = userAnswers[current] ?? -1;
  answered = grades[current] === true || grades[current] === false;
  updateStats();

  const matHtml = q.matrix
    ? '<div style="margin:12px 0">\\[\\begin{pmatrix}'
    + q.matrix.map(r => r.join(' & ')).join(' \\\\ ')
    + '\\end{pmatrix}\\]</div>'
    : '';

  const optsHtml = q.options.map((opt, i) => `
    <button class="opt-btn${selectedIdx === i ? ' selected' : ''}" id="opt-${i}" onclick="pick(${i})">
      <div class="opt-letter">${LETTERS[i]}</div>
      <div class="opt-text" id="otext-${i}">${opt}</div>
    </button>`).join('');

  const diffBadge = q.difficulty
    ? `<span class="diff-badge ${DIFF_CLASS[q.difficulty]}">${DIFF_LABEL[q.difficulty]}</span>` : '';
  const typeBadge = q.type ? `<span class="type-badge">${q.type}</span>` : '';

  const card = document.getElementById('q-card');
  card.innerHTML = `
    <div class="q-meta">
      <span class="badge">Câu ${current + 1}</span>
      ${typeBadge}${diffBadge}
    </div>
    <div class="q-body">
      <div class="q-text" id="qtext">${q.question}${matHtml}</div>
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

  if (answered) _renderAnswerUI();
  typesetDebounced(card, 100);
}

/* ================================================================
   PICK ANSWER — lưu NGAY
================================================================ */
function pick(idx) {
  if (grades[current] === true || grades[current] === false) return;
  selectedIdx = idx;
  userAnswers[current] = idx;
  document.querySelectorAll('.opt-btn').forEach((b, i) =>
    b.classList.toggle('selected', i === idx));
  saveProgress(); // lưu ngay
}

function showAnswer() {
  if (answered && grades[current] !== null) {
    _renderAnswerUI();
    return;
  }

  answered = true;

  const q = questions[current];
  const isRight =
    selectedIdx !== -1 &&
    q.options[selectedIdx] === q.correct;

  if (grades[current] === null) {
    grades[current] = isRight;

    if (isRight) {
  totalRight++;

  // Chỉ khi làm đúng trong chế độ luyện câu sai
  // mới xóa câu khỏi ngân hàng
  if (
    practiceViewMode === 'wrong' &&
    q &&
    typeof removeFromWrongBank === 'function'
  ) {
    removeFromWrongBank(q);
  }
} else {
  totalWrong++;

  // Sai ở bất kỳ chế độ nào cũng thêm hoặc cập nhật câu sai
  if (
    q &&
    typeof addToWrongBank === 'function'
  ) {
    const source =
      practiceViewMode === 'wrong'
        ? 'wrong_review'
        : 'practice';

    addToWrongBank(q, source);
  }
}

    totalDone++;
    saveProgress();
  }

  updateStats();
  _renderAnswerUI();

  typesetDebounced(
    document.getElementById('q-card'),
    80
  );
}

function _renderAnswerUI() {
  const q = questions[current];
  const correctIdx = q.options.indexOf(q.correct);
  const isRight = selectedIdx !== -1 && q.options[selectedIdx] === q.correct;

  q.options.forEach((_, i) => {
    const btn = document.getElementById('opt-' + i);
    if (!btn) return;
    btn.disabled = true;
    btn.classList.remove('selected', 'correct', 'wrong', 'show-correct');
    if (i === correctIdx)
      btn.classList.add(selectedIdx === correctIdx ? 'correct' : 'show-correct');
    else if (i === selectedIdx && !isRight)
      btn.classList.add('wrong');
    else if (i === selectedIdx)
      btn.classList.add('selected');
  });

  const resArea = document.getElementById('res-area');
  if (resArea) resArea.innerHTML = `
    <div class="result-badge ${isRight ? 'correct' : 'wrong'}">
      <span class="result-icon">${isRight ? '✓' : '✗'}</span>
      <span>${isRight ? 'Chính xác!' :
      (selectedIdx === -1 ? 'Chưa chọn — đáp án: ' + q.correct
        : 'Sai rồi — Đáp án đúng: ' + q.correct)}</span>
    </div>`;

  const solWrap = document.getElementById('sol-wrap');
  if (solWrap) solWrap.style.display = 'block';
  renderSolContent();
}

/* ================================================================
   SOLUTION TABS
================================================================ */
function switchTab(tab) {
  solTab = tab;
  document.querySelectorAll('.sol-tab').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
  renderSolContent();
  typesetDebounced(document.getElementById('sol-content'), 80);
}

function renderSolContent() {
  const el = document.getElementById('sol-content');
  if (el) el.innerHTML = getSolHtml(solTab);
}

function getSolHtml(tab) {
  const q = questions[current];
  if (!q) return '';
  if (tab === 'giai') return '<b>💡 Giải nhanh:</b><br>' + (q.quick || '—');
  if (tab === 'day') return '<b>📖 Lời giải chi tiết:</b><br>' + (q.solution || '—');
  if (tab === 'nhanh') return '<b>🎯 Mẹo nhớ:</b><br>' + (q.quick || q.solution || '—');
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
  if (typeof hideWrongBankControls === 'function') hideWrongBankControls();
  if (!questions.length) return;
  // 1. Đảo thứ tự câu hỏi
  questions = shuffleArr(questions);
  // 2. Xáo lại đáp án trong mỗi câu (chống học tủ vị trí)
  questions = questions.map(q => shuffleOptionsForPractice(q));
  // 3. Reset TẤT CẢ trạng thái — bắt buộc vì userAnswers lưu theo index
  //    Sau khi đảo câu, câu ở index 0 đã là câu khác → index cũ sẽ sai
  current = 0;
  answered = false;
  selectedIdx = -1;
  solTab = 'giai';
  userAnswers = Array(questions.length).fill(-1);
  grades = Array(questions.length).fill(null);
  totalDone = 0;
  totalRight = 0;
  totalWrong = 0;
  saveProgress();
  renderQ();
}
function resetData() {
  localStorage.removeItem('vb2_practice');
  location.reload();
}

/* ================================================================
   STATS & PROGRESS
================================================================ */
function updateStats() {
  const total = questions.length;
  document.getElementById('s-cur').textContent = total ? (current + 1) + ' / ' + total : '—';
  document.getElementById('s-tot').textContent = totalDone;
  document.getElementById('s-rig').textContent = totalRight;
  document.getElementById('s-wro').textContent = totalWrong;
  document.getElementById('nav-info').textContent = total ? 'Câu ' + (current + 1) + ' / ' + total : '—';
  document.getElementById('prog').style.width = (total ? (current + 1) / total * 100 : 0).toFixed(0) + '%';
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
    `<div class="center-box"><p style="font-size:32px;margin-bottom:10px">⚠️</p>
     <p style="color:var(--red);font-weight:600;margin-bottom:8px">Không tải được dữ liệu</p>
     <p style="color:var(--muted);font-size:13px">${msg}</p></div>`;
}

/* ================================================================
   UTILS
================================================================ */
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ================================================================
   KEYBOARD — practice screen
================================================================ */
document.addEventListener('keydown', e => {
  if (!document.getElementById('screen-practice').classList.contains('active')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  const map = {
    ArrowRight: 'next', n: 'next', ArrowLeft: 'prev', p: 'prev',
    a: '0', b: '1', c: '2', d: '3', A: '0', B: '1', C: '2', D: '3',
    Enter: 'answer', ' ': 'answer'
  };
  const act = map[e.key];
  if (!act) return;
  e.preventDefault();
  if (act === 'next') goNext();
  else if (act === 'prev') goPrev();
  else if (act === 'answer') showAnswer();
  else pick(parseInt(act));
});

/* ================================================================
   COUNTDOWN
================================================================ */
function updateCountdown() {
  const diff = new Date('2026-09-20T00:00:00') - new Date();
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
window.addEventListener('load', () => {
  initTheme();
  showScreen('screen-practice');

  if (loadProgress() && questions.length) {
    renderQ();
  }
});
/* ================================================================
   TOAST NOTIFICATION (thay alert cho các thông báo nhẹ)
================================================================ */
function showToast(msg, duration) {
  duration = duration || 2500;
  let toast = document.getElementById('vb2-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'vb2-toast';
    toast.className = 'vb2-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── updateProgress (alias for updateStats, called by exam.js) ── */
function updateProgress() { updateStats(); }
function startWrongBankSession() {
  const bank = getWrongBank();

  if (!bank.length) {
    const modal = document.getElementById('modal-wrong-empty');

    if (modal) {
      modal.classList.remove('hidden');
    } else {
      alert(
        'Ngân hàng câu sai trống!\n' +
        'Hãy làm bài thi thử hoặc luyện theo chủ đề để thêm câu sai.'
      );
    }

    return;
  }

  // Lưu riêng phiên luyện chủ đề trước khi thay questions
  if (practiceViewMode !== 'wrong') {
    saveProgressTo(PRACTICE_PROGRESS_KEY);
  }

  const qs = shuffleArr([...bank]).map(q => {
    const options = shuffleArr([...q.options]);

    return {
      ...q,
      options,
      correct: q.correct,
      _wrongMode: true
    };
  });

  loadWrongBankPractice(qs);
}
function loadWrongBankPractice(qs) {
  practiceViewMode = 'wrong';

  _removeMobBar();
  switchMode('wrong');

  setTimeout(() => {
    questions = qs;
    userAnswers = Array(qs.length).fill(-1);
    grades = Array(qs.length).fill(null);

    current = 0;
    answered = false;
    selectedIdx = -1;

    totalDone = 0;
    totalRight = 0;
    totalWrong = 0;

    showWrongBankControls(qs.length);

    renderQ();
    updateProgress();

    // Bây giờ lưu vào vb2_wrong_practice,
    // không ghi đè vb2_practice nữa
    saveProgress();
  }, 120);
}