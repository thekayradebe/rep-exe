// REP.exe — GitHub Gist sync. Talks to api.github.com only; no other server.
// The workout log lives in one secret gist file. Each device keeps its own copy and merges on sync.

const API = 'https://api.github.com';
export const GIST_FILE = 'rep-exe-log.json';
const GIST_DESC = 'REP.exe workout log (synced by the app — do not rename the file)';

const SCOPE_MSG = 'This key can’t use gists. Make a classic token with the “gist” box ticked.';

export class SyncError extends Error {
  /** code: 'auth' (key rejected) · 'scope' (key lacks gist permission) · 'missing' (gist gone) · 'offline' · 'http' */
  constructor(code, message) { super(message); this.code = code; }
}

async function gh(token, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('offline', 'No connection.');
  }
  if (res.status === 401) throw new SyncError('auth', 'GitHub didn’t accept this key.');
  if (res.status === 403) throw new SyncError('scope', SCOPE_MSG);
  if (res.status === 404) throw new SyncError('missing', 'Not found on GitHub.');
  if (!res.ok) throw new SyncError('http', `GitHub error ${res.status}. Try again shortly.`);
  return res.json();
}

/** Finds the REP.exe gist in this GitHub account, or creates a secret one holding `initialContent`. */
export async function connect(token, initialContent) {
  try { return await findOrCreate(token, initialContent); } catch (e) {
    // GitHub answers 404 when a key lacks the gist permission.
    if (e.code === 'missing') throw new SyncError('scope', SCOPE_MSG);
    throw e;
  }
}

async function findOrCreate(token, initialContent) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[GIST_FILE]);
    if (hit) return { gistId: hit.id, created: false };
    if (list.length < 100) break;
  }
  const g = await gh(token, '/gists', {
    method: 'POST',
    body: { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: initialContent } } },
  });
  return { gistId: g.id, created: true };
}

/** Returns the gist file's text, or null if the file is missing. */
export async function read(token, gistId) {
  const g = await gh(token, `/gists/${gistId}`);
  const f = g.files?.[GIST_FILE];
  if (!f) return null;
  if (!f.truncated) return f.content;
  // Large files are cut short in the API response; fetch the full text.
  try {
    const res = await fetch(f.raw_url, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    return await res.text();
  } catch {
    throw new SyncError('offline', 'Couldn’t download the full log.');
  }
}

export async function write(token, gistId, content) {
  await gh(token, `/gists/${gistId}`, { method: 'PATCH', body: { files: { [GIST_FILE]: { content } } } });
}
