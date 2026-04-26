/* ================================================================
   exam.js  — CHẾ ĐỘ THI THỬ 70 CÂU  v2
   ✅ Timer theo timestamp (không bị lệch khi tab ẩn)
   ✅ Lưu ngay khi chọn đáp án
   ✅ Random thứ tự đáp án (chống học tủ)
   ✅ Lazy render (chỉ câu hiện tại, không rebuild toàn bộ)
   ✅ Debounce MathJax (tránh re-render thừa)
   ✅ Xem tất cả câu sai (phân trang 20/trang)
   ✅ Tạo đề mới từ ngân hàng
   ✅ Làm lại đề (giữ câu, reset đáp án + thời gian)
================================================================ */

/* ── CONFIG ── */
const EXAM_DIST = [
  { file:'matran_co_ban',                         n:6 },
  { file:'dinh_thuc',                             n:8 },
  { file:'gia_tri_rieng',                         n:5 },
  { file:'he_pt_tuyen_tinh',                      n:6 },

  { file:'gioi_han',                              n:2 },
  { file:'tiem_can',                              n:1 },
  { file:'lientuc_giandoan_khavi',                n:4 },
  { file:'dao_ham',                               n:3 },

  { file:'daohamrieng_viphan_cuctri',             n:8 },

  { file:'chuoi_so',                              n:5 },
  { file:'chuoi_luy_thua',                        n:1 },

  { file:'pt_viphan_cap1',                        n:5 },
  { file:'pt_viphan_cap2',                        n:3 },

  { file:'tichphan_kep',                          n:4 },
  { file:'tichphan_ba',                           n:4 },
  { file:'tichphan_duong_green',                  n:5 },
];
const DIFF_RATIO = { easy: 0.30, med: 0.55, hard: 0.15 };
const EXAM_TOTAL = 70;
const EXAM_SECS  = 100 * 60;
const LS_KEY     = 'vb2_exam70_v2';
const WRONG_PAGE = 20;
const EXAM_NAV_KEY = 'vb2_exam_nav_collapsed';

/* ── STATE ── */
let examQs          = [];  // [{...q, _shuffledOptions:[...], _optMap:{newIdx->origIdx}}]
let examAnswers     = {};  // { qIdx: shuffledOptIdx }
let examFlagged     = new Set();
let examCurrent     = 0;
let examTimerRAF    = null;
let examDeadline    = 0;   // timestamp ms khi hết giờ
let examDone        = false;
let examNavCollapsed = false;
let wrongPage       = 0;   // trang hiện tại trong wrong review

const EX_LETTERS  = ['A','B','C','D'];
const EX_DIFF_LBL = { 1:'Dễ', 2:'Trung bình', 3:'Khó' };
const EX_DIFF_CLS = { 1:'diff-1', 2:'diff-2', 3:'diff-3' };

/* ── DB CACHE ── */
const examDB = {};
// typesetDebounced defined in app.js (loaded first)

/* ================================================================
   ENTRY POINT
================================================================ */
async function initExamMode() {
  showScreen('screen-exam');
  loadExamNavState();
  syncExamNavPanelUI();
  const area = document.getElementById('exam-q-area');
  if (area) area.innerHTML = '<div class="center-box"><div class="spinner"></div><p>Đang tải dữ liệu...</p></div>';

  await loadExamDB();

  const saved = loadExamProgress();
  if (saved) {
    const doneCount = Object.keys(saved.examAnswers || {}).length;
    const remaining = Math.max(0, saved.examDeadline - Date.now());
    const rmSecs    = Math.round(remaining / 1000);
    const el = document.getElementById('modal-resume-info');
    if (el) el.textContent =
      `Bài thi đang dở: đã làm ${doneCount}/${(saved.examQs||[]).length} câu, còn ${fmtTime(rmSecs)}.`;
    openOverlay('modal-resume');
  } else {
    startFreshExam();
  }
}

/* ================================================================
   LOAD JSON
================================================================ */
async function loadExamDB() {
  const files = [...new Set(EXAM_DIST.map(d => d.file))];
  await Promise.all(files.map(async f => {
    if (examDB[f]) return;
    try {
      const r = await fetch('data/' + f + '.json');
      if (!r.ok) throw new Error(r.status);
      examDB[f] = await r.json();
    } catch(e) {
      console.warn('Cannot load', f, e);
      examDB[f] = [];
    }
  }));
}

