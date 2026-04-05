// Save Progress
import { safeJSONParse } from './utils.js';
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
  return safeJSONParse(data);
}
/* ================================================================ */