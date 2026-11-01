import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './env';
import type { Db } from './db/db';
import { HttpError, one } from './db/util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export type Role = 'teacher' | 'admin';
export interface AuthUser { id: string; email: string; displayName: string; role: Role }
declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(pw, salt, 32)).toString('hex')}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [s, k] = stored.split(':');
  if (!s || !k) return false;
  const key = await scryptAsync(pw, Buffer.from(s, 'hex'), 32);
  const expect = Buffer.from(k, 'hex');
  return key.length === expect.length && timingSafeEqual(key, expect);
}

const ISSUER = 'cluequest';
/** Teacher/host accounts only. Players, learners and candidates never have one. */
export class Auth {
  private key: Uint8Array;
  constructor(private env: Env, private db: Db) { this.key = new TextEncoder().encode(env.AUTH_SECRET); }

  private async token(u: AuthUser) {
    return new SignJWT({ role: u.role }).setProtectedHeader({ alg: 'HS256' }).setSubject(u.id).setIssuer(ISSUER).setIssuedAt().setExpirationTime('12h').sign(this.key);
  }
  async register(email: string, password: string, displayName: string, role: Role = 'teacher') {
    if (!this.env.ALLOW_REGISTRATION && role === 'teacher') throw new HttpError(403, 'Registration is closed', 'closed');
    if (await one(this.db, 'select 1 from users where lower(email)=lower($1)', [email])) throw new HttpError(409, 'An account with that email already exists', 'exists');
    const id = randomUUID();
    await this.db.query('insert into users(id,email,display_name,password_hash,role) values ($1,$2,$3,$4,$5)', [id, email, displayName, await hashPassword(password), role]);
    const user: AuthUser = { id, email, displayName, role };
    return { token: await this.token(user), user };
  }
  async login(email: string, password: string) {
    const r = await one<any>(this.db, 'select * from users where lower(email)=lower($1)', [email]);
    if (!r || !(await verifyPassword(password, r.password_hash))) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
    const user: AuthUser = { id: r.id, email: r.email, displayName: r.display_name, role: r.role };
    return { token: await this.token(user), user };
  }
  async verify(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
      const r = await one<any>(this.db, 'select id,email,display_name,role from users where id=$1', [String(payload.sub)]);
      return r ? { id: r.id, email: r.email, displayName: r.display_name, role: r.role } : null;
    } catch { return null; }
  }
  async fromRequest(req: Request) {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? this.verify(h.slice(7)) : null;
  }
  require() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const u = await this.fromRequest(req);
      if (!u) return next(new HttpError(401, 'Sign in required', 'unauthenticated'));
      req.user = u; next();
    };
  }
}
