// Requests to the server. X-Ledgy marks them as same-site (the server blocks changes without it).
export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Ledgy': '1', ...opts.headers } });
  if (res.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(body?.error || res.statusText); e.status = res.status; throw e; }
  return body;
}