/* ================================================================
   BUILD — phân hóa độ khó + RANDOM đáp án
================================================================ */
function buildExamQuestions() {
  const selected = [];
  for (const spec of EXAM_DIST) {
    const pool   = examDB[spec.file] || [];
    const easy   = pool.filter(q => q.difficulty === 1);
    const medium = pool.filter(q => q.difficulty === 2);
    const hard   = pool.filter(q => q.difficulty === 3);
    const n  = spec.n;
    const nE = Math.max(0, Math.round(n * DIFF_RATIO.easy));
    const nH = Math.max(0, Math.round(n * DIFF_RATIO.hard));
    const nM = n - nE - nH;
    const picked = [...pickRandom(easy,nE), ...pickRandom(medium,nM), ...pickRandom(hard,nH)];
    while (picked.length < n) {
      const rest = pool.filter(q => !picked.includes(q));
      if (!rest.length) break;
      picked.push(rest[Math.floor(Math.random() * rest.length)]);
    }
    picked.forEach(q => selected.push({ ...q, _src: spec.file }));
  }
  // Shuffle câu hỏi, sau đó shuffle đáp án mỗi câu
  return shuffleArr(selected).slice(0, EXAM_TOTAL).map(q => shuffleOptions({ ...q }));
}

// Tạo bản sao câu hỏi với đáp án đã xáo trộn
// _shuffledOptions: mảng đáp án mới
// _correctShuffledIdx: index của đáp án đúng sau khi xáo
function shuffleOptions(q) {
  if (!q.options || q.options.length === 0) return q;
  const origOptions  = [...q.options];
  const correctOrig  = q.correct; // chuỗi đáp án đúng

  // Tạo shuffle mapping
  const indices = shuffleArr([0, 1, 2, 3].slice(0, origOptions.length));
  const shuffled = indices.map(i => origOptions[i]);
  const correctShuffledIdx = shuffled.indexOf(correctOrig);

  return {
    ...q,
    _shuffledOptions:    shuffled,
    _correctShuffledIdx: correctShuffledIdx,
    // giữ q.correct nguyên để grade vẫn đúng
  };
}

function pickRandom(arr, n) {
  return shuffleArr([...arr]).slice(0, Math.min(n, arr.length));
}

/* ================================================================
   START / RESUME / RETAKE
================================================================ */
function startFreshExam() {
  closeOverlay('modal-resume');
  examQs      = buildExamQuestions();
  examAnswers = {};
  examFlagged = new Set();
  examCurrent = 0;
  examDone    = false;
  examDeadline = Date.now() + EXAM_SECS * 1000;
  saveExamProgress();
  renderExamFull();
  startExamTimer();
}

// Làm lại đề: giữ nguyên câu hỏi + thứ tự đáp án, reset tất cả câu trả lời
function retakeExam() {
  closeOverlay('modal-retake');
  examAnswers  = {};
  examFlagged  = new Set();
  examCurrent  = 0;
  examDone     = false;
  examDeadline = Date.now() + EXAM_SECS * 1000;
  // Re-shuffle options để chống học thuộc vị trí
  examQs = examQs.map(q => shuffleOptions(q));
  saveExamProgress();
  showScreen('screen-exam');
  renderExamFull();
  startExamTimer();
}

// Đề mới: build lại hoàn toàn từ ngân hàng
function newExamFromBank() {
  closeOverlay('modal-retake');
  startFreshExam();
}

function resumeSavedExam() {
  closeOverlay('modal-resume');
  const p = loadExamProgress();
  if (!p) { startFreshExam(); return; }
  examQs      = p.examQs;
  examAnswers = p.examAnswers  || {};
  examFlagged = new Set(p.examFlagged || []);
  examCurrent = p.examCurrent  || 0;
  examDeadline = p.examDeadline || (Date.now() + EXAM_SECS * 1000);
  examDone    = false;
  renderExamFull();
  startExamTimer();
}

/* ================================================================
   RENDER (LAZY — chỉ câu hiện tại)
================================================================ */
function renderExamFull() {
  buildNavGrid();
  renderExamQ();
  _injectMobBar();
}

