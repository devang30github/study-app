/* ============================================
   AUTH.JS — Local password gate + GitHub config setup
   ============================================ */

const Auth = (() => {

  const SESSION_KEY = "study_app_unlocked";
  const PASSWORD_HASH_KEY = "study_app_password_hash";

  /* ---------- Simple hashing (SHA-256 via SubtleCrypto) ---------- */

  async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- Password Setup / Check ---------- */

  function hasPasswordSet() {
    return !!localStorage.getItem(PASSWORD_HASH_KEY);
  }

  async function setPassword(password) {
    const hash = await hashString(password);
    localStorage.setItem(PASSWORD_HASH_KEY, hash);
  }

  async function checkPassword(password) {
    const storedHash = localStorage.getItem(PASSWORD_HASH_KEY);
    if (!storedHash) return false;
    const inputHash = await hashString(password);
    return inputHash === storedHash;
  }

  /* ---------- Session (unlock state) ---------- */

  function isUnlocked() {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  }

  function unlock() {
    sessionStorage.setItem(SESSION_KEY, "true");
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ---------- Full Setup Check ----------
     App is "fully set up" when both a local password
     and GitHub config (token/owner/repo) exist.
  */

  function isFullySetUp() {
    return hasPasswordSet() && GitHubAPI.isConfigured();
  }

  /* ---------- Guard for protected pages ----------
     Call this at the top of every protected page (dashboard, sheet, admin).
     Redirects to index.html if not set up or not unlocked.
  */

  function guardPage() {
    if (!isFullySetUp()) {
      window.location.href = "index.html";
      return false;
    }
    if (!isUnlocked()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  /* ---------- Logout ---------- */

  function logout() {
    lock();
    window.location.href = "index.html";
  }

  return {
    hasPasswordSet,
    setPassword,
    checkPassword,
    isUnlocked,
    unlock,
    lock,
    isFullySetUp,
    guardPage,
    logout
  };

})();