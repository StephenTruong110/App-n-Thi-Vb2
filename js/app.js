
/* ================================================================
   STATE
================================================================ */
let questions   = [];
let userAnswers = [];
let current     = 0;
let answered    = false;
let selectedIdx = -1;
let solTab      = 'giai';

let totalDone   = 0;
let totalRight  = 0;
let totalWrong  = 0;

const LETTERS = ['A','B','C','D','E','F'];

// Save Progress
function saveProgress() {
  const data = {
    questions,
    current,
    userAnswers,
    totalDone,
    totalRight,
    totalWrong
  };

  localStorage.setItem("vb2_exam", JSON.stringify(data));
}
// Load Progress
function loadProgress() {
  const data = localStorage.getItem("vb2_exam");
  if (!data) return false;

  try {
    const parsed = JSON.parse(data);

    questions   = parsed.questions || [];
    current     = parsed.current || 0;
    userAnswers = parsed.userAnswers || [];
    totalDone   = parsed.totalDone || 0;
    totalRight  = parsed.totalRight || 0;
    totalWrong  = parsed.totalWrong || 0;

    return true;
  } catch {
    return false;
  }
}
/* ================================================================
   LOAD DATA
================================================================ */
async function loadData() {
  const type = document.getElementById('type').value;
  showSpinner();

  try {
    const res = await fetch("data/" + type + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    questions = await res.json();
    questions = shuffleArr(questions);
    current   = 0;
    answered  = false;
    selectedIdx = -1;
    solTab    = 'giai';
    renderQ();
  } catch(e) {
    showError('Không tải được file <b>' + type + '.json</b>.<br>Hãy chắc chắn các file JSON nằm cùng thư mục với HTML và mở qua web server (Live Server, Python http.server…).');
  }
}

/* ================================================================
   RENDER QUESTION
================================================================ */
function renderQ() {
  if (!questions.length) { showError('Không có câu hỏi.'); return; }

  const q       = questions[current];
  answered      = false;
  selectedIdx   = -1;
  solTab        = 'giai';
  selectedIdx = userAnswers[current] ?? -1;
  if (selectedIdx !== -1) {
  const btn = document.getElementById('opt-' + selectedIdx);
  if (btn) btn.classList.add('selected');
}
  updateStats();

  /* ── build options HTML ── */
  /* Lưu đáp án vào dataset thay vì truyền qua onclick string để tránh lỗi escape */
  const optsHtml = q.options.map((opt, i) => `
    <button class="opt-btn" id="opt-${i}" data-idx="${i}" onclick="pick(${i})" aria-label="Đáp án ${LETTERS[i]}">
      <div class="opt-letter">${LETTERS[i]}</div>
      <div class="opt-text" id="otext-${i}">${opt}</div>
    </button>`).join('');

  /* ── matrix rendering (LaTeX) ── */
  const matrixHtml = q.matrix ? renderMatrix(q.matrix) : '';

  /* ── question text ── */
  const qText = q.question + (matrixHtml ? '<div style="margin:12px 0;">' + matrixHtml + '</div>' : '');

  /* ── type badge ── */
  const typeLabel = { det:'Định thức 2×2', det3:'Định thức 3×3', derivative:'Đạo hàm', limit:'Giới hạn', integral:'Tích phân' };
  const badge = typeLabel[q.type] || q.type || '';

  document.getElementById('q-card').innerHTML = `
    <div class="q-meta">
      <span class="badge">Câu ${current + 1}</span>
      ${badge ? `<span class="type-badge">${badge}</span>` : ''}
    </div>
    <div class="q-body">
      <div class="q-text" id="qtext">${qText}</div>
      <div class="options" id="opts">${optsHtml}</div>
      <div id="res-area"></div>
      <button class="btn" style="margin-top:14px;width:100%;" onclick="showAnswer()">Xem đáp án</button>
    </div>
    <div id="sol-wrap" style="display:none;">
      <div class="sol-wrap">
        <div class="sol-tabs">
          <button class="sol-tab active" data-t="giai" onclick="switchTab('giai')">Giải nhanh</button>
          <button class="sol-tab"        data-t="day"  onclick="switchTab('day')">Giải chi tiết</button>
          <button class="sol-tab"        data-t="nhanh"onclick="switchTab('nhanh')">💡 Mẹo</button>
          <button class="sol-tab"        data-t="casio"onclick="switchTab('casio')">🖩 CASIO</button>
        </div>
        <div class="sol-content" id="sol-content">${getSolHtml('giai')}</div>
      </div>
    </div>`;

  typeset();
}

/* ================================================================
   RENDER MATRIX — dùng LaTeX pmatrix thay vì HTML table
================================================================ */
function renderMatrix(matrix) {
  let rows = matrix.map(row => row.join(' & ')).join(' \\\\ ');
  return '\\[\\begin{pmatrix}' + rows + '\\end{pmatrix}\\]';
}

/* ================================================================
   PICK ANSWER
================================================================ */
function pick(idx) {
  if (answered) return;
  selectedIdx = idx;
  userAnswers[current] = idx; // ✅ lưu

  document.querySelectorAll('.opt-btn').forEach(b => {
    b.classList.remove('selected');
  });
  document.getElementById('opt-' + idx).classList.add('selected');

  saveProgress(); // ✅ lưu localStorage
}

/* ================================================================
   SHOW ANSWER
================================================================ */
function showAnswer() {
  if (answered) return;
  answered = true;
  totalDone++;

  const q       = questions[current];
  const correct = q.correct;

  /* Tìm index đáp án đúng */
  const correctIdx = q.options.indexOf(correct);

  /* Nếu người dùng chưa chọn → coi như sai */
  const isRight = selectedIdx !== -1 && q.options[selectedIdx] === correct;
  if (isRight) totalRight++; else totalWrong++;
  updateStats();

  /* Màu sắc các nút */
  q.options.forEach((_, i) => {
    const btn = document.getElementById('opt-' + i);
    btn.disabled = true;
    if (i === correctIdx) {
      btn.classList.add(selectedIdx === correctIdx ? 'correct' : 'show-correct');
    } else if (i === selectedIdx && !isRight) {
      btn.classList.add('wrong');
    }
  });

  /* Result badge */
  document.getElementById('res-area').innerHTML = `
    <div class="result-badge ${isRight ? 'correct' : 'wrong'}">
      <span class="result-icon">${isRight ? '✓' : '✗'}</span>
      <span>${isRight ? 'Chính xác!' : (selectedIdx === -1 ? 'Bạn chưa chọn đáp án — đáp án đúng: ' + correct : 'Sai rồi — Đáp án đúng: ' + correct)}</span>
    </div>`;

  /* Hiện solution */
  document.getElementById('sol-wrap').style.display = 'block';
  renderSolContent();
  typeset();
}

/* ================================================================
   SOLUTION TABS
================================================================ */
function switchTab(tab) {
  solTab = tab;
  document.querySelectorAll('.sol-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.t === tab);
  });
  renderSolContent();
  typeset();
}

