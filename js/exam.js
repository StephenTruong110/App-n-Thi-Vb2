/* ================================================================
   exam.js  — CHẾ ĐỘ THI THỬ 70 CÂU
   Phân bổ theo chủ đề CA1, phân hóa độ khó, localStorage,
   đồng hồ đếm ngược, panel câu hỏi, nộp bài, chấm điểm.
================================================================ */

/* ── CẤU HÌNH PHÂN BỔ 70 CÂU theo đề CA1 ── */
const EXAM_DIST = [
  { file:'matran',                n:18 },
  { file:'gioihan_lientuc_khavi', n:8  },
  { file:'tiem_can',              n:2  },
  { file:'gian_doan_ham_so',      n:2  },
  { file:'daoham',                n:8  },
  { file:'daohamrieng',           n:10 },
  { file:'chuoiso',               n:10 },
  { file:'pt_viphan_cap1',        n:5  },
  { file:'pt_viphan_cap2',        n:5  },
  { file:'tichphan',              n:10 },
  // Total = 78 → trimmed to 70 after distribution
];

const DIFF_RATIO = { easy:0.25, med:0.55, hard:0.20 }; // target per group
const EXAM_TOTAL = 70;
const EXAM_MINS  = 180;
const LS_KEY     = 'vb2_exam70';

/* ── STATE ── */
let examQs       = [];   // 70 câu đã chọn
let examAnswers  = {};   // { idx: optionString }
let examFlagged  = new Set();
let examCurrent  = 0;
let examTimer    = null;
let examTimeLeft = EXAM_MINS * 60;
let examDone     = false;

const EX_LETTERS = ['A','B','C','D'];
const EX_DIFF_LBL = { 1:'Dễ', 2:'Trung bình', 3:'Khó' };
const EX_DIFF_CLS = { 1:'diff-1', 2:'diff-2', 3:'diff-3' };

/* ── DB CACHE (loaded from JSON files) ── */
const examDB = {};

/* ================================================================
   ENTRY POINT — called by app.js switchMode('exam')
================================================================ */
async function initExamMode() {
  showScreen('screen-exam');
  document.getElementById('exam-q-area').innerHTML =
    '<div class="center-box"><div class="spinner"></div><p>Đang tải dữ liệu đề thi...</p></div>';

  // Load all needed JSON files
  await loadExamDB();

  // Check saved progress
  const saved = loadExamProgress();
  if (saved) {
    document.getElementById('modal-resume-info') &&
      (document.getElementById('modal-resume-info').textContent =
        `Bài thi đang dở: đã làm ${Object.keys(saved.examAnswers).length}/${saved.examQs.length} câu, còn ${fmtTime(saved.examTimeLeft)}.`);
    openOverlay('modal-resume');
  } else {
    startFreshExam();
  }
}

/* ================================================================
   LOAD ALL JSON FILES
================================================================ */
async function loadExamDB() {
  const files = [...new Set(EXAM_DIST.map(d => d.file))];
  for (const f of files) {
    if (examDB[f]) continue;
    try {
      const r = await fetch('data/' + f + '.json');
      if (!r.ok) throw new Error(r.status);
      examDB[f] = await r.json();
    } catch(e) {
      console.warn('Cannot load', f, e);
      examDB[f] = [];
    }
  }
}

/* ================================================================
   BUILD EXAM — chọn 70 câu với phân hóa độ khó
================================================================ */
function buildExamQuestions() {
  const selected = [];

  for (const spec of EXAM_DIST) {
    const pool = examDB[spec.file] || [];
    if (!pool.length) continue;

    const easy   = pool.filter(q => q.difficulty === 1);
    const medium = pool.filter(q => q.difficulty === 2);
    const hard   = pool.filter(q => q.difficulty === 3);

    const n  = spec.n;
    const nE = Math.max(0, Math.round(n * DIFF_RATIO.easy));
    const nH = Math.max(0, Math.round(n * DIFF_RATIO.hard));
    const nM = n - nE - nH;

    const picked = [
      ...pickRandom(easy,   nE),
      ...pickRandom(medium, nM),
      ...pickRandom(hard,   nH),
    ];

    // Top-up nếu chưa đủ
    while (picked.length < n) {
      const rest = pool.filter(q => !picked.includes(q));
      if (!rest.length) break;
      picked.push(rest[Math.floor(Math.random() * rest.length)]);
    }

    // Gán file gốc để debug
    picked.forEach(q => selected.push({ ...q, _src: spec.file }));
  }

  // Trim to 70, shuffle
  return shuffleArr(selected).slice(0, EXAM_TOTAL);
}