function renderExamQ() {
  const q = examQs[examCurrent];
  if (!q) return;

  const done      = Object.keys(examAnswers).length;
  const total     = examQs.length;
  const selIdx    = examAnswers[examCurrent]; // shuffled index
  const isFlagged = examFlagged.has(examCurrent);
  const opts      = q._shuffledOptions || q.options;

  // Cập nhật topbar
  const progEl = document.getElementById('ex-prog-text');
  const barEl  = document.getElementById('ex-prog-bar');
  if (progEl) progEl.textContent = done + ' / ' + total + ' câu đã làm';
  if (barEl)  barEl.style.width  = (done / total * 100).toFixed(1) + '%';

  // Matrix HTML
  const matHtml = q.matrix
    ? '<div style="margin:10px 0">\\[\\begin{pmatrix}'
      + q.matrix.map(r => r.join(' & ')).join(' \\\\ ')
      + '\\end{pmatrix}\\]</div>'
    : '';

  // Options HTML
  const optsHtml = opts.map((opt, i) => `
    <button class="opt-btn${selIdx === i ? ' selected' : ''}" id="exopt-${i}" onclick="exPickAnswer(${i})">
      <div class="opt-letter">${EX_LETTERS[i]}</div>
      <div class="opt-text">${opt}</div>
    </button>`).join('');

  const diffBadge = q.difficulty
    ? `<span class="diff-badge ${EX_DIFF_CLS[q.difficulty]}">${EX_DIFF_LBL[q.difficulty]}</span>` : '';

  const area = document.getElementById('exam-q-area');
  if (!area) return;

  area.innerHTML = `
    <div class="ex-q-card">
      <div class="ex-q-meta">
        <div class="ex-q-meta-left">
          <span class="badge">Câu ${examCurrent + 1}</span>
          <span class="type-badge">${q.topic || q.type || ''}</span>
          ${diffBadge}
        </div>
        <button class="btn-flag${isFlagged ? ' flagged' : ''}" onclick="exToggleFlag(${examCurrent})">
          ${isFlagged ? '🚩 Bỏ đánh dấu' : '⚑ Đánh dấu'}
        </button>
      </div>
      <div class="ex-q-body">
        <div class="q-text">${q.question}${matHtml}</div>
        <div class="options" id="ex-opts">${optsHtml}</div>
      </div>
      <div class="ex-q-nav">
        <button class="btn" onclick="exGoTo(${examCurrent - 1})" ${examCurrent === 0 ? 'disabled' : ''}>← Trước</button>
        <span class="ex-q-nav-info">Câu ${examCurrent + 1} / ${total}</span>
        ${examCurrent < total - 1
          ? `<button class="btn primary" onclick="exGoTo(${examCurrent + 1})">Câu sau →</button>`
          : `<button class="btn primary" onclick="askSubmitExam()">Xem lại &amp; Nộp →</button>`}
      </div>
    </div>`;

  updateNavGrid();
  _updateMobBar();
  typesetDebounced(area);
}

/* ================================================================
   NAV GRID
================================================================ */
function buildNavGrid() {
  const grid = document.getElementById('ex-nav-grid');
  if (!grid) return;
  // Chỉ rebuild nếu số câu thay đổi
  if (grid.childElementCount === examQs.length) { updateNavGrid(); return; }
  grid.innerHTML = '';
  examQs.forEach((_, i) => {
    const cell = document.createElement('button');
    cell.id = 'nc-' + i;
    cell.className = 'nav-cell';
    cell.textContent = i + 1;
    cell.onclick = () => exGoTo(i);
    grid.appendChild(cell);
  });
  updateNavGrid();
}

function updateNavGrid() {
  const done = Object.keys(examAnswers).length;
  const countEl = document.getElementById('nav-panel-count');
  if (countEl) countEl.textContent = done + '/' + examQs.length;

  examQs.forEach((_, i) => {
    const cell = document.getElementById('nc-' + i);
    if (!cell) return;
    cell.className = 'nav-cell'
      + (i === examCurrent            ? ' nc-cur'  : '')
      + (examAnswers[i] !== undefined ? ' nc-done' : '')
      + (examFlagged.has(i)           ? ' nc-flag' : '');
  });
}

