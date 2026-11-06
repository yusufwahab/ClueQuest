import { useEffect, useState } from 'react';
import { Logo } from './ui';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const SNOOZE_KEY = 'cq.install.snooze';
const SNOOZE_DAYS = 7;

const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const snoozed = () => { const t = Number(localStorage.getItem(SNOOZE_KEY) ?? 0); return t > Date.now(); };
// iPhones and iPads never fire an install event: the only way is Safari's Share menu
const onIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

/** A bottom banner that offers to put ClueQuest on the home screen. Shown on the landing page only. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (installed() || snoozed()) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); setOpen(true); };
    const onDone = () => { setOpen(false); setEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onDone);
    let t: number | undefined;
    if (onIos()) { setIos(true); t = window.setTimeout(() => setOpen(true), 1500); }
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onDone); if (t) clearTimeout(t); };
  }, []);

  const later = () => { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); setOpen(false); };
  const install = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    setEvent(null);
    if (outcome === 'accepted') setOpen(false); else later();
  };

  if (!open || (!event && !ios)) return null;
  return (
    <div role="dialog" aria-label="Install ClueQuest" className="safe-bottom fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:left-auto sm:right-4 sm:max-w-sm sm:px-0">
      <div className="animate-rise rounded-3xl bg-white p-4 text-ink shadow-[0_20px_50px_-12px_rgba(8,4,40,0.8)] ring-1 ring-line">
        <div className="flex items-start gap-3">
          <Logo size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-brand text-lg font-extrabold leading-tight">Install ClueQuest</p>
            <p className="mt-0.5 text-sm text-muted">{ios ? <>Tap <b>Share</b> <span aria-hidden>⎋</span> in Safari, then choose <b>Add to Home Screen</b>.</> : 'Add it to your home screen to open it like an app, in one tap.'}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {!ios && <button className="btn btn-primary min-h-11! flex-1 text-base!" onClick={() => void install()}>Install</button>}
          <button className={`btn btn-secondary min-h-11! text-base! ${ios ? 'flex-1' : ''}`} onClick={later}>{ios ? 'Got it' : 'Not now'}</button>
        </div>
      </div>
    </div>
  );
}
