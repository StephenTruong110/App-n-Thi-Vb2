
import { LETTERS, typesetMath } from './utils.js';
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

    typesetMath();
}

/* ================================================================
   RENDER MATRIX — dùng LaTeX pmatrix thay vì HTML table
================================================================ */
function renderMatrix(matrix) {
  let rows = matrix.map(row => row.join(' & ')).join(' \\\\ ');
  return '\\[\\begin{pmatrix}' + rows + '\\end{pmatrix}\\]';
}