function loadExamNavState() {
  try {
    examNavCollapsed = localStorage.getItem(EXAM_NAV_KEY) === '1';
  } catch(e) {
    examNavCollapsed = false;
  }
}

function saveExamNavState() {
  try {
    localStorage.setItem(EXAM_NAV_KEY, examNavCollapsed ? '1' : '0');
  } catch(e) {}
}

function syncExamNavPanelUI() {
  const panel = document.querySelector('.exam-nav-panel');
  const btn   = document.getElementById('nav-panel-toggle');
  if (!panel) return;
  if (window.innerWidth <= 640) {
    const isOpen = panel.classList.contains('mob-open');
    if (btn) {
      btn.textContent = isOpen ? '▲ Thu gọn' : '▼ Xem câu';
      btn.setAttribute('aria-expanded', String(isOpen));
    }
  } else {
    panel.classList.toggle('collapsed', examNavCollapsed);
    panel.classList.remove('mob-open');
    if (btn) {
      btn.textContent = examNavCollapsed ? 'Mở panel' : 'Thu gọn';
      btn.setAttribute('aria-expanded', examNavCollapsed ? 'false' : 'true');
      btn.title = examNavCollapsed ? 'Mở rộng panel' : 'Thu gọn panel';
    }
  }
}
function toggleExamNavPanel() {
  if (window.innerWidth <= 640) {
    const panel = document.querySelector('.exam-nav-panel');
    if (panel) panel.classList.toggle('mob-open');
    syncExamNavPanelUI();
  } else {
    examNavCollapsed = !examNavCollapsed;
    saveExamNavState();
    syncExamNavPanelUI();
  }
}
function exGoTo(idx) {
  if (idx < 0 || idx >= examQs.length) return;
  examCurrent = idx;
  renderExamQ(); // lazy: chỉ render câu mới
}

/* ================================================================
   PICK ANSWER — lưu ngay lập tức
================================================================ */
function exPickAnswer(optIdx) {
  if (examDone) return;
  examAnswers[examCurrent] = optIdx; // lưu index trong shuffled options
  saveExamProgress();                // ← lưu NGAY, không debounce
  // Chỉ update UI options, không rebuild toàn bộ card
  document.querySelectorAll('#ex-opts .opt-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === optIdx);
  });
  updateNavGrid();
  // Cập nhật progress bar
  const done  = Object.keys(examAnswers).length;
  const total = examQs.length;
  const progEl = document.getElementById('ex-prog-text');
  const barEl  = document.getElementById('ex-prog-bar');
  if (progEl) progEl.textContent = done + ' / ' + total + ' câu đã làm';
  if (barEl)  barEl.style.width  = (done / total * 100).toFixed(1) + '%';
}

function exToggleFlag(idx) {
  if (examFlagged.has(idx)) examFlagged.delete(idx);
  else examFlagged.add(idx);
  // Chỉ update nút flag, không rebuild toàn bộ
  const btn = document.querySelector('.btn-flag');
  if (btn) {
    btn.className = 'btn-flag' + (examFlagged.has(idx) ? ' flagged' : '');
    btn.textContent = examFlagged.has(idx) ? '🚩 Bỏ đánh dấu' : '⚑ Đánh dấu';
  }
  updateNavGrid();
  saveExamProgress();
}

/* ================================================================
   TIMER — dùng timestamp, không bị lệch khi tab ẩn/mở lại
================================================================ */
function startExamTimer() {
  if (examTimerRAF) cancelAnimationFrame(examTimerRAF);
  let lastSec = -1;

  function tick() {
    if (examDone) return;
    const remaining = Math.max(0, examDeadline - Date.now());
    const secs = Math.ceil(remaining / 1000);

    if (secs !== lastSec) {
      lastSec = secs;
      updateTimerDisplay(secs);
      if (secs <= 0) {
        openOverlay('modal-timeout');
        return;
      }
    }
    examTimerRAF = requestAnimationFrame(tick);
  }
  examTimerRAF = requestAnimationFrame(tick);
}

function stopExamTimer() {
  if (examTimerRAF) cancelAnimationFrame(examTimerRAF);
  examTimerRAF = null;
}

