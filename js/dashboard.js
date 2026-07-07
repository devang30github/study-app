/* ============================================
   DASHBOARD.JS — Dashboard page logic
   ============================================ */

(async function () {

  if (!Auth.guardPage()) return; // redirects to index.html if not logged in

  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("dashboard-content");

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });

  try {
    const data = await DataStore.getDashboardData();
    renderDashboard(data);
  } catch (err) {
    loadingState.innerHTML = `
      <p style="color: var(--color-error);">Failed to load dashboard: ${err.message}</p>
      <button class="btn btn-secondary mt-md" onclick="location.reload()">Retry</button>
    `;
    return;
  }

  loadingState.classList.add("hidden");
  content.classList.remove("hidden");

  function renderDashboard(data) {
    // Stat cards
    document.getElementById("stat-today-score").textContent = data.todayScore;
    document.getElementById("stat-streak").textContent = `${data.currentStreak} 🔥`;
    document.getElementById("stat-total-sheets").textContent = data.totalSheets;
    document.getElementById("stat-answered-today").textContent =
      `${data.questionsAnsweredToday} / ${data.totalQuestionsAllSheets}`;

    // Goal progress bar
    const fill = document.getElementById("goal-progress-fill");
    fill.style.width = `${data.goalPercent}%`;
    if (data.goalMet) fill.classList.add("complete");

    document.getElementById("goal-fraction").textContent =
      `${data.questionsAnsweredToday} / ${data.totalQuestionsAllSheets}`;

    const goalStatusText = document.getElementById("goal-status-text");
    if (data.totalQuestionsAllSheets === 0) {
      goalStatusText.textContent = "Create a sheet and add questions to set today's goal.";
    } else if (data.goalMet) {
      goalStatusText.textContent = "Goal complete for today. Nice work!";
    } else {
      const remaining = data.totalQuestionsAllSheets - data.questionsAnsweredToday;
      goalStatusText.textContent = `${remaining} question${remaining === 1 ? "" : "s"} left to complete today's goal.`;
    }

    // Congrats banner — only if just completed this load
    if (data.justCompletedToday) {
      document.getElementById("congrats-banner").classList.remove("hidden");
    }

    // Last sheet practiced
    document.getElementById("stat-last-sheet").textContent = data.lastSheetPracticed;

    // Sheet list
    renderSheetList(data.sheetsIndex, data.sheetStats);
  }

  function renderSheetList(sheetsIndex, sheetStats) {
    const listEl = document.getElementById("sheet-list");
    const emptyEl = document.getElementById("empty-sheets");

    if (sheetsIndex.length === 0) {
      listEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      return;
    }

    listEl.innerHTML = "";
    sheetsIndex.forEach(sheet => {
      const stats = sheetStats[sheet.id];
      const lastPracticed = stats ? Utils.formatDisplayDate(stats.lastPracticed) : "Never";
      const streakBadge = stats && stats.streak > 0
        ? `<span class="badge badge-streak">${stats.streak} 🔥</span>`
        : "";

      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(sheet.name)}</div>
          <div class="list-item-sub">
            ${sheet.questionCount} question${sheet.questionCount === 1 ? "" : "s"} · Last practiced: ${lastPracticed}
            ${streakBadge}
          </div>
        </div>
        <div class="list-item-actions">
          <a href="sheet.html?id=${encodeURIComponent(sheet.id)}" class="btn btn-primary btn-sm">Practice</a>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

})();