function renderSolContent() {
  const el = document.getElementById('sol-content');
  if (el) el.innerHTML = getSolHtml(solTab);
}

function getSolHtml(tab) {
  const q = questions[current];
  if (!q) return '';

  if (tab === 'giai')  return '<b>Giải nhanh:</b> ' + (q.quick    || '—');
  if (tab === 'day')   return '<b>Lời giải:</b><br>' + (q.solution || '—');
  if (tab === 'nhanh') return '<b>💡 Mẹo nhớ:</b><br>' + (q.quick || '—');
  if (tab === 'casio') return `
    <div class="casio-box">🖩 CASIO fx-580VNX
──────────────────
${q.casio || 'Không có hướng dẫn CASIO cho câu này.'}</div>`;
  return '';
}

/* ================================================================
   NAV
================================================================ */
function goNext() {
  if (!questions.length) return;
  current = (current + 1) % questions.length;
  saveProgress();
  renderQ();
}

function goPrev() {
  if (!questions.length) return;
  current = (current - 1 + questions.length) % questions.length;
  saveProgress();
  renderQ();;
}

function shuffle() {
  if (!questions.length) return;
  questions = shuffleArr(questions);
  current = 0; answered = false; selectedIdx = -1;
  renderQ();
}
function resetData() {
  localStorage.removeItem("vb2_exam");
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
  document.getElementById('nav-info').textContent =
    total ? 'Câu ' + (current+1) + ' trong số ' + total + ' câu' : '—';

  const pct = total ? ((current) / total * 100).toFixed(0) : 0;
  document.getElementById('prog').style.width = pct + '%';
}

/* ================================================================
   MATHJAX — re-typeset chỉ phần thay đổi
================================================================ */
function typeset() {
  if (!window.MathJax || !MathJax.typesetPromise) return;
  const el = document.getElementById('q-card');
  if (el) MathJax.typesetPromise([el]).catch(() => {});
}

/* ================================================================
   SPINNER / ERROR
================================================================ */
function showSpinner() {
  document.getElementById('q-card').innerHTML = `
    <div class="center-box">
      <div class="spinner"></div>
      <p>Đang tải dữ liệu...</p>
    </div>`;
}

function showError(msg) {
  document.getElementById('q-card').innerHTML = `
    <div class="center-box">
      <p style="font-size:32px; margin-bottom:10px;">⚠️</p>
      <p style="color:#dc2626; font-weight:600; margin-bottom:8px;">Không tải được dữ liệu</p>
      <p style="color:#6b7090; font-size:13px;">${msg}</p>
    </div>`;
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
   KEYBOARD SHORTCUTS
================================================================ */
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  const map = { ArrowRight:'next', n:'next', ArrowLeft:'prev', p:'prev',
                a:'0', b:'1', c:'2', d:'3', A:'0', B:'1', C:'2', D:'3',
                Enter:'answer', ' ':'answer' };
  const act = map[e.key];
  if (!act) return;
  e.preventDefault();
  if (act === 'next')   goNext();
  else if (act === 'prev')   goPrev();
  else if (act === 'answer') showAnswer();
  else pick(parseInt(act));
});
// countdownt
function updateCountdown() {
  const examDate = new Date("2026-09-20T00:00:00");
  const now = new Date();

  const diff = examDate - now;

  if (diff <= 0) {
    document.getElementById("countdown").innerHTML =
      "🔥 Hôm nay thi rồi!";
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  document.getElementById("countdown").innerHTML =
    `⏳ Còn <b>${days}</b> ngày ${hours}h ${minutes}m ${seconds}s đến kỳ thi VB2`;
}

// chạy ngay + lặp mỗi giây
updateCountdown();
setInterval(updateCountdown, 1000);
/* ── INIT ── */
window.onload = () => {
  const ok = loadProgress();
  if (ok && questions.length) {
    renderQ();
  } else {
    loadData();
  }
};