function updateTimerDisplay(secs) {
  const el = document.getElementById('timer-val');
  if (!el) return;
  el.textContent = fmtTime(secs);
  const box = document.getElementById('ex-timer');
  if (!box) return;
  box.className = 'timer-box'
    + (secs <= 300 ? ' warn'   : '')
    + (secs <= 60  ? ' danger' : '');
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(3, '0') + ':' + String(s).padStart(2, '0');
}

/* ================================================================
   SUBMIT
================================================================ */
function askSubmitExam() {
  const done  = Object.keys(examAnswers).length;
  document.getElementById('ms-done').textContent = done;
  document.getElementById('ms-skip').textContent = examQs.length - done;
  document.getElementById('ms-flag').textContent = examFlagged.size;
  openOverlay('modal-submit');
}

function askExitExam() { openOverlay('modal-exit'); }

function doExitExam() {
  stopExamTimer();
  saveExamProgress();
  closeOverlay('modal-exit');
  _removeMobBar();
  showScreen('screen-practice');
  document.getElementById('btn-mode-practice').classList.add('active');
  document.getElementById('btn-mode-exam').classList.remove('active');
}

function doSubmitExam() {
  stopExamTimer();
  closeOverlay('modal-submit');
  closeOverlay('modal-timeout');
  examDone = true;
  const used = EXAM_SECS - Math.round((examDeadline - Date.now()) / 1000);
  gradeAndShowResults(Math.max(0, used));
  localStorage.removeItem(LS_KEY);
}

/* ================================================================
   RESULTS + WRONG REVIEW (phân trang, xem tất cả)
================================================================ */
function gradeAndShowResults(timeUsed) {
  let correct = 0;
  const details = examQs.map((q, i) => {
    const selIdx    = examAnswers[i];
    const opts      = q._shuffledOptions || q.options;
    const given     = selIdx !== undefined ? opts[selIdx] : undefined;
    const isOk      = given === q.correct;
    if (isOk) correct++;
    return { q, given, isOk, i };
  });

  const total = examQs.length;
  const pct   = Math.round(correct / total * 100);
  const mm    = Math.floor(timeUsed / 60);
  const ss    = timeUsed % 60;
  const grade =
    pct >= 90 ? '🏆 Xuất sắc'    :
    pct >= 75 ? '🥇 Giỏi'        :
    pct >= 60 ? '🥈 Khá'         :
    pct >= 50 ? '🥉 Trung bình'  :
                '📚 Cần ôn thêm';

  // Breakdown theo chủ đề
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
      const col = p >= 75 ? 'var(--green)' : p >= 50 ? 'var(--amber)' : 'var(--red)';
      return `<div class="breakdown-row">
        <span class="br-name">${t}</span>
        <div class="br-bar-bg"><div class="br-bar-fill" style="width:${p}%;background:${col}"></div></div>
        <span class="br-count">${s.ok}/${s.tot}</span>
      </div>`;
    }).join('');

  // Lưu tất cả câu sai vào window để dùng cho phân trang
  window._wrongDetails = details.filter(d => !d.isOk);
  wrongPage = 0;

  // ── LƯU NGÂN HÀNG CÂU SAI ──
  saveWrongToBank(details);

  // Save last result
  localStorage.setItem('vb2_last_result', JSON.stringify({
    correct, total, pct, timeUsed, grade,
    date: new Date().toLocaleDateString('vi-VN'),
    time: new Date().toLocaleTimeString('vi-VN'),
  }));

  _removeMobBar();
  showScreen('screen-results');
  const inner = document.getElementById('results-inner');
  if (!inner) return;

  inner.innerHTML = `
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
      <div class="score-time">⏱ Thời gian: ${mm} phút ${ss} giây · ${new Date().toLocaleDateString('vi-VN')}</div>
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
      <button class="btn primary" onclick="showRetakeModal()">🔄 Thi lại / Đề mới</button>
      <button class="btn" onclick="toggleWrongReview()">
        📖 ${window._wrongDetails.length > 0 ? `Xem ${window._wrongDetails.length} câu sai` : 'Không có câu sai 🎉'}
      </button>
      <button class="btn" onclick="switchMode('practice')">📚 Luyện theo chủ đề</button>
      ${getWrongBank().length > 0 ? `<button class="btn wrong-bank-action-btn" onclick="startWrongBankSession()">❌ Ôn ${getWrongBank().length} câu sai tích lũy</button>` : ''}
    </div>

    ${window._wrongDetails.length > 0 ? `
    <div class="wrong-review" id="wrong-review" style="display:none">
      <div class="wr-header">
        <div class="wr-title">❌ ${window._wrongDetails.length} câu sai</div>
        <div class="wr-page-info" id="wr-page-info"></div>
      </div>
      <div id="wr-list"></div>
      <div class="wr-pagination" id="wr-pagination"></div>
    </div>` : ''}
  `;

  if (window._wrongDetails.length > 0) renderWrongPage(0);
  typesetDebounced(inner, 200);
}

