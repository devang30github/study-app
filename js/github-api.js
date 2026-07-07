/* ============================================
   GITHUB-API.JS — Wrapper around GitHub Contents API
   Reads/writes JSON files in the private study-data repo
   ============================================ */

const GitHubAPI = (() => {

  const API_BASE = "https://api.github.com";

  function getConfig() {
    return {
      token: localStorage.getItem("gh_token"),
      owner: localStorage.getItem("gh_owner"),
      repo: localStorage.getItem("gh_repo") || "study-data",
      branch: localStorage.getItem("gh_branch") || "main"
    };
  }

  function isConfigured() {
    const cfg = getConfig();
    return !!(cfg.token && cfg.owner && cfg.repo);
  }

  function authHeaders() {
    const { token } = getConfig();
    return {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function contentsUrl(path) {
    const { owner, repo } = getConfig();
    return `${API_BASE}/repos/${owner}/${repo}/contents/${path}`;
  }

  /**
   * Fetch a file's content + sha from the repo.
   * Returns { content: <parsed JSON or string>, sha } or null if file doesn't exist.
   */
  async function getFile(path, parseJson = true) {
    const { branch } = getConfig();
    const url = `${contentsUrl(path)}?ref=${branch}`;

    const res = await fetch(url, { headers: authHeaders() });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub getFile failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    // content comes back base64-encoded
    const decoded = decodeURIComponent(
      atob(data.content.replace(/\n/g, ""))
        .split("")
        .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );

    return {
      content: parseJson ? JSON.parse(decoded) : decoded,
      sha: data.sha
    };
  }

  /**
   * Create or update a file in the repo.
   * `content` can be an object (will be JSON.stringified) or a raw string.
   * If updating an existing file, pass its current `sha`; if creating new, omit it.
   */
  async function putFile(path, content, sha = null, message = null) {
    const isString = typeof content === "string";
    const bodyText = isString ? content : JSON.stringify(content, null, 2);

    // UTF-8 safe base64 encode
    const base64Content = btoa(
      encodeURIComponent(bodyText).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode("0x" + p1)
      )
    );

    const payload = {
      message: message || `Update ${path}`,
      content: base64Content,
      branch: getConfig().branch
    };
    if (sha) payload.sha = sha;

    const res = await fetch(contentsUrl(path), {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub putFile failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return { sha: data.content.sha };
  }

  /**
   * Convenience: read-modify-write a JSON file safely.
   * Fetches current sha, applies your updater function to current content,
   * then writes back. Pass a default value in case the file doesn't exist yet.
   */
  async function updateJSON(path, updaterFn, defaultValue = {}) {
    const existing = await getFile(path, true);
    const currentContent = existing ? existing.content : defaultValue;
    const updated = await updaterFn(currentContent);
    await putFile(path, updated, existing ? existing.sha : null);
    return updated;
  }

  /**
   * List files in a directory. Returns array of { name, path, type } or [] if dir doesn't exist.
   */
  async function listDir(path) {
    const { branch } = getConfig();
    const url = `${contentsUrl(path)}?ref=${branch}`;

    const res = await fetch(url, { headers: authHeaders() });

    if (res.status === 404) return [];
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub listDir failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type
    })) : [];
  }

  async function deleteFile(path, sha, message = null) {
    const res = await fetch(contentsUrl(path), {
      method: "DELETE",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message || `Delete ${path}`,
        sha,
        branch: getConfig().branch
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub deleteFile failed (${res.status}): ${errText}`);
    }
    return true;
  }

  /**
   * Verify the token/repo config actually works (used during login).
   * Returns true/false instead of throwing, for easy UI handling.
   */
  async function testConnection() {
    try {
      const { owner, repo } = getConfig();
      const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, {
        headers: authHeaders()
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function saveConfig({ token, owner, repo, branch }) {
    localStorage.setItem("gh_token", token);
    localStorage.setItem("gh_owner", owner);
    localStorage.setItem("gh_repo", repo || "study-data");
    localStorage.setItem("gh_branch", branch || "main");
  }

  function clearConfig() {
    localStorage.removeItem("gh_token");
    localStorage.removeItem("gh_owner");
    localStorage.removeItem("gh_repo");
    localStorage.removeItem("gh_branch");
  }

  return {
    isConfigured,
    getFile,
    putFile,
    updateJSON,
    listDir,
    deleteFile,
    testConnection,
    saveConfig,
    clearConfig,
    getConfig
  };

})();