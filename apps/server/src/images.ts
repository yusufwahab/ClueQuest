import { createHash } from 'node:crypto';
import type { Db } from './db/db';
import { HttpError, many, one } from './db/util';
import type { Env } from './env';

/**
 * Question pictures.
 *  - With a Cloudinary account configured (CLOUDINARY_URL), the file is uploaded there by this server and learners load it straight from
 *    Cloudinary's CDN, resized and compressed for their device. Nothing heavy ever passes through this server after the upload.
 *  - Without one (local development, tests), the file is kept in the database and served by /api/images/:id.
 * Either way a question stores only the picture's id and its description; the address a browser should load is worked out when it is served.
 */

export const MAX_IMAGE_BYTES = 400 * 1024;
const MAX_IMAGES_PER_HOST = 500;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMime = (typeof IMAGE_TYPES)[number];
export interface ImageRef { id: string; alt?: string | null }
export interface ImageView { id: string; alt: string; url: string | null }

/** Identify an image by its first bytes. The client's content-type header is never trusted, and SVG (which can carry scripts) is not accepted. */
export function sniffImage(b: Uint8Array): ImageMime | null {
  const at = (i: number) => b[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'image/gif';
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'image/webp';
  return null;
}

export interface Cloud { cloud: string; key: string; secret: string; folder: string; apiBase: string }

const cloudCache = new WeakMap<Env, Cloud | null>();
/** The Cloudinary account, from CLOUDINARY_URL (one value, as copied from the Cloudinary dashboard) or the three separate settings. */
export function cloudinaryConfig(env: Env): Cloud | null {
  if (cloudCache.has(env)) return cloudCache.get(env)!;
  let cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
  if (env.CLOUDINARY_URL) {
    let u: URL;
    try { u = new URL(env.CLOUDINARY_URL); } catch { throw new Error('CLOUDINARY_URL is not valid. It looks like cloudinary://API_KEY:API_SECRET@CLOUD_NAME'); }
    if (u.protocol !== 'cloudinary:' || !u.username || !u.password || !u.hostname) throw new Error('CLOUDINARY_URL is not valid. It looks like cloudinary://API_KEY:API_SECRET@CLOUD_NAME');
    cloud = u.hostname; key = decodeURIComponent(u.username); secret = decodeURIComponent(u.password);
  }
  const some = [cloud, key, secret].filter(Boolean).length;
  if (some && some < 3) throw new Error('Set CLOUDINARY_URL, or all of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  const out = some ? { cloud: cloud!, key: key!, secret: secret!, folder: env.CLOUDINARY_FOLDER, apiBase: env.CLOUDINARY_API_BASE.replace(/\/+$/, '') } : null;
  cloudCache.set(env, out);
  return out;
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
/** Delivery address: resized to at most 1200px, and the best format and quality for the viewer's browser, chosen by Cloudinary. */
const deliveryUrl = (c: Cloud, publicId: string) => `https://res.cloudinary.com/${c.cloud}/image/upload/f_auto,q_auto,c_limit,w_1200/${publicId}`;

/** Adds the address a browser should load. Used wherever a question is sent to a screen. */
export function imageView(env: Env, image: ImageRef | null | undefined): ImageView | null {
  if (!image?.id) return null;
  const c = cloudinaryConfig(env);
  const url = isUuid(image.id) ? `/api/images/${image.id}` : c ? deliveryUrl(c, image.id) : null;
  return { id: image.id, alt: image.alt ?? '', url };
}

export class ImageService {
  private cloud: Cloud | null;
  constructor(private db: Db, private env: Env) { this.cloud = cloudinaryConfig(env); }

  get provider() { return this.cloud ? 'cloudinary' : 'database'; }

  /** Store a picture for a host. The same picture uploaded twice is stored once. Returns its id and the address to show it from. */
  async save(ownerId: string, body: Buffer): Promise<{ id: string; url: string | null }> {
    if (!body.length) throw new HttpError(400, 'No image was sent', 'bad_image');
    if (body.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'That image is too large. Use one under 400 KB.', 'too_big');
    const mime = sniffImage(body);
    if (!mime) throw new HttpError(415, 'Use a PNG, JPEG, WebP or GIF picture.', 'bad_image');
    const hash = createHash('sha256').update(body).digest('hex');

    const row = await one<{ id: string; public_id: string | null; has_bytes: boolean }>(this.db, 'select id, public_id, bytes is not null as has_bytes from images where owner_id=$1 and sha256=$2', [ownerId, hash]);
    if (row) {
      if (this.cloud && row.public_id) return this.ref(row.public_id);
      if (!this.cloud && row.has_bytes) return this.ref(row.id);
    } else {
      const [{ n }] = await many<{ n: number }>(this.db, 'select count(*)::int as n from images where owner_id=$1', [ownerId]) as [{ n: number }];
      if (n >= MAX_IMAGES_PER_HOST) throw new HttpError(403, 'You have reached the image limit for this account.', 'quota');
    }

    if (this.cloud) {
      const publicId = await this.upload(this.cloud, body, mime, `${this.cloud.folder}/${hash.slice(0, 32)}`);
      if (row) await this.db.query('update images set public_id=$2 where id=$1', [row.id, publicId]);
      else await this.db.query('insert into images(owner_id,mime,size,sha256,public_id) values ($1,$2,$3,$4,$5)', [ownerId, mime, body.length, hash, publicId]);
      return this.ref(publicId);
    }
    if (row) { await this.db.query('update images set bytes=$2 where id=$1', [row.id, body]); return this.ref(row.id); }
    const made = await one<{ id: string }>(this.db, 'insert into images(owner_id,mime,bytes,size,sha256) values ($1,$2,$3,$4,$5) returning id', [ownerId, mime, body, body.length, hash]);
    return this.ref(made!.id);
  }

  private ref(id: string) { const v = imageView(this.env, { id }); return { id, url: v?.url ?? null }; }

  /**
   * Signed upload to Cloudinary (https://cloudinary.com/documentation/authentication_signatures): every parameter except the file and the key
   * is sorted, joined as name=value, and hashed together with the API secret. The secret never leaves this server.
   * `overwrite=false` makes an upload of a picture that is already there a harmless no-op.
   */
  private async upload(c: Cloud, body: Buffer, mime: string, publicId: string): Promise<string> {
    const params: Record<string, string> = { allowed_formats: 'png,jpg,webp,gif', overwrite: 'false', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
    const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.set(k, v);
    form.set('api_key', c.key);
    form.set('signature', createHash('sha1').update(toSign + c.secret).digest('hex'));
    form.set('file', new Blob([body], { type: mime }), 'picture');
    let res: Response;
    try { res = await fetch(`${c.apiBase}/v1_1/${c.cloud}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) }); }
    catch { throw new HttpError(502, 'The picture store did not answer. Please try again.', 'image_store'); }
    if (!res.ok) {
      const detail = await res.json().then((j: any) => j?.error?.message, () => undefined);
      console.error(`[images] Cloudinary upload failed (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
      throw new HttpError(502, 'The picture could not be stored. Please try again.', 'image_store');
    }
    const out = (await res.json().catch(() => null)) as { public_id?: string } | null;
    if (!out?.public_id) throw new HttpError(502, 'The picture could not be stored. Please try again.', 'image_store');
    return out.public_id;
  }

  /** Database-stored pictures only (development and tests). */
  async get(id: string) {
    if (!isUuid(id)) return null;
    const r = await one<{ mime: ImageMime; bytes: Uint8Array | null }>(this.db, 'select mime, bytes from images where id=$1', [id]);
    return r?.bytes ? { mime: r.mime, bytes: Buffer.from(r.bytes) } : null;
  }
}