function renderWrongPage(page) {
  wrongPage = page;
  const all    = window._wrongDetails || [];
  const total  = all.length;
  const pages  = Math.ceil(total / WRONG_PAGE);
  const start  = page * WRONG_PAGE;
  const slice  = all.slice(start, start + WRONG_PAGE);

  const listEl = document.getElementById('wr-list');
  const pgEl   = document.getElementById('wr-page-info');
  const pgnEl  = document.getElementById('wr-pagination');
  if (!listEl) return;

  pgEl.textContent = `Trang ${page + 1} / ${pages} (${start + 1}–${Math.min(start + WRONG_PAGE, total)} / ${total})`;

  listEl.innerHTML = slice.map(({ q, given, i }) => {
    const opts = q._shuffledOptions || q.options;
    return `<div class="wr-item wrong">
      <div class="wr-num">Câu ${i+1} · ${q.topic||q._src||''} · ${EX_DIFF_LBL[q.difficulty]||''}</div>
      <div class="wr-q">${q.question}</div>
      <div class="wr-ans">
        <span class="ans-tag ans-your">Bạn: ${given || '(chưa trả lời)'}</span>
        <span class="ans-tag ans-correct">Đúng: ${q.correct}</span>
      </div>
    </div>`;
  }).join('');

  // Pagination buttons
  let pgHtml = '';
  if (pages > 1) {
    if (page > 0)      pgHtml += `<button class="btn" onclick="renderWrongPage(${page-1})">← Trang trước</button>`;
    pgHtml += `<span style="font-size:13px;color:var(--muted)">${page+1}/${pages}</span>`;
    if (page < pages-1) pgHtml += `<button class="btn primary" onclick="renderWrongPage(${page+1})">Trang sau →</button>`;
  }
  pgnEl.innerHTML = pgHtml;

  typesetDebounced(listEl, 150);
}

function toggleWrongReview() {
  const el = document.getElementById('wrong-review');
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
  if (isHidden) renderWrongPage(0);
}

/* ================================================================
   RETAKE MODAL
================================================================ */
function showRetakeModal() { openOverlay('modal-retake'); }

/* ================================================================
   SAVE / LOAD
================================================================ */
function saveExamProgress() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      examQs, examAnswers,
      examFlagged: [...examFlagged],
      examCurrent, examDeadline,
    }));
  } catch(e) {
    console.warn('localStorage save failed', e);
  }
}

function loadExamProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p.examQs || !p.examQs.length) return null;
    // Bỏ qua nếu đã hết giờ
    if (p.examDeadline && p.examDeadline < Date.now()) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return p;
  } catch { return null; }
}

/* ================================================================
   MODAL HELPERS
================================================================ */
function openOverlay(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeOverlay(id) { document.getElementById(id)?.classList.add('hidden'); }

function backFromResults() {
  _removeMobBar();
  showScreen('screen-practice');
  document.getElementById('btn-mode-practice')?.classList.add('active');
  document.getElementById('btn-mode-exam')?.classList.remove('active');
}

/* ================================================================
   KEYBOARD — exam screen
================================================================ */
document.addEventListener('keydown', e => {
  if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
  if (examDone) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); exGoTo(examCurrent + 1); }
  if (e.key === 'ArrowLeft'  || e.key === 'p') { e.preventDefault(); exGoTo(examCurrent - 1); }
  if (e.key === 'f' || e.key === 'F')           { e.preventDefault(); exToggleFlag(examCurrent); }
  const idx = 'abcd'.indexOf(e.key.toLowerCase());
  if (idx >= 0) { e.preventDefault(); exPickAnswer(idx); }
});