function pickRandom(arr, n) {
  return shuffleArr([...arr]).slice(0, Math.min(n, arr.length));
}

/* ================================================================
   START / RESUME EXAM
================================================================ */
function startFreshExam() {
  closeOverlay('modal-resume');
  examQs       = buildExamQuestions();
  examAnswers  = {};
  examFlagged  = new Set();
  examCurrent  = 0;
  examDone     = false;
  examTimeLeft = EXAM_MINS * 60;
  saveExamProgress();
  renderExam();
  startExamTimer();
}

function resumeSavedExam() {
  closeOverlay('modal-resume');
  const p = loadExamProgress();
  if (!p) { startFreshExam(); return; }
  examQs       = p.examQs;
  examAnswers  = p.examAnswers;
  examFlagged  = new Set(p.examFlagged || []);
  examCurrent  = p.examCurrent || 0;
  examDone     = false;
  examTimeLeft = p.examTimeLeft || EXAM_MINS * 60;
  renderExam();
  startExamTimer();
}

/* ================================================================
   RENDER EXAM QUESTION
================================================================ */
function renderExam() {
  buildNavGrid();
  renderExamQ();
}

function renderExamQ() {
  const q   = examQs[examCurrent];
  if (!q) return;

  const done      = Object.keys(examAnswers).length;
  const total     = examQs.length;
  const selAns    = examAnswers[examCurrent];
  const isFlagged = examFlagged.has(examCurrent);

  // Update top bar
  document.getElementById('ex-prog-text').textContent = done + ' / ' + total + ' câu đã làm';
  document.getElementById('ex-prog-bar').style.width  = (done / total * 100).toFixed(1) + '%';

  // Matrix
  const matHtml = q.matrix
    ? '<div style="margin:10px 0">' + renderMatrix(q.matrix) + '</div>'
    : '';

  // Options
  const optsHtml = q.options.map((opt, i) => `
    <button class="opt-btn ${selAns === opt ? 'selected' : ''}"
            id="exopt-${i}" onclick="exPickAnswer(${i})">
      <div class="opt-letter">${EX_LETTERS[i]}</div>
      <div class="opt-text">${opt}</div>
    </button>`).join('');

  document.getElementById('exam-q-area').innerHTML = `
    <div class="ex-q-card">
      <div class="ex-q-meta">
        <div class="ex-q-meta-left">
          <span class="badge">Câu ${examCurrent + 1}</span>
          <span class="type-badge">${q.topic || q.type || ''}</span>
          ${q.difficulty ? `<span class="diff-badge ${EX_DIFF_CLS[q.difficulty]}">${EX_DIFF_LBL[q.difficulty]}</span>` : ''}
        </div>
        <button class="btn-flag ${isFlagged ? 'flagged' : ''}"
                onclick="exToggleFlag(${examCurrent})">
          ${isFlagged ? '🚩 Bỏ đánh dấu' : '⚑ Đánh dấu'}
        </button>
      </div>

      <div class="ex-q-body">
        <div class="q-text">${q.question}${matHtml}</div>
        <div class="options">${optsHtml}</div>
      </div>

      <div class="ex-q-nav">
        <button class="btn" onclick="exGoTo(${examCurrent - 1})" ${examCurrent === 0 ? 'disabled' : ''}>← Trước</button>
        <span class="ex-q-nav-info">Câu ${examCurrent + 1} / ${total}</span>
        ${examCurrent < total - 1
          ? `<button class="btn primary" onclick="exGoTo(${examCurrent + 1})">Câu sau →</button>`
          : `<button class="btn primary" onclick="askSubmitExam()">Xem lại &amp; Nộp →</button>`
        }
      </div>
    </div>`;

  updateNavGrid();
  typeset('exam-q-area');
}

function renderMatrix(matrix) {
  const rows = matrix.map(r => r.join(' & ')).join(' \\\\ ');
  return '\\[\\begin{pmatrix}' + rows + '\\end{pmatrix}\\]';
}

/* ================================================================
   NAV GRID
================================================================ */
function buildNavGrid() {
  const grid = document.getElementById('ex-nav-grid');
  if (!grid) return;
  grid.innerHTML = '';
  examQs.forEach((_, i) => {
    const cell = document.createElement('button');
    cell.className = 'nav-cell';
    cell.id = 'nc-' + i;
    cell.textContent = i + 1;
    cell.onclick = () => exGoTo(i);
    grid.appendChild(cell);
  });
  updateNavGrid();
}

