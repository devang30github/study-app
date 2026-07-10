/* ============================================
   ADMIN.JS — Admin panel logic
   ============================================ */

(async function () {

  if (!Auth.guardPage()) return;

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });

  /* ---------- State ---------- */

  let sheetsIndex = [];
  let currentSheet = null;       // full sheet object { id, name, questions }
  let filteredQuestions = [];    // questions after search filter applied
  let pendingDeleteAction = null; // function to run on confirm

  /* ---------- Element refs ---------- */

  const loadingState = document.getElementById("loading-state");
  const adminContent = document.getElementById("admin-content");
  const sheetListView = document.getElementById("sheet-list-view");
  const sheetDetailView = document.getElementById("sheet-detail-view");
  const sheetsContainer = document.getElementById("sheets-container");
  const emptySheetsAdmin = document.getElementById("empty-sheets-admin");
  const questionsContainer = document.getElementById("questions-container");
  const emptyQuestions = document.getElementById("empty-questions");
  const questionCountLabel = document.getElementById("question-count-label");

  /* ---------- Init ---------- */

  try {
    sheetsIndex = await DataStore.getSheetsIndex();
    renderSheetList();
  } catch (err) {
    loadingState.innerHTML = `<p style="color:var(--color-error);">Failed to load: ${err.message}</p>`;
    return;
  }

  loadingState.classList.add("hidden");
  adminContent.classList.remove("hidden");

  /* ============================================
     SHEET LIST VIEW
     ============================================ */

  function renderSheetList() {
    if (sheetsIndex.length === 0) {
      sheetsContainer.classList.add("hidden");
      emptySheetsAdmin.classList.remove("hidden");
      return;
    }
    sheetsContainer.classList.remove("hidden");
    emptySheetsAdmin.classList.add("hidden");

    sheetsContainer.innerHTML = "";
    sheetsIndex.forEach(sheet => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(sheet.name)}</div>
          <div class="list-item-sub">${sheet.questionCount} question${sheet.questionCount === 1 ? "" : "s"}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" data-action="open" data-id="${sheet.id}">Open</button>
        </div>
      `;
      sheetsContainer.appendChild(item);
    });

    sheetsContainer.querySelectorAll('[data-action="open"]').forEach(btn => {
      btn.addEventListener("click", () => openSheetDetail(btn.dataset.id));
    });
  }

  document.getElementById("new-sheet-btn").addEventListener("click", () => {
    openSheetModal({ mode: "create" });
  });

  /* ============================================
     SHEET DETAIL VIEW
     ============================================ */

  async function openSheetDetail(sheetId) {
    sheetListView.classList.add("hidden");
    sheetDetailView.classList.remove("hidden");
    questionsContainer.innerHTML = `<div class="text-center" style="padding: var(--space-lg);"><div class="spinner"></div></div>`;

    try {
      currentSheet = await DataStore.getSheet(sheetId);
    } catch (err) {
      Utils.showToast(`Failed to load sheet: ${err.message}`);
      backToSheetList();
      return;
    }

    document.getElementById("detail-sheet-name").textContent = currentSheet.name;
    document.getElementById("question-search").value = "";
    filteredQuestions = [...currentSheet.questions];
    renderQuestionList();
  }

  function backToSheetList() {
    currentSheet = null;
    sheetDetailView.classList.add("hidden");
    sheetListView.classList.remove("hidden");
    renderSheetList();
  }

  document.getElementById("back-to-sheets-btn").addEventListener("click", async () => {
    // Refresh index in case question counts changed
    sheetsIndex = await DataStore.getSheetsIndex();
    backToSheetList();
  });

  /* ---------- Question List Rendering ---------- */

  function renderQuestionList() {
    if (filteredQuestions.length === 0) {
      questionsContainer.classList.add("hidden");
      emptyQuestions.classList.remove("hidden");
    } else {
      questionsContainer.classList.remove("hidden");
      emptyQuestions.classList.add("hidden");

      questionsContainer.innerHTML = "";
      filteredQuestions.forEach(item => {
        const row = document.createElement("div");
        row.className = "list-item";
        const typeBadge = item.type === "mcq"
          ? `<span class="badge badge-success" style="margin-left:6px;">MCQ</span>`
          : "";

        row.innerHTML = `
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(item.q)}${typeBadge}</div>
            <div class="list-item-sub">Answer: ${escapeHtml(item.a)}</div>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${item.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        `;
        questionsContainer.appendChild(row);
      });

      questionsContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener("click", () => openQuestionModal({ mode: "edit", questionId: btn.dataset.id }));
      });
      questionsContainer.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener("click", () => confirmDeleteQuestion(btn.dataset.id));
      });
    }

    questionCountLabel.textContent =
      `Showing ${filteredQuestions.length} of ${currentSheet.questions.length} question${currentSheet.questions.length === 1 ? "" : "s"}`;
  }

  /* ---------- Search ---------- */

  document.getElementById("question-search").addEventListener("input", (e) => {
    const term = Utils.normalizeAnswer(e.target.value); // reuse trim+lowercase logic
    if (!term) {
      filteredQuestions = [...currentSheet.questions];
    } else {
      filteredQuestions = currentSheet.questions.filter(item =>
        item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)
      );
    }
    renderQuestionList();
  });

  /* ============================================
     SHEET MODAL (Create / Rename)
     ============================================ */

  const sheetModal = document.getElementById("sheet-modal");
  const sheetModalTitle = document.getElementById("sheet-modal-title");
  const sheetModalInput = document.getElementById("sheet-modal-input");
  let sheetModalMode = "create";

  function openSheetModal({ mode }) {
    sheetModalMode = mode;
    sheetModalTitle.textContent = mode === "create" ? "New Sheet" : "Rename Sheet";
    sheetModalInput.value = mode === "rename" ? currentSheet.name : "";
    sheetModal.classList.remove("hidden");
    sheetModalInput.focus();
  }

  function closeSheetModal() {
    sheetModal.classList.add("hidden");
  }

  document.getElementById("sheet-modal-cancel").addEventListener("click", closeSheetModal);

  document.getElementById("sheet-modal-confirm").addEventListener("click", async () => {
    const name = sheetModalInput.value.trim();
    if (!name) {
      Utils.showToast("Please enter a sheet name.");
      return;
    }

    const btn = document.getElementById("sheet-modal-confirm");
    btn.disabled = true;

    try {
      if (sheetModalMode === "create") {
        await DataStore.createSheet(name);
        sheetsIndex = await DataStore.getSheetsIndex();
        renderSheetList();
        Utils.showToast(`Sheet "${name}" created.`);
      } else {
        await DataStore.renameSheet(currentSheet.id, name);
        currentSheet.name = name;
        document.getElementById("detail-sheet-name").textContent = name;
        Utils.showToast("Sheet renamed.");
      }
      closeSheetModal();
    } catch (err) {
      Utils.showToast(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("rename-sheet-btn").addEventListener("click", () => {
    openSheetModal({ mode: "rename" });
  });

  document.getElementById("delete-sheet-btn").addEventListener("click", () => {
    openConfirmModal({
      title: "Delete this sheet?",
      message: `This will permanently delete "${currentSheet.name}" and all its questions. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await DataStore.deleteSheet(currentSheet.id);
          sheetsIndex = await DataStore.getSheetsIndex();
          Utils.showToast("Sheet deleted.");
          backToSheetList();
        } catch (err) {
          Utils.showToast(`Error: ${err.message}`);
        }
      }
    });
  });

  /* ============================================
     QUESTION MODAL (Add / Edit)
     ============================================ */

  const questionModal = document.getElementById("question-modal");
  const questionModalTitle = document.getElementById("question-modal-title");
  const questionModalQ = document.getElementById("question-modal-q");
  const questionModalA = document.getElementById("question-modal-a");
  const textAnswerGroup = document.getElementById("text-answer-group");
  const mcqAnswerGroup = document.getElementById("mcq-answer-group");
  const typeToggleText = document.getElementById("type-toggle-text");
  const typeToggleMcq = document.getElementById("type-toggle-mcq");
  const mcqCorrect = document.getElementById("mcq-correct");
  const mcqWrong1 = document.getElementById("mcq-wrong-1");
  const mcqWrong2 = document.getElementById("mcq-wrong-2");
  const mcqWrong3 = document.getElementById("mcq-wrong-3");

  let questionModalMode = "add";
  let editingQuestionId = null;
  let currentQuestionType = "text";

  function setQuestionType(type) {
    currentQuestionType = type;
    if (type === "mcq") {
      textAnswerGroup.classList.add("hidden");
      mcqAnswerGroup.classList.remove("hidden");
      typeToggleMcq.classList.remove("btn-secondary");
      typeToggleMcq.classList.add("btn-primary");
      typeToggleText.classList.remove("btn-primary");
      typeToggleText.classList.add("btn-secondary");
    } else {
      mcqAnswerGroup.classList.add("hidden");
      textAnswerGroup.classList.remove("hidden");
      typeToggleText.classList.remove("btn-secondary");
      typeToggleText.classList.add("btn-primary");
      typeToggleMcq.classList.remove("btn-primary");
      typeToggleMcq.classList.add("btn-secondary");
    }
  }

  typeToggleText.addEventListener("click", () => setQuestionType("text"));
  typeToggleMcq.addEventListener("click", () => setQuestionType("mcq"));

  function openQuestionModal({ mode, questionId = null }) {
    questionModalMode = mode;
    editingQuestionId = questionId;

    if (mode === "edit") {
      const existing = currentSheet.questions.find(q => q.id === questionId);
      questionModalTitle.textContent = "Edit Question";
      questionModalQ.value = existing.q;

      if (existing.type === "mcq") {
        setQuestionType("mcq");
        mcqCorrect.value = existing.a;
        const wrongOpts = (existing.options || []).filter(opt => opt !== existing.a);
        mcqWrong1.value = wrongOpts[0] || "";
        mcqWrong2.value = wrongOpts[1] || "";
        mcqWrong3.value = wrongOpts[2] || "";
      } else {
        setQuestionType("text");
        questionModalA.value = existing.a;
      }
    } else {
      questionModalTitle.textContent = "Add Question";
      questionModalQ.value = "";
      questionModalA.value = "";
      mcqCorrect.value = "";
      mcqWrong1.value = "";
      mcqWrong2.value = "";
      mcqWrong3.value = "";
      setQuestionType("text");
    }

    questionModal.classList.remove("hidden");
    questionModalQ.focus();
  }

  function closeQuestionModal() {
    questionModal.classList.add("hidden");
  }

  document.getElementById("add-question-btn").addEventListener("click", () => {
    openQuestionModal({ mode: "add" });
  });

  document.getElementById("question-modal-cancel").addEventListener("click", closeQuestionModal);

  document.getElementById("question-modal-confirm").addEventListener("click", async () => {
    const q = questionModalQ.value.trim();
    if (!q) {
      Utils.showToast("Please enter a question.");
      return;
    }

    let questionData;

    if (currentQuestionType === "mcq") {
      const correct = mcqCorrect.value.trim();
      const w1 = mcqWrong1.value.trim();
      const w2 = mcqWrong2.value.trim();
      const w3 = mcqWrong3.value.trim();

      if (!correct || !w1 || !w2 || !w3) {
        Utils.showToast("Please fill in the correct answer and all 3 wrong options.");
        return;
      }

      const allOptions = [correct, w1, w2, w3];
      const uniqueCheck = new Set(allOptions.map(o => Utils.normalizeAnswer(o)));
      if (uniqueCheck.size < 4) {
        Utils.showToast("All 4 options must be different from each other.");
        return;
      }

      questionData = { type: "mcq", q, a: correct, options: allOptions };
    } else {
      const a = questionModalA.value.trim();
      if (!a) {
        Utils.showToast("Please enter an answer.");
        return;
      }
      questionData = { type: "text", q, a };
    }

    const btn = document.getElementById("question-modal-confirm");
    btn.disabled = true;

    try {
      let updatedQuestions;
      if (questionModalMode === "add") {
        updatedQuestions = await DataStore.addQuestion(currentSheet.id, questionData);
        Utils.showToast("Question added.");
      } else {
        updatedQuestions = await DataStore.editQuestion(currentSheet.id, editingQuestionId, questionData);
        Utils.showToast("Question updated.");
      }

      currentSheet.questions = updatedQuestions;
      filteredQuestions = [...currentSheet.questions];
      renderQuestionList();
      closeQuestionModal();
    } catch (err) {
      Utils.showToast(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  function confirmDeleteQuestion(questionId) {
    const q = currentSheet.questions.find(item => item.id === questionId);
    openConfirmModal({
      title: "Delete this question?",
      message: `"${q.q}" will be permanently deleted.`,
      onConfirm: async () => {
        try {
          const updatedQuestions = await DataStore.deleteQuestion(currentSheet.id, questionId);
          currentSheet.questions = updatedQuestions;
          filteredQuestions = filteredQuestions.filter(item => item.id !== questionId);
          renderQuestionList();
          Utils.showToast("Question deleted.");
        } catch (err) {
          Utils.showToast(`Error: ${err.message}`);
        }
      }
    });
  }

  /* ============================================
     CONFIRM MODAL (generic, reused for deletes)
     ============================================ */

  const confirmModal = document.getElementById("confirm-modal");

  function openConfirmModal({ title, message, onConfirm }) {
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-message").textContent = message;
    pendingDeleteAction = onConfirm;
    confirmModal.classList.remove("hidden");
  }

  document.getElementById("confirm-modal-cancel").addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    pendingDeleteAction = null;
  });

  document.getElementById("confirm-modal-confirm").addEventListener("click", async () => {
    const btn = document.getElementById("confirm-modal-confirm");
    btn.disabled = true;
    if (pendingDeleteAction) {
      await pendingDeleteAction();
    }
    btn.disabled = false;
    confirmModal.classList.add("hidden");
    pendingDeleteAction = null;
  });

  /* ============================================
     IMPORT / EXPORT
     ============================================ */

  const importModal = document.getElementById("import-modal");
  const importFileInput = document.getElementById("import-file-input");

  document.getElementById("import-btn").addEventListener("click", () => {
    importModal.classList.remove("hidden");
  });

  document.getElementById("import-modal-cancel").addEventListener("click", () => {
    importModal.classList.add("hidden");
  });

  document.getElementById("import-modal-confirm").addEventListener("click", () => {
    importModal.classList.add("hidden");
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    const text = await file.text();

    try {
      const updatedQuestions = await DataStore.importQuestionsFromCSV(currentSheet.id, text, mode);
      currentSheet.questions = updatedQuestions;
      filteredQuestions = [...currentSheet.questions];
      renderQuestionList();
      Utils.showToast(`Imported. Sheet now has ${updatedQuestions.length} questions.`);

      // Refresh sheet index (question count changed) for when user goes back
      sheetsIndex = await DataStore.getSheetsIndex();
    } catch (err) {
      Utils.showToast(`Import failed: ${err.message}`);
    } finally {
      importFileInput.value = ""; // reset so re-selecting the same file re-triggers change
    }
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    if (currentSheet.questions.length === 0) {
      Utils.showToast("No questions to export.");
      return;
    }
    const csv = Utils.questionsToCSV(currentSheet.questions);
    const filename = `${Utils.slugify(currentSheet.name)}.csv`;
    Utils.downloadCSV(filename, csv);
  });

  /* ---------- Helpers ---------- */

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

})();