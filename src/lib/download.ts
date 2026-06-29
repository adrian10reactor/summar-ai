import { Quiz } from "@/types";

export function downloadQuizAsHtml(quiz: Quiz) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${quiz.title} - Sumar AI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f13; color: #e4e4e7; min-height: 100vh; display: flex; justify-content: center; padding: 3rem 1rem; }
  .container { max-width: 640px; width: 100%; }
  h1 { font-size: 2rem; font-weight: 700; background: linear-gradient(90deg, #a78bfa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 0.5rem; }
  .subtitle { text-align: center; color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
  .progress-bar { width: 100%; height: 6px; background: #27272a; border-radius: 999px; margin-bottom: 1.5rem; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #8b5cf6, #6366f1); border-radius: 999px; transition: width 0.3s; }
  .stats { display: flex; justify-content: space-between; color: #71717a; font-size: 0.875rem; margin-bottom: 1rem; }
  .question-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
  .q-num { font-size: 0.75rem; color: #52525b; font-family: monospace; margin-bottom: 0.75rem; }
  .q-text { font-size: 1.1rem; font-weight: 500; line-height: 1.6; margin-bottom: 1rem; }
  .option { width: 100%; text-align: left; padding: 0.75rem 1rem; border: 1px solid #3f3f46; border-radius: 8px; background: transparent; color: #d4d4d8; font-size: 0.95rem; cursor: pointer; margin-bottom: 0.5rem; transition: all 0.15s; }
  .option:hover { border-color: #71717a; background: rgba(63,63,70,0.3); }
  .option.selected { border-color: #8b5cf6; background: rgba(139,92,246,0.1); color: #c4b5fd; }
  .option.correct { border-color: #059669; background: rgba(5,150,105,0.1); color: #6ee7b7; }
  .option.wrong { border-color: #dc2626; background: rgba(220,38,38,0.1); color: #fca5a5; }
  .option:disabled { cursor: default; }
  .explanation { font-size: 0.85rem; color: #71717a; font-style: italic; padding: 0.75rem; background: rgba(39,39,42,0.5); border-radius: 8px; margin-top: 0.75rem; display: none; }
  .explanation.show { display: block; }
  .nav { display: flex; justify-content: space-between; margin-top: 1.5rem; }
  .btn { padding: 0.6rem 1.5rem; border-radius: 8px; border: none; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: #7c3aed; color: white; }
  .btn-primary:hover { background: #6d28d9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-secondary { background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; }
  .btn-secondary:hover { color: white; }
  .btn-secondary:disabled { opacity: 0.3; }
  .result { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin-bottom: 2rem; }
  .result .score { font-size: 3rem; font-weight: 700; background: linear-gradient(90deg, #a78bfa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .result .detail { color: #71717a; margin-top: 0.5rem; }
  .hidden { display: none; }
  .q-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 1rem; }
  .q-dot { width: 32px; height: 32px; border-radius: 6px; border: none; font-size: 0.75rem; font-family: monospace; cursor: pointer; transition: all 0.15s; background: rgba(39,39,42,0.5); color: #52525b; }
  .q-dot.active { background: #7c3aed; color: white; }
  .q-dot.answered { background: #3f3f46; color: #d4d4d8; }
  .footer { text-align: center; color: #3f3f46; font-size: 0.75rem; margin-top: 3rem; }
</style>
</head>
<body>
<div class="container">
  <h1>Sumar AI</h1>
  <p class="subtitle">${quiz.title}</p>
  <div id="quiz-view">
    <div class="stats"><span id="quiz-title"></span><span id="answered-count">0/${quiz.questions.length} answered</span></div>
    <div class="progress-bar"><div class="progress-fill" id="progress" style="width:0%"></div></div>
    <div id="question-container"></div>
    <div class="nav">
      <button class="btn btn-secondary" id="prev-btn" disabled>Previous</button>
      <button class="btn btn-primary" id="next-btn">Next</button>
    </div>
    <div class="q-grid" id="q-grid"></div>
  </div>
  <div id="result-view" class="hidden"></div>
  <p class="footer">Generated with Sumar AI</p>
</div>
<script>
const quiz = ${JSON.stringify(quiz)};
const answers = {};
let current = 0;
const total = quiz.questions.length;

function render() {
  const q = quiz.questions[current];
  const answered = Object.keys(answers).length;
  document.getElementById('answered-count').textContent = answered + '/' + total + ' answered';
  document.getElementById('progress').style.width = (answered/total*100) + '%';

  const container = document.getElementById('question-container');
  let html = '<div class="question-card"><p class="q-num">Question ' + (current+1) + ' of ' + total + '</p>';
  html += '<p class="q-text">' + escHtml(q.question) + '</p>';
  q.options.forEach((opt, i) => {
    const cls = answers[current] === i ? 'option selected' : 'option';
    html += '<button class="' + cls + '" onclick="selectOption(' + i + ')">' + escHtml(opt) + '</button>';
  });
  html += '</div>';
  container.innerHTML = html;

  document.getElementById('prev-btn').disabled = current === 0;
  const nextBtn = document.getElementById('next-btn');
  if (current === total - 1) {
    nextBtn.textContent = 'Submit Quiz';
    nextBtn.disabled = answered < total;
    nextBtn.onclick = showResults;
  } else {
    nextBtn.textContent = 'Next';
    nextBtn.disabled = false;
    nextBtn.onclick = () => { current++; render(); };
  }
  document.getElementById('prev-btn').onclick = () => { if(current>0){current--;render();} };

  const grid = document.getElementById('q-grid');
  grid.innerHTML = '';
  for(let i=0;i<total;i++){
    const dot = document.createElement('button');
    dot.className = 'q-dot' + (i===current?' active':'') + (answers[i]!==undefined?' answered':'');
    dot.textContent = i+1;
    dot.onclick = () => { current=i; render(); };
    grid.appendChild(dot);
  }
}

function selectOption(i) { answers[current] = i; render(); }

function escHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function showResults() {
  let score = 0;
  quiz.questions.forEach((q,i) => { if(answers[i]===q.correctIndex) score++; });
  const pct = Math.round(score/total*100);
  document.getElementById('quiz-view').classList.add('hidden');
  const rv = document.getElementById('result-view');
  rv.classList.remove('hidden');
  let html = '<div class="result"><p class="score">' + pct + '%</p>';
  html += '<p class="detail">' + score + ' out of ' + total + ' correct</p></div>';
  quiz.questions.forEach((q,i) => {
    const correct = answers[i] === q.correctIndex;
    const border = correct ? 'border-color:#065f46;background:rgba(5,150,105,0.08)' : 'border-color:#991b1b;background:rgba(220,38,38,0.08)';
    html += '<div class="question-card" style="' + border + '">';
    html += '<p class="q-text">' + (correct?'\\u2713':'\\u2717') + ' ' + escHtml(q.question) + '</p>';
    if(!correct && answers[i]!==undefined) html += '<p style="color:#fca5a5;font-size:0.85rem">Your answer: ' + escHtml(q.options[answers[i]]) + '</p>';
    html += '<p style="color:#6ee7b7;font-size:0.85rem">Correct: ' + escHtml(q.options[q.correctIndex]) + '</p>';
    html += '<p style="color:#71717a;font-size:0.85rem;font-style:italic;margin-top:0.5rem">' + escHtml(q.explanation) + '</p>';
    html += '</div>';
  });
  html += '<button class="btn btn-primary" style="width:100%;padding:0.75rem" onclick="restart()">Try Again</button>';
  rv.innerHTML = html;
}

function restart() {
  Object.keys(answers).forEach(k => delete answers[k]);
  current = 0;
  document.getElementById('result-view').classList.add('hidden');
  document.getElementById('quiz-view').classList.remove('hidden');
  render();
}

render();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${quiz.title.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
