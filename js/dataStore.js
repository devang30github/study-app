/* ============================================
   DATASTORE.JS — Simplified data access layer
   No dashboard/streak. Fast question CRUD via sha caching.
   ============================================ */

const DataStore = (() => {

  const PATHS = {
    sheetsIndex: "sheets/index.json",
    sheetFile: (id) => `sheets/${id}.json`
  };

  // In-memory cache: sheetId -> { sheet, sha }
  // Avoids re-fetching before every question edit within the same page session.
  const sheetCache = {};

  /* ---------- Sheets Index (just id + name, kept minimal for speed) ---------- */

  async function getSheetsIndex() {
    const file = await GitHubAPI.getFile(PATHS.sheetsIndex, true);
    return file ? file.content : [];
  }

  async function saveSheetsIndex(indexArray) {
    // Index writes always re-fetch sha fresh since this happens rarely (create/delete/rename only)
    const existing = await GitHubAPI.getFile(PATHS.sheetsIndex, true);
    await GitHubAPI.putFile(PATHS.sheetsIndex, indexArray, existing ? existing.sha : null);
  }

  /* ---------- Individual Sheet ---------- */

  function emptySheet(id, name) {
    return {
      id,
      name,
      questions: [],
      lastScore: null,
      lastAttempted: null,
      totalSessions: 0
    };
  }

  /**
   * Loads a sheet and caches its sha for fast subsequent writes.
   * Pass forceRefresh=true if you suspect the cache is stale (rare).
   */
  async function getSheet(sheetId, forceRefresh = false) {
    if (!forceRefresh && sheetCache[sheetId]) {
      return sheetCache[sheetId].sheet;
    }

    const file = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
    if (!file) return null;

    sheetCache[sheetId] = { sheet: file.content, sha: file.sha };
    return file.content;
  }

  /**
   * Internal: write the sheet back using the cached sha, then update the cache
   * with the new sha GitHub returns. This means each subsequent edit stays 1 API call.
   */
  async function writeSheet(sheetId, updatedSheet, message) {
    const cached = sheetCache[sheetId];
    const sha = cached ? cached.sha : null;

    const result = await GitHubAPI.putFile(PATHS.sheetFile(sheetId), updatedSheet, sha, message);

    sheetCache[sheetId] = { sheet: updatedSheet, sha: result.sha };
    return updatedSheet;
  }

  async function createSheet(name) {
    const id = Utils.slugify(name) + "-" + Utils.generateId("").split("_")[1];
    const sheet = emptySheet(id, name);

    await GitHubAPI.putFile(PATHS.sheetFile(id), sheet, null, `Create sheet: ${name}`);
    sheetCache[id] = { sheet, sha: null }; // sha unknown yet, next write will re-fetch if needed

    // Refresh sha properly so future single-call writes work
    const fresh = await GitHubAPI.getFile(PATHS.sheetFile(id), true);
    sheetCache[id] = { sheet: fresh.content, sha: fresh.sha };

    const index = await getSheetsIndex();
    index.push({ id, name });
    await saveSheetsIndex(index);

    return sheet;
  }

  async function renameSheet(sheetId, newName) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const updated = { ...sheet, name: newName };
    await writeSheet(sheetId, updated, `Rename sheet to ${newName}`);

    const index = await getSheetsIndex();
    const updatedIndex = index.map(s => s.id === sheetId ? { ...s, name: newName } : s);
    await saveSheetsIndex(updatedIndex);

    return updated;
  }

  async function deleteSheet(sheetId) {
    const cached = sheetCache[sheetId];
    let sha = cached ? cached.sha : null;

    if (!sha) {
      const file = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
      sha = file ? file.sha : null;
    }

    if (sha) {
      await GitHubAPI.deleteFile(PATHS.sheetFile(sheetId), sha, `Delete sheet ${sheetId}`);
    }

    delete sheetCache[sheetId];

    const index = await getSheetsIndex();
    const updatedIndex = index.filter(s => s.id !== sheetId);
    await saveSheetsIndex(updatedIndex);
  }

  /* ---------- Questions (fast path — 1 API call each) ---------- */

  // questionData: { type: "text"|"mcq", q, a, options? }
  async function addQuestion(sheetId, questionData) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const newQuestion = {
      id: Utils.generateId("q"),
      type: questionData.type || "text",
      q: questionData.q,
      a: questionData.a
    };
    if (questionData.type === "mcq") {
      newQuestion.options = questionData.options;
    }

    const updated = {
      ...sheet,
      questions: [...sheet.questions, newQuestion]
    };
    await writeSheet(sheetId, updated, `Add question to ${sheetId}`);
    return updated.questions;
  }

  
  // questionData: { type: "text"|"mcq", q, a, options? }
  async function editQuestion(sheetId, questionId, questionData) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const updated = {
      ...sheet,
      questions: sheet.questions.map(item => {
        if (item.id !== questionId) return item;

        const edited = {
          ...item,
          type: questionData.type || "text",
          q: questionData.q,
          a: questionData.a
        };

        if (questionData.type === "mcq") {
          edited.options = questionData.options;
        } else {
          delete edited.options; // switching from mcq -> text drops old options
        }

        return edited;
      })
    };
    await writeSheet(sheetId, updated, `Edit question in ${sheetId}`);
    return updated.questions;
  }

  

  async function deleteQuestion(sheetId, questionId) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const updated = {
      ...sheet,
      questions: sheet.questions.filter(item => item.id !== questionId)
    };
    await writeSheet(sheetId, updated, `Delete question from ${sheetId}`);
    return updated.questions;
  }

  async function importQuestionsFromCSV(sheetId, csvText, mode = "append") {
    const rows = Utils.parseCSV(csvText);
    const parsed = Utils.csvRowsToQuestions(rows);

    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const finalQuestions = mode === "replace" ? parsed : [...sheet.questions, ...parsed];
    const updated = { ...sheet, questions: finalQuestions };
    await writeSheet(sheetId, updated, `Import questions into ${sheetId}`);
    return finalQuestions;
  }

  /* ---------- Practice Result (1 write at end of session) ---------- */

  async function recordPracticeResult(sheetId, { correct, total }) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const updated = {
      ...sheet,
      lastScore: correct,
      lastTotal: total,
      lastAttempted: Utils.todayStr(),
      totalSessions: (sheet.totalSessions || 0) + 1
    };
    await writeSheet(sheetId, updated, `Record practice session for ${sheetId}`);
    return updated;
  }

  return {
    getSheetsIndex,
    getSheet,
    createSheet,
    renameSheet,
    deleteSheet,
    addQuestion,
    editQuestion,
    deleteQuestion,
    importQuestionsFromCSV,
    recordPracticeResult
  };

})();