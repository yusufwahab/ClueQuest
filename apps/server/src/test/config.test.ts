import { describe, expect, it } from 'vitest';
import { api, boot } from './helpers';

describe('WHATSAPP_LINK', () => {
  it('is shared with the website when set, and null when not', async () => {
    const link = 'https://chat.whatsapp.com/AbCdEf123456';
    const on = await boot({ WHATSAPP_LINK: link });
    expect((await api(on, 'GET', '/public/config')).body).toEqual({ whatsappLink: link });
    await on.close();
    const off = await boot();
    expect((await api(off, 'GET', '/public/config')).body).toEqual({ whatsappLink: null });
    await off.close();
  });

  it('refuses a value that is not a WhatsApp link, so a typo cannot send players somewhere else', async () => {
    await expect(boot({ WHATSAPP_LINK: 'https://example.com/join' })).rejects.toThrow(/WHATSAPP_LINK/);
    await expect(boot({ WHATSAPP_LINK: 'chat.whatsapp.com/AbCd' })).rejects.toThrow(/WHATSAPP_LINK/);
    await expect(boot({ WHATSAPP_LINK: 'http://chat.whatsapp.com/AbCd' })).rejects.toThrow(/WHATSAPP_LINK/);
  });
});

describe('database exposure', () => {
  it('has row-level security on for every table, so Supabase\'s public web API can read none of them', async () => {
    const h = await boot();
    const r = await h.app.db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
    expect(r.rows.map((x: any) => x.relname)).toEqual([]);
    const total = await h.app.db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(total.rows[0].n).toBeGreaterThan(10);
    await h.close();
  });
});
