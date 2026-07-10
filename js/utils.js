/* ============================================
   UTILS.JS — Shared helper functions
   ============================================ */

const Utils = (() => {

  /* ---------- Answer Checking ---------- */

  /**
   * Normalize an answer for comparison:
   * - trim leading/trailing whitespace
   * - collapse multiple internal spaces into one
   * - lowercase (so "Apple" === "apple")
   */
  function normalizeAnswer(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function isAnswerCorrect(userAnswer, correctAnswer) {
    return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
  }

  /* ---------- Date Helpers ---------- */

  // Returns "YYYY-MM-DD" for a given Date object (defaults to now), local time.
  function dateToStr(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function todayStr() {
    return dateToStr(new Date());
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateToStr(d);
  }

  // Difference in whole days between two "YYYY-MM-DD" strings (a - b)
  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(dateStrA + "T00:00:00");
    const b = new Date(dateStrB + "T00:00:00");
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((a - b) / msPerDay);
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  /* ---------- Array Helpers ---------- */

  // Fisher-Yates shuffle, returns a new array (does not mutate original)
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------- ID Generation ---------- */

  function generateId(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Turn a sheet name into a safe filename-friendly slug, e.g. "Number System" -> "number-system"
  function slugify(name) {
    return String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  /* ---------- CSV Parsing / Export ----------
     Simple CSV format expected:
       question,answer
       "What is 2+2?","4"
     Supports quoted fields with embedded commas.
  */

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n" || char === "\r") {
          if (char === "\r" && next === "\n") i++;
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += char;
        }
      }
    }
    // last field/row
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(r => r.some(cell => cell.trim() !== ""));
  }

  // Convert parsed CSV rows into question objects.
  // 2 columns (question, answer) -> type "text"
  // 5 columns (question, correct_answer, wrong1, wrong2, wrong3) -> type "mcq"
  // Header row is optional and auto-detected/skipped if present.
  function csvRowsToQuestions(rows) {
    if (rows.length === 0) return [];

    let startIdx = 0;
    const firstRow = rows[0].map(c => c.trim().toLowerCase());
    if (firstRow[0] === "question" && (firstRow[1] === "answer" || firstRow[1] === "correct_answer")) {
      startIdx = 1;
    }

    const questions = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const q = row[0] ? row[0].trim() : "";
      if (!q) continue;

      if (row.length >= 5) {
        // MCQ: question, correct_answer, wrong1, wrong2, wrong3
        const correct = (row[1] || "").trim();
        const wrong1 = (row[2] || "").trim();
        const wrong2 = (row[3] || "").trim();
        const wrong3 = (row[4] || "").trim();

        if (correct && wrong1 && wrong2 && wrong3) {
          questions.push({
            id: generateId("q"),
            type: "mcq",
            q,
            a: correct,
            options: [correct, wrong1, wrong2, wrong3]
          });
        }
      } else {
        // Text: question, answer
        const a = row[1] ? row[1].trim() : "";
        if (a) {
          questions.push({
            id: generateId("q"),
            type: "text",
            q,
            a
          });
        }
      }
    }
    return questions;
  }

  function questionsToCSV(questions) {
    const escapeField = (val) => {
      const str = String(val ?? "");
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Header covers the widest possible row (MCQ). Text rows just leave trailing columns empty.
    const lines = ["question,correct_answer,wrong_option_1,wrong_option_2,wrong_option_3"];

    for (const item of questions) {
      if (item.type === "mcq") {
        const wrongOptions = (item.options || []).filter(opt => opt !== item.a);
        const [w1, w2, w3] = wrongOptions;
        lines.push(
          `${escapeField(item.q)},${escapeField(item.a)},${escapeField(w1)},${escapeField(w2)},${escapeField(w3)}`
        );
      } else {
        lines.push(`${escapeField(item.q)},${escapeField(item.a)},,,`);
      }
    }
    return lines.join("\n");
  }


  function downloadCSV(filename, csvText) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ---------- Small UI Helpers ---------- */

  function showToast(message, duration = 2500) {
    let toast = document.getElementById("global-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "global-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  return {
    normalizeAnswer,
    isAnswerCorrect,
    dateToStr,
    todayStr,
    yesterdayStr,
    daysBetween,
    formatDisplayDate,
    shuffle,
    generateId,
    slugify,
    parseCSV,
    csvRowsToQuestions,
    questionsToCSV,
    downloadCSV,
    showToast
  };

})();