export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error', public details?: any) { super(message); }
}

/** Where the server lives. Empty = the same address as the website (local dev proxy, or the server serving the site itself). Set VITE_API_URL when the website is hosted elsewhere, e.g. Vercel. */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

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
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'offline');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong', data.code, data.details ?? data.issues);
  return data as T;
}

/** Sends a picture to the server and returns its id. Only the image bytes travel; the quest keeps just the id. */
export async function uploadImage(blob: Blob): Promise<{ id: string; url: string | null }> {
  let res: Response;
  try { res = await fetch(`${API_BASE}/api/images`, { method: 'POST', headers: { 'content-type': blob.type, authorization: `Bearer ${teacherToken()}` }, body: blob }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'offline'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Could not upload the picture', data.code);
  return data;
}

/** Decodes a picture. The strict decoder is tried first; some real-world files (cameras, older editors) only load through a normal <img>, so that is the fallback. */
async function decodePicture(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const b = await createImageBitmap(file);
    return { image: b, width: b.width, height: b.height, done: () => b.close() };
  } catch { /* fall back */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ApiError(0, 'That file could not be read as a picture.', 'bad_image');
  }
}

/** Shrinks a picture in the browser before upload: at most 1200px on the long side, re-encoded as WebP (or JPEG), under the server's size limit. */
export async function shrinkImage(file: File, maxBytes = 380 * 1024): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new ApiError(0, 'Use a PNG, JPEG, WebP or GIF picture.', 'bad_image');
  const src = await decodePicture(file);
  let scale = Math.min(1, 1200 / Math.max(src.width, src.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * scale)); c.height = Math.max(1, Math.round(src.height * scale));
    c.getContext('2d')!.drawImage(src.image, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', q));
      if (blob && blob.size <= maxBytes) { src.done(); return blob; }
    }
    scale *= 0.75;
  }
  src.done();
  throw new ApiError(0, 'That picture is too detailed to shrink enough. Try a simpler or smaller one.', 'too_big');
}

export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${API_BASE}/api${path}`, { headers: { authorization: `Bearer ${teacherToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
