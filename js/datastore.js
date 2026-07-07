/* ============================================
   DATASTORE.JS — High-level data access layer
   Wraps GitHubAPI calls into app-specific operations
   ============================================ */

const DataStore = (() => {

  const PATHS = {
    sheetsIndex: "sheets/index.json",
    sheetFile: (id) => `sheets/${id}.json`,
    dailyFile: (dateStr) => `progress/daily/${dateStr}.json`,
    streakFile: "progress/streak.json",
    statsFile: "meta/sheetStats.json"
  };

  /* ---------- Sheets Index ---------- */

  // [{ id, name, questionCount, createdAt }]
  async function getSheetsIndex() {
    const file = await GitHubAPI.getFile(PATHS.sheetsIndex, true);
    return file ? file.content : [];
  }

  async function saveSheetsIndex(indexArray) {
    await GitHubAPI.updateJSON(PATHS.sheetsIndex, () => indexArray, []);
  }

  /* ---------- Individual Sheet (with questions) ---------- */

  // { id, name, questions: [{ id, q, a }] }
  async function getSheet(sheetId) {
    const file = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
    return file ? file.content : null;
  }

  async function createSheet(name) {
    const id = Utils.slugify(name) + "-" + Utils.generateId("").split("_")[1]; // unique-ish slug
    const sheet = { id, name, questions: [] };

    await GitHubAPI.putFile(PATHS.sheetFile(id), sheet, null, `Create sheet: ${name}`);

    const index = await getSheetsIndex();
    index.push({ id, name, questionCount: 0, createdAt: Utils.todayStr() });
    await saveSheetsIndex(index);

    return sheet;
  }

  async function renameSheet(sheetId, newName) {
    const sheetFile = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
    if (!sheetFile) throw new Error("Sheet not found");

    const updatedSheet = { ...sheetFile.content, name: newName };
    await GitHubAPI.putFile(PATHS.sheetFile(sheetId), updatedSheet, sheetFile.sha, `Rename sheet to ${newName}`);

    const index = await getSheetsIndex();
    const updatedIndex = index.map(s => s.id === sheetId ? { ...s, name: newName } : s);
    await saveSheetsIndex(updatedIndex);
  }

  async function deleteSheet(sheetId) {
    const sheetFile = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
    if (sheetFile) {
      await GitHubAPI.deleteFile(PATHS.sheetFile(sheetId), sheetFile.sha, `Delete sheet ${sheetId}`);
    }

    const index = await getSheetsIndex();
    const updatedIndex = index.filter(s => s.id !== sheetId);
    await saveSheetsIndex(updatedIndex);

    // Also clean up its stats entry
    await GitHubAPI.updateJSON(PATHS.statsFile, (stats) => {
      const updated = { ...stats };
      delete updated[sheetId];
      return updated;
    }, {});
  }

  /* ---------- Questions within a Sheet ---------- */

  async function saveSheetQuestions(sheetId, questions) {
    const sheetFile = await GitHubAPI.getFile(PATHS.sheetFile(sheetId), true);
    if (!sheetFile) throw new Error("Sheet not found");

    const updatedSheet = { ...sheetFile.content, questions };
    await GitHubAPI.putFile(PATHS.sheetFile(sheetId), updatedSheet, sheetFile.sha, `Update questions in ${sheetId}`);

    // Keep questionCount in sync on the index
    const index = await getSheetsIndex();
    const updatedIndex = index.map(s =>
      s.id === sheetId ? { ...s, questionCount: questions.length } : s
    );
    await saveSheetsIndex(updatedIndex);
  }

  async function addQuestion(sheetId, q, a) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");
    sheet.questions.push({ id: Utils.generateId("q"), q, a });
    await saveSheetQuestions(sheetId, sheet.questions);
    return sheet.questions;
  }

  async function editQuestion(sheetId, questionId, newQ, newA) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");
    sheet.questions = sheet.questions.map(item =>
      item.id === questionId ? { ...item, q: newQ, a: newA } : item
    );
    await saveSheetQuestions(sheetId, sheet.questions);
    return sheet.questions;
  }

  async function deleteQuestion(sheetId, questionId) {
    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");
    sheet.questions = sheet.questions.filter(item => item.id !== questionId);
    await saveSheetQuestions(sheetId, sheet.questions);
    return sheet.questions;
  }

  async function importQuestionsFromCSV(sheetId, csvText, mode = "append") {
    const rows = Utils.parseCSV(csvText);
    const parsed = Utils.csvRowsToQuestions(rows);

    const sheet = await getSheet(sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const finalQuestions = mode === "replace" ? parsed : [...sheet.questions, ...parsed];
    await saveSheetQuestions(sheetId, finalQuestions);
    return finalQuestions;
  }

  /* ---------- Daily Progress ---------- */

  async function getDailyRecord(dateStr) {
    const file = await GitHubAPI.getFile(PATHS.dailyFile(dateStr), true);
    return file ? file.content : null;
  }

  function emptyDailyRecord(dateStr) {
    return {
      date: dateStr,
      totalScore: 0,
      correct: 0,
      wrong: 0,
      sheets: {} // { [sheetId]: { questionsAnswered: [ids], correct, wrong } }
    };
  }

  /**
   * Record the result of answering one question. Called from practice.js.
   * Updates today's daily record. Does NOT touch streak.json (dashboard does that on load).
   */
  async function recordAnswer(sheetId, questionId, wasCorrect) {
    const today = Utils.todayStr();

    const updated = await GitHubAPI.updateJSON(
      PATHS.dailyFile(today),
      (current) => {
        const record = current && current.date ? current : emptyDailyRecord(today);

        if (!record.sheets[sheetId]) {
          record.sheets[sheetId] = { questionsAnswered: [], correct: 0, wrong: 0 };
        }

        const sheetRecord = record.sheets[sheetId];
        if (!sheetRecord.questionsAnswered.includes(questionId)) {
          sheetRecord.questionsAnswered.push(questionId);
        }

        if (wasCorrect) {
          sheetRecord.correct += 1;
          record.correct += 1;
          record.totalScore += 1;
        } else {
          sheetRecord.wrong += 1;
          record.wrong += 1;
        }

        return record;
      },
      emptyDailyRecord(today)
    );

    return updated;
  }

  /* ---------- Sheet Stats (per-sheet history) ---------- */
  // { [sheetId]: { totalQuestions, sessions, lastScore, lastPracticed, streak } }

  async function getSheetStats() {
    const file = await GitHubAPI.getFile(PATHS.statsFile, true);
    return file ? file.content : {};
  }

  /**
   * Called at the END of a practice session (practice.js) with the session's results.
   * sessionResult: { correct, total }
   */
  async function recordSheetSession(sheetId, sessionResult) {
    const today = Utils.todayStr();

    const updated = await GitHubAPI.updateJSON(
      PATHS.statsFile,
      (stats) => {
        const existing = stats[sheetId] || {
          totalQuestions: 0,
          sessions: 0,
          lastScore: 0,
          lastPracticed: null,
          streak: 0
        };

        let newStreak = existing.streak || 0;
        if (existing.lastPracticed === today) {
          // already practiced today, streak unchanged
        } else if (existing.lastPracticed === Utils.yesterdayStr()) {
          newStreak += 1;
        } else {
          newStreak = 1;
        }

        return {
          ...stats,
          [sheetId]: {
            totalQuestions: sessionResult.total,
            sessions: existing.sessions + 1,
            lastScore: sessionResult.correct,
            lastPracticed: today,
            streak: newStreak
          }
        };
      },
      {}
    );

    return updated;
  }

  /* ---------- Global Streak ---------- */

  async function getStreakData() {
    const file = await GitHubAPI.getFile(PATHS.streakFile, true);
    return file ? file.content : { currentStreak: 0, lastCompletedDate: null, longestStreak: 0 };
  }

  async function saveStreakData(streakData) {
    await GitHubAPI.updateJSON(PATHS.streakFile, () => streakData, streakData);
  }

  /* ---------- Dashboard Aggregation ---------- */

  /**
   * Fetches everything the dashboard needs in one go, and runs the
   * streak/goal evaluation. Persists updated streak.json if it changed.
   */
  async function getDashboardData() {
    const today = Utils.todayStr();

    const [sheetsIndex, dailyRecord, streakData, sheetStats] = await Promise.all([
      getSheetsIndex(),
      getDailyRecord(today),
      getStreakData(),
      getSheetStats()
    ]);

    const evaluation = Streak.evaluateDailyState(sheetsIndex, dailyRecord, streakData);

    // Persist streak changes only if something actually changed
    const streakChanged =
      evaluation.streak.currentStreak !== streakData.currentStreak ||
      evaluation.streak.lastCompletedDate !== streakData.lastCompletedDate;

    if (streakChanged) {
      await saveStreakData(evaluation.streak);
    }

    // Find last practiced sheet (most recent lastPracticed across sheetStats)
    let lastSheetPracticed = null;
    let lastDate = null;
    for (const sheetId in sheetStats) {
      const s = sheetStats[sheetId];
      if (s.lastPracticed && (!lastDate || s.lastPracticed > lastDate)) {
        lastDate = s.lastPracticed;
        lastSheetPracticed = sheetId;
      }
    }
    const lastSheetInfo = sheetsIndex.find(s => s.id === lastSheetPracticed) || null;

    return {
      sheetsIndex,
      totalSheets: sheetsIndex.length,
      todayScore: dailyRecord ? dailyRecord.totalScore : 0,
      questionsAnsweredToday: evaluation.goalStatus.answered,
      totalQuestionsAllSheets: evaluation.goalStatus.total,
      goalPercent: evaluation.goalStatus.percent,
      goalMet: evaluation.goalStatus.goalMet,
      justCompletedToday: evaluation.justCompletedToday,
      currentStreak: evaluation.streak.currentStreak,
      longestStreak: evaluation.streak.longestStreak,
      lastSheetPracticed: lastSheetInfo ? lastSheetInfo.name : "None yet",
      sheetStats
    };
  }

  return {
    getSheetsIndex,
    getSheet,
    createSheet,
    renameSheet,
    deleteSheet,
    saveSheetQuestions,
    addQuestion,
    editQuestion,
    deleteQuestion,
    importQuestionsFromCSV,
    getDailyRecord,
    recordAnswer,
    getSheetStats,
    recordSheetSession,
    getStreakData,
    saveStreakData,
    getDashboardData
  };

})();