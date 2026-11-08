import { useEffect, useState } from 'react';
import { api } from './api';

let cached: Promise<{ whatsappLink: string | null }> | null = null;
/** Settings the server shares with the website (read once, then remembered). */
const load = () => (cached ??= api('GET', '/public/config', { auth: false }).catch(() => ({ whatsappLink: null })));

export function useWhatsappLink() {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => { let on = true; void load().then((c) => on && setLink(c.whatsappLink ?? null)); return () => { on = false; }; }, []);
  return link;
}
