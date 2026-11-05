import { NavLink, Outlet, useNavigate } from 'react-router';
import { brand } from '@cluequest/config';
import { useAuth } from '../../lib/auth';
import { Icon, Logo } from '../../components/ui';

const items = [
  { to: '/quizzes/new', label: 'Create quest', icon: 'plus' },
  { to: '/quizzes', label: 'My quests', icon: 'grid', end: true },
  { to: '/host', label: 'Host live game', icon: 'live' },
  { to: '/results', label: 'Results', icon: 'chart' },
] as const;

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 shrink-0 items-center gap-3 rounded-2xl px-3.5 font-display text-base font-semibold transition ${isActive ? 'bg-sun text-ink' : 'text-white/90 hover:bg-white/15'}`;
  const initial = (user?.displayName ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className="min-h-screen md:flex">
      <aside className="side-bg relative overflow-hidden text-white md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col">
        <div aria-hidden className="absolute -left-10 -top-10 hidden h-36 w-36 rounded-full bg-coral/30 md:block" />
        <div aria-hidden className="absolute -bottom-16 -right-10 hidden h-44 w-44 rounded-full bg-sky/25 md:block" />
        <div className="relative flex items-center justify-between px-4 py-3 md:block md:px-5 md:pb-2 md:pt-6">
          <span className="flex items-center gap-2.5 font-display text-2xl font-semibold"><Logo light size={34} />{brand.name}</span>
          <div className="flex items-center gap-3 md:mt-6 md:rounded-2xl md:bg-white/10 md:p-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sun font-display text-lg font-semibold text-ink">{initial}</span>
            <div className="hidden min-w-0 md:block"><p className="truncate font-display font-semibold">{user?.displayName}</p><p className="text-sm text-white/70">Host</p></div>
          </div>
        </div>
        <nav aria-label="Workspace" className="relative flex gap-1.5 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:px-4 md:pt-4">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={'end' in i ? i.end : undefined} className={link}>
              <Icon name={i.icon} className="h-5 w-5 shrink-0" />{i.label}
            </NavLink>
          ))}
          <button className="flex min-h-11 shrink-0 items-center gap-3 rounded-2xl px-3.5 font-display text-base font-semibold text-white/80 transition hover:bg-white/15 md:mt-auto md:mb-4" onClick={() => { logout(); nav('/'); }}>
            <Icon name="out" className="h-5 w-5 shrink-0" />Sign out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8"><div className="mx-auto max-w-5xl"><Outlet /></div></main>
    </div>
  );
}
