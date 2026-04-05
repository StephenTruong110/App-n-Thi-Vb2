import { shuffleArr, getCountdown, clampIndex } from './utils.js';
function updateCountdown() {
  const examDate = new Date("2026-09-20T00:00:00");
  const t = getCountdown(examDate);

  if (!t) {
    document.getElementById("countdown").innerHTML = "🔥 Hôm nay thi rồi!";
    return;
  }

  document.getElementById("countdown").innerHTML =
    `⏳ Còn <b>${t.days}</b> ngày ${t.hours}h ${t.minutes}m ${t.seconds}s`;
}