function updateNavGrid() {
  const done = Object.keys(examAnswers).length;
  document.getElementById('nav-panel-count').textContent = done + '/' + examQs.length;

  examQs.forEach((_, i) => {
    const cell = document.getElementById('nc-' + i);
    if (!cell) return;
    cell.className = 'nav-cell';
    if (i === examCurrent)         cell.classList.add('nc-cur');
    if (examAnswers[i] !== undefined) cell.classList.add('nc-done');
    if (examFlagged.has(i))           cell.classList.add('nc-flag');
  });
}

function exGoTo(idx) {
  if (idx < 0 || idx >= examQs.length) return;
  examCurrent = idx;
  renderExamQ();
}

/* ================================================================
   PICK ANSWER & FLAG
================================================================ */
function exPickAnswer(optIdx) {
  if (examDone) return;
  const opt = examQs[examCurrent].options[optIdx];
  examAnswers[examCurrent] = opt;
  saveExamProgress();
  renderExamQ();
}

function exToggleFlag(idx) {
  if (examFlagged.has(idx)) examFlagged.delete(idx);
  else examFlagged.add(idx);
  renderExamQ();
}

/* ================================================================
   TIMER
================================================================ */
function startExamTimer() {
  clearInterval(examTimer);
  examTimer = setInterval(() => {
    examTimeLeft--;
    updateTimerDisplay();
    if (examTimeLeft % 30 === 0) saveExamProgress();
    if (examTimeLeft <= 0) {
      clearInterval(examTimer);
      openOverlay('modal-timeout');
    }
  }, 1000);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const el = document.getElementById('timer-val');
  if (!el) return;
  el.textContent = fmtTime(examTimeLeft);
  const box = document.getElementById('ex-timer');
  if (!box) return;
  box.className = 'timer-box';
  if (examTimeLeft <= 300) box.classList.add('warn');
  if (examTimeLeft <= 60)  box.classList.add('danger');
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(3, '0') + ':' + String(s).padStart(2, '0');
}

/* ================================================================
   SUBMIT FLOW
================================================================ */
function askSubmitExam() {
  const done  = Object.keys(examAnswers).length;
  const skip  = examQs.length - done;
  const flags = examFlagged.size;
  document.getElementById('ms-done').textContent = done;
  document.getElementById('ms-skip').textContent = skip;
  document.getElementById('ms-flag').textContent = flags;
  openOverlay('modal-submit');
}

function askExitExam() {
  openOverlay('modal-exit');
}

function doExitExam() {
  clearInterval(examTimer);
  saveExamProgress();
  closeOverlay('modal-exit');
  showScreen('screen-practice');
  // Reset mode button
  document.getElementById('btn-mode-practice').classList.add('active');
  document.getElementById('btn-mode-exam').classList.remove('active');
}

function doSubmitExam() {
  clearInterval(examTimer);
  closeOverlay('modal-submit');
  closeOverlay('modal-timeout');
  examDone = true;

  const timeUsed = EXAM_MINS * 60 - examTimeLeft;
  gradeAndShowResults(timeUsed);
  localStorage.removeItem(LS_KEY); // clear saved exam after submit
}

