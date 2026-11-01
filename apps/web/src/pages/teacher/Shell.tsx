import { NavLink, Outlet, useNavigate } from 'react-router';
import { brand } from '@cluequest/config';
import { useAuth } from '../../lib/auth';
import { Logo } from '../../components/ui';

const items = [
  { to: '/quizzes/new', label: 'Create quest' },
  { to: '/quizzes', label: 'My quests', end: true },
  { to: '/host', label: 'Host live game' },
  { to: '/results', label: 'Results' },
];

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 shrink-0 items-center rounded-xl px-3 text-base font-bold transition-colors ${isActive ? 'bg-sun text-ink' : 'text-white hover:bg-white/15'}`;
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-sidebar text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-6">
          <span className="flex items-center gap-2 text-xl font-extrabold"><Logo light size={32} />{brand.name}</span>
          <p className="hidden text-sm text-white/75 md:mt-3 md:block">{user?.displayName}</p>
        </div>
        <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-3">
          {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}>{i.label}</NavLink>)}
          <button className="flex min-h-11 shrink-0 items-center rounded-xl px-3 text-base font-bold text-white hover:bg-white/15 md:mt-6" onClick={() => { logout(); nav('/'); }}>Sign out</button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8"><div className="mx-auto max-w-5xl"><Outlet /></div></main>
    </div>
  );
}
