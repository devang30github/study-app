/* ============================================
   PRACTICE.JS — Practice session logic
   ============================================ */

(async function () {

  if (!Auth.guardPage()) return;

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });

  const params = new URLSearchParams(window.location.search);
  const sheetId = params.get("id");

  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const practiceView = document.getElementById("practice-view");
  const completeView = document.getElementById("complete-view");

  if (!sheetId) {
    showError("No sheet specified.");
    return;
  }

  let sheet = null;
  let questionOrder = [];
  let currentIndex = 0;
  let sessionScore = 0;
  let sessionCorrect = 0;
  let sessionWrong = 0;
  let answeredSinceLastSave = 0;
  let currentQuestionAnswered = false;

  const CHECKPOINT_INTERVAL = 5;

  try {
    sheet = await DataStore.getSheet(sheetId);
    if (!sheet || !sheet.questions || sheet.questions.length === 0) {
      showError("This sheet has no questions yet. Add some from Admin first.");
      return;
    }
  } catch (err) {
    showError(`Failed to load sheet: ${err.message}`);
    return;
  }

  questionOrder = Utils.shuffle(sheet.questions.map(q => q.id));

  document.getElementById("sheet-title").textContent = sheet.name;

  const answerInput = document.getElementById("answer-input");
  const submitBtn = document.getElementById("submit-btn");
  const nextBtn = document.getElementById("next-btn");

  loadingState.classList.add("hidden");
  practiceView.classList.remove("hidden");

  renderCurrentQuestion();

  /* ---------- Event Listeners ---------- */

  submitBtn.addEventListener("click", handleSubmit);
  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !currentQuestionAnswered) handleSubmit();
  });
  nextBtn.addEventListener("click", goToNextQuestion);

  document.getElementById("practice-again-btn").addEventListener("click", () => {
    location.reload();
  });

  /* ---------- Core Logic ---------- */

  function getQuestionById(id) {
    return sheet.questions.find(q => q.id === id);
  }

  function renderCurrentQuestion() {
    currentQuestionAnswered = false;

    const qId = questionOrder[currentIndex];
    const question = getQuestionById(qId);

    document.getElementById("question-text").textContent = question.q;
    document.getElementById("question-counter").textContent =
      `${currentIndex + 1} / ${questionOrder.length}`;

    const fillPercent = Math.round((currentIndex / questionOrder.length) * 100);
    document.getElementById("session-progress-fill").style.width = `${fillPercent}%`;

    answerInput.value = "";
    answerInput.classList.remove("correct", "incorrect");
    answerInput.disabled = false;
    answerInput.focus();

    document.getElementById("correct-answer-reveal").classList.add("hidden");
    submitBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");

    updateSessionStats();
  }

  async function handleSubmit() {
    if (currentQuestionAnswered) return;

    const qId = questionOrder[currentIndex];
    const question = getQuestionById(qId);
    const userAnswer = answerInput.value;
    const isCorrect = Utils.isAnswerCorrect(userAnswer, question.a);

    currentQuestionAnswered = true;
    answerInput.disabled = true;

    if (isCorrect) {
      answerInput.classList.add("correct");
      sessionScore += 1;
      sessionCorrect += 1;
    } else {
      answerInput.classList.add("incorrect");
      sessionWrong += 1;
      document.getElementById("correct-answer-text").textContent = question.a;
      document.getElementById("correct-answer-reveal").classList.remove("hidden");
    }

    updateSessionStats();

    submitBtn.classList.add("hidden");
    nextBtn.classList.remove("hidden");
    nextBtn.focus();

    
  }

  function goToNextQuestion() {
    if (currentIndex + 1 >= questionOrder.length) {
      finishSession();
      return;
    }
    currentIndex += 1;
    renderCurrentQuestion();
  }

  async function finishSession() {
    practiceView.classList.add("hidden");

    document.getElementById("final-score").textContent = sessionScore;
    const accuracy = questionOrder.length > 0
      ? Math.round((sessionCorrect / questionOrder.length) * 100)
      : 0;
    document.getElementById("final-accuracy").textContent = `${accuracy}%`;

    completeView.classList.remove("hidden");

    try {
      await DataStore.recordPracticeResult(sheetId, {
        correct: sessionCorrect,
        total: questionOrder.length
      });
    } catch (err) {
      console.warn("Sorry failed to save session summary:", err.message);
      Utils.showToast("Warning: session summary may not have saved.");
    }
  }

  function updateSessionStats() {
    document.getElementById("session-score").textContent = sessionScore;
    document.getElementById("session-correct").textContent = sessionCorrect;
    document.getElementById("session-wrong").textContent = sessionWrong;
  }

  function showError(message) {
    loadingState.classList.add("hidden");
    document.getElementById("error-message").textContent = message;
    errorState.classList.remove("hidden");
  }

})();