import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { brand } from '@cluequest/config';
import { useAuth } from '../../lib/auth';
import { Icon, Logo, Modal } from '../../components/ui';

/** `short` is the label under the icon on a phone, where five full labels would not fit. The full name is still what screen readers hear. */
const items = [
  { to: '/dashboard', label: 'Home', short: 'Home', icon: 'home' },
  { to: '/quizzes', label: 'My quests', short: 'Quests', icon: 'grid' },
  { to: '/host', label: 'Host Live Quest', short: 'Live', icon: 'live' },
  { to: '/exams', label: 'Exams', short: 'Exams', icon: 'exam' },
  { to: '/results', label: 'Results', short: 'Results', icon: 'chart' },
] as const;

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [account, setAccount] = useState(false);
  const initial = (user?.displayName ?? '?').trim().charAt(0).toUpperCase();
  const signOut = () => { setAccount(false); logout(); nav('/'); };
  const side = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-2xl px-3.5 font-display text-base font-semibold transition ${isActive ? 'bg-sun text-ink' : 'text-white/90 hover:bg-white/15'}`;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold leading-tight transition ${isActive ? 'text-primary' : 'text-muted'}`;

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop and tablet: sidebar */}
      <aside className="side-bg relative hidden overflow-hidden text-white md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col">
        <div aria-hidden className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-coral/30" />
        <div aria-hidden className="absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-sky/25" />
        <div className="relative px-5 pb-2 pt-6">
          <Link to="/dashboard" className="flex items-center gap-2.5 font-brand text-2xl font-extrabold"><Logo light size={34} />{brand.name}</Link>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sun font-display text-lg font-semibold text-ink">{initial}</span>
            <div className="min-w-0"><p className="truncate font-display font-semibold">{user?.displayName}</p><p className="text-sm text-white/70">Host</p></div>
          </div>
        </div>
        <nav aria-label="Workspace" className="relative flex flex-1 flex-col gap-1.5 px-4 pt-4">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={side}><Icon name={i.icon} className="h-5 w-5 shrink-0" />{i.label}</NavLink>
          ))}
          <button className="mb-4 mt-auto flex min-h-11 items-center gap-3 rounded-2xl px-3.5 font-display text-base font-semibold text-white/80 transition hover:bg-white/15" onClick={signOut}>
            <Icon name="out" className="h-5 w-5 shrink-0" />Sign out
          </button>
        </nav>
      </aside>

      {/* Phone: a slim top bar, and the main places along the bottom, where a thumb reaches */}
      <header className="side-bg sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 text-white md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-xl font-semibold"><Logo light size={30} />{brand.name}</Link>
        <button type="button" onClick={() => setAccount(true)} aria-label="Your account" className="grid h-10 w-10 place-items-center rounded-full bg-sun font-display text-lg font-semibold text-ink">{initial}</button>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-10 md:pt-8"><div className="mx-auto max-w-5xl"><Outlet /></div></main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(23,19,71,0.35)] backdrop-blur md:hidden">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={tab} aria-label={i.label}>
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-primary" />}
                <Icon name={i.icon} className="h-6 w-6" /><span aria-hidden>{i.short}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {account && (
        <Modal title="Your account" onClose={() => setAccount(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-sun font-display text-xl font-semibold text-ink">{initial}</span>
              <div className="min-w-0"><p className="truncate font-display font-semibold">{user?.displayName}</p><p className="truncate text-sm text-muted">{user?.email}</p></div>
            </div>
            <button className="btn btn-secondary w-full" onClick={signOut}>Sign out</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