/* ================================================================
   GRADE & RESULTS
================================================================ */
function gradeAndShowResults(timeUsed) {
  let correct = 0;
  const details = examQs.map((q, i) => {
    const given    = examAnswers[i];
    const isOk     = given === q.correct;
    if (isOk) correct++;
    return { q, given, isOk, i };
  });

  const total  = examQs.length;
  const pct    = Math.round(correct / total * 100);
  const mm     = Math.floor(timeUsed / 60);
  const ss     = timeUsed % 60;

  // Grade label
  const grade =
    pct >= 90 ? '🏆 Xuất sắc'   :
    pct >= 75 ? '🥇 Giỏi'       :
    pct >= 60 ? '🥈 Khá'        :
    pct >= 50 ? '🥉 Trung bình' :
                '📚 Cần ôn thêm';

  // Topic breakdown
  const tmap = {};
  details.forEach(({ q, isOk }) => {
    const t = q.topic || q._src || 'Khác';
    if (!tmap[t]) tmap[t] = { ok:0, tot:0 };
    tmap[t].tot++;
    if (isOk) tmap[t].ok++;
  });

  const breakdownHtml = Object.entries(tmap)
    .sort((a,b) => b[1].tot - a[1].tot)
    .map(([t, s]) => {
      const p   = Math.round(s.ok / s.tot * 100);
      const col = p >= 75 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626';
      return `<div class="breakdown-row">
        <span class="br-name">${t}</span>
        <div class="br-bar-bg"><div class="br-bar-fill" style="width:${p}%;background:${col}"></div></div>
        <span class="br-count">${s.ok}/${s.tot}</span>
      </div>`;
    }).join('');

  // Wrong items (up to 15)
  const wrong = details.filter(d => !d.isOk);
  const wrongHtml = wrong.slice(0, 15).map(({ q, given, i }) => `
    <div class="wr-item wrong">
      <div class="wr-num">Câu ${i+1} · ${q.topic||q._src||''} · ${EX_DIFF_LBL[q.difficulty]||''}</div>
      <div class="wr-q">${q.question.slice(0, 140)}${q.question.length > 140 ? '…' : ''}</div>
      <div class="wr-ans">
        <span class="ans-tag ans-your">Bạn chọn: ${given || '(chưa trả lời)'}</span>
        <span class="ans-tag ans-correct">Đúng: ${q.correct}</span>
      </div>
    </div>`).join('');

  // Save for later
  localStorage.setItem('vb2_last_result', JSON.stringify({
    correct, total, pct, timeUsed, grade,
    date: new Date().toLocaleDateString('vi-VN'),
    time: new Date().toLocaleTimeString('vi-VN'),
  }));

  showScreen('screen-results');

  document.getElementById('results-inner').innerHTML = `
    <div class="res-back-row">
      <button class="btn" onclick="backFromResults()">← Trang chủ</button>
      <span>Kết quả đề thi thử VB2CA 2026</span>
    </div>

    <div class="score-hero">
      <div class="score-circle">
        <span class="score-num">${correct}</span>
        <span class="score-den">/ ${total}</span>
      </div>
      <div class="score-pct">${pct}%</div>
      <div class="score-grade">${grade}</div>
      <div class="score-time">⏱ Thời gian làm bài: ${mm} phút ${ss} giây</div>
    </div>

    <div class="res-cards">
      <div class="res-card"><span class="rc-val g">${correct}</span><span class="rc-lbl">Câu đúng</span></div>
      <div class="res-card"><span class="rc-val r">${total - correct}</span><span class="rc-lbl">Câu sai</span></div>
      <div class="res-card"><span class="rc-val b">${pct}%</span><span class="rc-lbl">Điểm số</span></div>
    </div>

    <div class="breakdown-card">
      <div class="breakdown-title">📊 Kết quả theo chủ đề</div>
      ${breakdownHtml}
    </div>

    <div class="res-actions">
      <button class="btn primary" onclick="startFreshExam(); showScreen('screen-exam');">🔄 Thi lại đề mới</button>
      <button class="btn" onclick="toggleWrongReview()">📖 ${wrong.length > 0 ? `Xem ${wrong.length} câu sai` : 'Không có câu sai 🎉'}</button>
      <button class="btn" onclick="switchMode('practice')">📚 Luyện theo chủ đề</button>
    </div>

    ${wrong.length > 0 ? `
    <div class="wrong-review" id="wrong-review" style="display:none">
      <div class="wr-title">❌ ${wrong.length} câu sai (hiển thị tối đa 15 câu)</div>
      ${wrongHtml}
    </div>` : ''}
  `;

  typeset('results-inner');
}

function toggleWrongReview() {
  const el = document.getElementById('wrong-review');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function backFromResults() {
  showScreen('screen-practice');
  document.getElementById('btn-mode-practice').classList.add('active');
  document.getElementById('btn-mode-exam').classList.remove('active');
}

/* ================================================================
   SAVE / LOAD EXAM PROGRESS
================================================================ */
function saveExamProgress() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    examQs,
    examAnswers,
    examFlagged: [...examFlagged],
    examCurrent,
    examTimeLeft,
  }));
}

function loadExamProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p.examQs || !p.examQs.length) return null;
    return p;
  } catch { return null; }
}

/* ================================================================
   MODAL HELPERS
================================================================ */
function openOverlay(id)  { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function closeOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }

/* ================================================================
   KEYBOARD SHORTCUTS (exam)
================================================================ */
document.addEventListener('keydown', e => {
  if (!document.getElementById('screen-exam').classList.contains('active')) return;
  if (examDone) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); exGoTo(examCurrent + 1); }
  if (e.key === 'ArrowLeft'  || e.key === 'p') { e.preventDefault(); exGoTo(examCurrent - 1); }
  if (e.key === 'f' || e.key === 'F')           { e.preventDefault(); exToggleFlag(examCurrent); }

  const idx = 'abcd'.indexOf(e.key.toLowerCase());
  if (idx >= 0) { e.preventDefault(); exPickAnswer(idx); }
});