/* ============================================
   HOME.JS — Simple sheet list (replaces dashboard)
   ============================================ */

(async function () {

  if (!Auth.guardPage()) return;

  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });

  const loadingState = document.getElementById("loading-state");
  const homeContent = document.getElementById("home-content");
  const sheetListEl = document.getElementById("sheet-list");
  const emptyStateEl = document.getElementById("empty-state");

  try {
    const sheetsIndex = await DataStore.getSheetsIndex();
    renderSheetList(sheetsIndex);
  } catch (err) {
    loadingState.innerHTML = `
      <p style="color: var(--color-error);">Failed to load: ${err.message}</p>
      <button class="btn btn-secondary mt-md" onclick="location.reload()">Retry</button>
    `;
    return;
  }

  loadingState.classList.add("hidden");
  homeContent.classList.remove("hidden");

  async function renderSheetList(sheetsIndex) {
    if (sheetsIndex.length === 0) {
      sheetListEl.classList.add("hidden");
      emptyStateEl.classList.remove("hidden");
      return;
    }

    sheetListEl.classList.remove("hidden");
    emptyStateEl.classList.add("hidden");
    sheetListEl.innerHTML = `<div class="text-center" style="padding: var(--space-lg);"><div class="spinner"></div></div>`;

    // Fetch each sheet's full data to show question count + last score.
    // (Fine at your scale of 50-100 sheets; each is a small file.)
    const sheets = await Promise.all(
      sheetsIndex.map(s => DataStore.getSheet(s.id))
    );

    sheetListEl.innerHTML = "";
    sheets.forEach(sheet => {
      if (!sheet) return;

      const lastScoreText = sheet.lastAttempted
        ? `Last score: ${sheet.lastScore}/${sheet.lastTotal} on ${Utils.formatDisplayDate(sheet.lastAttempted)}`
        : "Not practiced yet";

      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(sheet.name)}</div>
          <div class="list-item-sub">
            ${sheet.questions.length} question${sheet.questions.length === 1 ? "" : "s"} · ${lastScoreText}
          </div>
        </div>
        <div class="list-item-actions">
          <a href="sheet.html?id=${encodeURIComponent(sheet.id)}" class="btn btn-primary btn-sm">Practice</a>
        </div>
      `;
      sheetListEl.appendChild(item);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

})();