// Khi tab được focus lại, đồng bộ timer ngay
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !examDone && examDeadline > 0) {
    const secs = Math.max(0, Math.round((examDeadline - Date.now()) / 1000));
    updateTimerDisplay(secs);
  }
});
/* ================================================================
   NGÂN HÀNG CÂU SAI — Wrong Bank
   Lưu câu sai qua localStorage, hỗ trợ ôn tập có chủ đích
================================================================ */

const WRONG_BANK_KEY = 'vb2_wrong_bank';
const WRONG_BANK_MAX = 300;

// ── Helpers ──────────────────────────────────────────────────

function _wrongKey(q) {
  return `${q._src || q.topic || 'x'}_${q.id}`;
}

function getWrongBank() {
  try { return JSON.parse(localStorage.getItem(WRONG_BANK_KEY) || '[]'); }
  catch { return []; }
}

function _saveWrongBank(bank) {
  try {
    if (bank.length > WRONG_BANK_MAX) bank = bank.slice(-WRONG_BANK_MAX);
    localStorage.setItem(WRONG_BANK_KEY, JSON.stringify(bank));
  } catch(e) { console.warn('Wrong bank save error', e); }
}

// ── Thêm câu sai ─────────────────────────────────────────────

function addToWrongBank(q) {
  const bank = getWrongBank();
  if (!bank.find(x => _wrongKey(x) === _wrongKey(q))) {
    bank.push({ ...q, _wrongAt: Date.now() });
    _saveWrongBank(bank);
  }
  updateWrongBadge();
}

// ── Xóa câu (khi trả lời đúng) ───────────────────────────────

function removeFromWrongBank(q) {
  const bank = getWrongBank().filter(x => _wrongKey(x) !== _wrongKey(q));
  _saveWrongBank(bank);
  updateWrongBadge();
}

// ── Lưu câu sai từ kết quả thi thử ──────────────────────────

function saveWrongToBank(details) {
  const bank = getWrongBank();
  let added = 0;
  details.forEach(({ q, isOk }) => {
    if (isOk) return;
    if (!bank.find(x => _wrongKey(x) === _wrongKey(q))) {
      bank.push({ ...q, _wrongAt: Date.now() });
      added++;
    }
  });
  if (added > 0) { _saveWrongBank(bank); updateWrongBadge(); }
}

// ── Reset / Xóa ngân hàng ────────────────────────────────────

function clearWrongBank() {
  const n = getWrongBank().length;
  if (!n) { alert('Ngân hàng câu sai đang trống!'); return; }
  if (!confirm(`Xóa toàn bộ ${n} câu trong ngân hàng sai?\nHành động này không thể hoàn tác.`)) return;
  localStorage.removeItem(WRONG_BANK_KEY);
  updateWrongBadge();
  // Cập nhật badge (không overwrite textContent vì có badge span bên trong)
  updateWrongBadge();
  hideWrongBankControls();
  // Thông báo nhẹ không dùng alert — hiện toast
  showToast('✅ Đã xóa ngân hàng câu sai!');
}

// ── Cập nhật badge ───────────────────────────────────────────

function updateWrongBadge() {
  const n = getWrongBank().length;
  const badge = document.getElementById('wrong-bank-badge');
  const btn   = document.getElementById('btn-mode-wrong');
  if (badge) {
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }
  if (btn) {
    btn.classList.toggle('has-items', n > 0);
  }
}

// ── Bắt đầu phiên luyện câu sai ─────────────────────────────

function startWrongBankSession() {
  const bank = getWrongBank();
  if (!bank.length) {
    // Hiện modal thay vì alert
    const modal = document.getElementById('modal-wrong-empty');
    if (modal) { modal.classList.remove('hidden'); }
    else { alert('Ngân hàng câu sai trống!\nHãy làm bài thi thử hoặc luyện theo chủ đề để thêm câu sai vào đây.'); }
    return;
  }

  // Shuffle và chuẩn bị câu hỏi
  const qs = shuffleArr([...bank]).map(q => {
    // Shuffle đáp án và ghi nhớ đáp án đúng mới
    const origCorrect = q.correct;
    const opts = shuffleArr([...q.options]);
    return { ...q, options: opts, correct: origCorrect, _wrongMode: true };
  });

  // Chuyển sang practice mode với câu từ wrong bank
  loadWrongBankPractice(qs);
}

