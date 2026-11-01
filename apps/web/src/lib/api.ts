export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error', public details?: any) { super(message); }
}

const TOKEN_KEY = 'cq.teacher';
export const teacherToken = () => localStorage.getItem(TOKEN_KEY);
export const setTeacherToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api<T = any>(method: string, path: string, opts: { body?: unknown; attempt?: string; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const t = teacherToken();
  if (t && opts.auth !== false && !opts.attempt) headers.authorization = `Bearer ${t}`;
  if (opts.attempt) headers['x-attempt-token'] = opts.attempt;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'offline');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong', data.code, data.details ?? data.issues);
  return data as T;
}

export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${teacherToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
