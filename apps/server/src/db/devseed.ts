import type { Ctx } from '../ctx';
import { one } from './util';

export const DEV_TEACHER = { email: 'host@dev.local', password: 'devpassword1', name: 'Demo Host' };
export const DEV_PARTNER = { slug: 'testpartner', apiKey: 'cq_test_key_local_only', webhookSecret: 'whsec_test_local_only' };

/** Development only (SEED_DEV_DATA=true): a demo teacher and the local test partner, with fixed credentials. */
export async function seedDevData(ctx: Ctx) {
  if (!(await one(ctx.db, 'select 1 from users where lower(email)=$1', [DEV_TEACHER.email]))) {
    await ctx.auth.register(DEV_TEACHER.email, DEV_TEACHER.password, DEV_TEACHER.name);
  }
  const port = process.env.TEST_PARTNER_PORT ?? '4600';
  await ctx.partners.create({
    slug: DEV_PARTNER.slug, name: 'Local test partner', apiKey: DEV_PARTNER.apiKey, webhookSecret: DEV_PARTNER.webhookSecret,
    webhookUrl: `http://localhost:${port}/webhooks/cluequest`, returnOrigins: [`http://localhost:${port}`],
  });
}