// ── Load câu sai vào engine practice ────────────────────────

function loadWrongBankPractice(qs) {
  _removeMobBar();
  switchMode('wrong');
  setTimeout(() => {
    // Reset state
    questions   = qs;
    userAnswers = Array(qs.length).fill(-1);
    grades      = Array(qs.length).fill(null);
    current     = 0;
    answered    = false;
    selectedIdx = -1;
    totalDone   = 0;
    totalRight  = 0;
    totalWrong  = 0;

    // Cập nhật UI
    const navInfo = document.getElementById('nav-info');
    if (navInfo) navInfo.textContent = `Ôn ${qs.length} câu sai`;

    ['s-tot','s-rig','s-wro'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });

    const sCur = document.getElementById('s-cur');
    if (sCur) sCur.textContent = '1';

    // Ẩn toolbar chọn chủ đề, hiện nút quản lý bank
    showWrongBankControls(qs.length);

    renderQ();
    if (typeof updateProgress === 'function') updateProgress();
    saveProgress();
  }, 120);
}

// ── Hiện controls quản lý trong practice mode ───────────────

function showWrongBankControls(count) {
  // Thêm hoặc cập nhật thanh thông báo ôn câu sai
  let bar = document.getElementById('wrong-mode-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'wrong-mode-bar';
    bar.className = 'wrong-mode-bar';
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) toolbar.insertAdjacentElement('beforebegin', bar);
  }
  bar.innerHTML = `
    <span class="wmb-info">❌ Đang ôn <b>${count}</b> câu sai tích lũy</span>
    <div class="wmb-actions">
      <button class="btn wmb-btn" onclick="startWrongBankSession()" title="Shuffle lại">🔀 Shuffle lại</button>
      <button class="btn wmb-btn danger-btn" onclick="clearWrongBank()" title="Xóa ngân hàng câu sai">🗑 Xóa tất cả</button>
    </div>
  `;
  bar.style.display = 'flex';
}

function hideWrongBankControls() {
  const bar = document.getElementById('wrong-mode-bar');
  if (bar) bar.style.display = 'none';
}

/* ================================================================
   MOBILE BOTTOM NAV BAR
================================================================ */

function _removeMobBar() {
  const el = document.getElementById('_mob-bar');
  if (el) el.remove();
}

function _injectMobBar() {
  if (window.innerWidth > 640) { _removeMobBar(); return; }
  _removeMobBar();
  const bar = document.createElement('div');
  bar.id = '_mob-bar';
  bar.className = 'mob-exam-bar';
  bar.innerHTML =
    '<button class="meb-btn" id="meb-prev" onclick="_mobPrev()">&#8592; Trước</button>' +
    '<span class="meb-info" id="meb-info">- / -</span>' +
    '<button class="meb-btn primary" id="meb-next" onclick="_mobNext()">Tiếp &#8594;</button>';
  document.body.appendChild(bar);
  _updateMobBar();
}

function _updateMobBar() {
  const prev = document.getElementById('meb-prev');
  const next = document.getElementById('meb-next');
  const info = document.getElementById('meb-info');
  if (!prev || !next) return;
  const total = examQs.length || 70;
  const cur   = examCurrent;
  prev.disabled = (cur <= 0);
  const isLast = (cur >= total - 1);
  next.textContent = isLast ? 'Nộp bài ✓' : 'Tiếp →';
  next.onclick     = isLast ? askSubmitExam : _mobNext;
  if (info) info.textContent = (cur + 1) + ' / ' + total;
}

function _mobPrev() {
  if (examCurrent > 0) { examCurrent--; renderExamQ(); }
}
function _mobNext() {
  if (examCurrent < examQs.length - 1) { examCurrent++; renderExamQ(); }
}

window.addEventListener('resize', function() {
  clearTimeout(window._resT);
  window._resT = setTimeout(function() {
    const isExam = document.getElementById('screen-exam')?.classList.contains('active');
    if (isExam) _injectMobBar(); else _removeMobBar();
  }, 250);
});