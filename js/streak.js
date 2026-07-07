/* ============================================
   STREAK.JS — Daily goal + streak calculation logic
   Pure functions: no direct API calls. Takes data in, returns results.
   ============================================ */

const Streak = (() => {

  /**
   * Calculate total number of questions across all sheets.
   * sheetsIndex: array of sheet summary objects, each with { id, questionCount }
   */
  function getTotalQuestionCount(sheetsIndex) {
    return sheetsIndex.reduce((sum, sheet) => sum + (sheet.questionCount || 0), 0);
  }

  /**
   * Determine how many *unique* questions have been practiced today,
   * across all sheets, based on today's daily progress record.
   *
   * dailyRecord shape:
   * {
   *   date, totalScore, correct, wrong,
   *   sheets: {
   *     [sheetId]: { questionsAnswered: [questionId, ...], correct, wrong }
   *   }
   * }
   */
  function getUniqueQuestionsAnsweredToday(dailyRecord) {
    if (!dailyRecord || !dailyRecord.sheets) return 0;
    let count = 0;
    for (const sheetId in dailyRecord.sheets) {
      const uniqueIds = new Set(dailyRecord.sheets[sheetId].questionsAnswered || []);
      count += uniqueIds.size;
    }
    return count;
  }

  /**
   * Check whether today's goal (practice every question from every sheet) is met.
   * Returns { goalMet, answered, total, percent }
   */
  function checkGoalStatus(sheetsIndex, dailyRecord) {
    const total = getTotalQuestionCount(sheetsIndex);
    const answered = getUniqueQuestionsAnsweredToday(dailyRecord);
    const percent = total === 0 ? 0 : Math.min(100, Math.round((answered / total) * 100));
    const goalMet = total > 0 && answered >= total;
    return { goalMet, answered, total, percent };
  }

  /**
   * Decide the new streak state given:
   * - streakData: { currentStreak, lastCompletedDate, longestStreak }
   * - todayGoalMet: boolean (did today's goal just get completed?)
   * - today: "YYYY-MM-DD" string
   *
   * Rules:
   * - If today's goal is met and lastCompletedDate is already today -> no change (already counted).
   * - If today's goal is met and lastCompletedDate is yesterday -> streak continues (+1).
   * - If today's goal is met and lastCompletedDate is older than yesterday (or null) -> streak resets to 1.
   * - If today's goal is not met -> streak data unchanged (we only update on completion;
   *   the "reset to 0" for a missed day is handled by checkForMissedDay() below,
   *   which should run when the dashboard loads, BEFORE checking today's status).
   */
  function updateStreakOnGoalMet(streakData, today) {
    const current = streakData || { currentStreak: 0, lastCompletedDate: null, longestStreak: 0 };

    if (current.lastCompletedDate === today) {
      // Already recorded today, nothing to do
      return current;
    }

    const y = Utils.yesterdayStr();
    let newStreak;

    if (current.lastCompletedDate === y) {
      newStreak = (current.currentStreak || 0) + 1;
    } else {
      newStreak = 1; // streak was broken or this is the first ever completion
    }

    return {
      currentStreak: newStreak,
      lastCompletedDate: today,
      longestStreak: Math.max(newStreak, current.longestStreak || 0)
    };
  }

  /**
   * Call this once when the dashboard loads (BEFORE checking today's goal progress).
   * If the last completed date is neither today nor yesterday, the streak is broken —
   * reset currentStreak to 0 (but keep longestStreak as history).
   *
   * This handles the "if I miss a day, streak resets" rule, since a missed day means
   * no goal-completion event ever fires for that day — we have to detect the gap
   * passively when the user next opens the app.
   */
  function checkForMissedDay(streakData, today) {
    const current = streakData || { currentStreak: 0, lastCompletedDate: null, longestStreak: 0 };

    if (!current.lastCompletedDate) {
      return current; // never completed a day yet, nothing to reset
    }

    const y = Utils.yesterdayStr();

    if (current.lastCompletedDate === today || current.lastCompletedDate === y) {
      return current; // streak still valid (today already done, or yesterday was done)
    }

    // Gap of 2+ days since last completion -> streak broken
    return {
      currentStreak: 0,
      lastCompletedDate: current.lastCompletedDate,
      longestStreak: current.longestStreak || 0
    };
  }

  /**
   * Convenience: given sheetsIndex + today's dailyRecord + streakData,
   * returns everything the dashboard needs in one call, including
   * whether we just crossed into "goal met" for the first time today
   * (useful for showing the congratulatory message only once per day, not on every reload).
   */
  function evaluateDailyState(sheetsIndex, dailyRecord, streakData) {
    const today = Utils.todayStr();
    const cleanedStreak = checkForMissedDay(streakData, today);
    const goalStatus = checkGoalStatus(sheetsIndex, dailyRecord);

    let updatedStreak = cleanedStreak;
    let justCompletedToday = false;

    if (goalStatus.goalMet) {
      const before = cleanedStreak.lastCompletedDate;
      updatedStreak = updateStreakOnGoalMet(cleanedStreak, today);
      justCompletedToday = before !== today; // true only the first time it's marked today
    }

    return {
      goalStatus,       // { goalMet, answered, total, percent }
      streak: updatedStreak,  // { currentStreak, lastCompletedDate, longestStreak }
      justCompletedToday
    };
  }

  return {
    getTotalQuestionCount,
    getUniqueQuestionsAnsweredToday,
    checkGoalStatus,
    updateStreakOnGoalMet,
    checkForMissedDay,
    evaluateDailyState
  };

})();