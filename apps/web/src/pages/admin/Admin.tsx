import { useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { brand } from '@cluequest/config';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Loading, Logo, Notice, fmtDate } from '../../components/ui';

type Day = { day: string; hosts: number; games: number; players: number; attempts: number };
const SERIES: { key: 'hosts' | 'games' | 'players' | 'attempts'; label: string; color: string }[] = [
  { key: 'hosts', label: 'New hosts', color: '#ffc933' },
  { key: 'games', label: 'Live games', color: '#8b73ff' },
  { key: 'players', label: 'Players joined', color: '#38b6ff' },
  { key: 'attempts', label: 'Quiz attempts', color: '#12b886' },
];
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());
const rate = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${28 - (v / max) * 26}`).join(' ');
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>;
}

function Kpi({ label, value, sub, spark, color = '#ffc933', tone }: { label: string; value: ReactNode; sub?: ReactNode; spark?: number[]; color?: string; tone?: 'warn' }) {
  return (
    <div className={`min-w-0 rounded-3xl p-5 ring-1 ${tone === 'warn' ? 'bg-coral/15 ring-coral/40' : 'bg-white/[0.06] ring-white/10'}`}>
      <p className="text-sm font-semibold text-white/70">{label}</p>
      <p className="mt-1 font-brand text-4xl font-extrabold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-sm font-semibold text-white/70">{sub}</p>}
      {spark && <Spark data={spark} color={color} />}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10"><h2 className="text-xl font-extrabold text-white">{title}</h2>{hint && <p className="text-sm text-white/60">{hint}</p>}<div className="mt-4">{children}</div></section>;
}

function Bars({ trend, series }: { trend: Day[]; series: (typeof SERIES)[number] }) {
  const max = Math.max(1, ...trend.map((d) => d[series.key]));
  const total = trend.reduce((s, d) => s + d[series.key], 0);
  return (
    <div>
      <p className="mb-2 text-sm text-white/70"><b className="text-white">{n(total)}</b> in the last {trend.length} days · busiest day {n(max === 1 && total === 0 ? 0 : max)}</p>
      <div role="img" aria-label={`${series.label}, daily for the last ${trend.length} days. Total ${total}.`} className="flex h-44 items-end gap-[3px]">
        {trend.map((d) => (
          <div key={d.day} title={`${d.day}: ${d[series.key]}`} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-t-sm" style={{ height: `${Math.max(d[series.key] ? 4 : 1, (d[series.key] / max) * 100)}%`, background: series.color, opacity: d[series.key] ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-white/50" aria-hidden><span>{trend[0]?.day.slice(5)}</span><span>{trend[Math.floor(trend.length / 2)]?.day.slice(5)}</span><span>{trend.at(-1)?.day.slice(5)}</span></div>
    </div>
  );
}

function Split({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10" aria-hidden>{rows.map((r) => <div key={r.label} style={{ width: `${total ? (r.value / total) * 100 : 0}%`, background: r.color }} />)}</div>
      <ul className="space-y-1.5 text-sm">{rows.map((r) => <li key={r.label} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.label}</span><b className="tabular-nums">{n(r.value)}{total ? <span className="ml-1 font-semibold text-white/60">({Math.round((r.value / total) * 100)}%)</span> : null}</b></li>)}</ul>
    </div>
  );
}

const th = 'px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wider text-white/60';
const td = 'px-3 py-2.5 border-t border-white/10 align-top';

function HostsDirectory() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const r = useQuery({ queryKey: ['admin-hosts', q, page], queryFn: () => api<any>('GET', `/admin/hosts?search=${encodeURIComponent(q)}&page=${page}`), placeholderData: (p) => p });
  return (
    <Panel title="All hosts" hint="Everyone who has an account, most recently active first.">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search.trim()); }}>
        <label className="sr-only" htmlFor="hs">Search hosts</label>
        <input id="hs" className="field min-h-11! flex-1" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-sun min-h-11! px-5! text-base!">Search</button>
      </form>
      {!r.data ? <Loading /> : (
        <>
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-sm">
            <thead><tr><th className={th}>Host</th><th className={th}>Joined</th><th className={th}>Quests</th><th className={th}>Live games</th><th className={th}>Players</th><th className={th}>Attempts</th><th className={th}>Last active</th></tr></thead>
            <tbody>{r.data.hosts.map((h: any) => (
              <tr key={h.id}><td className={td}><b>{h.name}</b><span className="block break-all text-white/60">{h.email}</span></td><td className={td}>{fmtDate(h.joinedAt)}</td><td className={`${td} tabular-nums`}>{h.quizzes}</td><td className={`${td} tabular-nums`}>{h.games}</td><td className={`${td} tabular-nums`}>{n(h.players)}</td><td className={`${td} tabular-nums`}>{n(h.attempts)}</td><td className={td}>{fmtDate(h.lastActive)}</td></tr>
            ))}</tbody>
          </table></div>
          {r.data.hosts.length === 0 && <p className="py-4 text-white/60">No hosts match that search.</p>}
          <div className="mt-3 flex items-center justify-between text-sm text-white/70">
            <span>{n(r.data.total)} host{r.data.total === 1 ? '' : 's'}</span>
            <span className="flex items-center gap-2">
              <button className="btn btn-secondary min-h-9! px-3! text-sm!" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {r.data.page} of {r.data.pages}</span>
              <button className="btn btn-secondary min-h-9! px-3! text-sm!" disabled={page >= r.data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

/** The super admin's page: platform-wide analytics and every host. Only an admin account can open it. */
export default function Admin() {
  const { user, loading, logout } = useAuth();
  const [series, setSeries] = useState<(typeof SERIES)[number]['key']>('players');
  const a = useQuery({ queryKey: ['admin-analytics'], queryFn: () => api<any>('GET', '/admin/analytics?days=30'), enabled: user?.role === 'admin', refetchInterval: 30_000 });
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  const d = a.data;
  const trend: Day[] = d?.trend ?? [];
  const col = (k: Day extends infer T ? keyof T & string : never) => trend.map((x) => (x as any)[k] as number);
  const cur = SERIES.find((s) => s.key === series)!;

  return (
    <div className="min-h-screen bg-[#0d0836] text-white">
      <header className="border-b border-white/10 bg-white/[0.04] backdrop-blur">
        <div className="container-page flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-brand text-xl font-extrabold"><Logo light size={32} />{brand.name}<span className="ml-1 rounded-full bg-sun px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-ink">Super admin</span></Link>
          <div className="flex items-center gap-2"><span className="hidden text-sm text-white/70 sm:inline">{user.email}</span><button className="btn btn-secondary min-h-10! px-4! text-base!" onClick={() => { logout(); }}>Sign out</button></div>
        </div>
      </header>

      <main className="container-page space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl text-white sm:text-4xl">Platform overview</h1><p className="text-white/70">{d ? `Updated ${fmtDate(d.generatedAt)}. Refreshes every 30 seconds.` : 'Loading the numbers…'}</p></div>
          <button className="btn btn-sun min-h-10! px-5! text-base!" onClick={() => void a.refetch()} disabled={a.isFetching}>{a.isFetching ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        {a.error && <Notice kind="bad">{(a.error as Error).message}</Notice>}
        {!d ? <Loading /> : (
          <>
            {d.integrations.failed > 0 && <Notice kind="warn">{d.integrations.failed} connected-platform result{d.integrations.failed === 1 ? '' : 's'} could not be delivered. Check the partner webhook settings.</Notice>}

            <section aria-label="Growth" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Hosts" value={n(d.hosts.total)} sub={`+${n(d.hosts.new7)} this week · +${n(d.hosts.new30)} this month`} spark={col('hosts')} />
              <Kpi label="Active hosts" value={n(d.hosts.active7)} sub={`last 7 days · ${n(d.hosts.active30)} in 30 days`} color="#8b73ff" />
              <Kpi label="Live games" value={n(d.live.rooms)} sub={`${n(d.live.games7)} this week`} spark={col('games')} color="#8b73ff" />
              <Kpi label="Players reached" value={n(d.live.players)} sub={`${n(d.live.players7)} this week`} spark={col('players')} color="#38b6ff" />
            </section>

            <section aria-label="Usage" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Playing right now" value={n(d.live.playersNow)} sub={`${n(d.live.inProgress)} game${d.live.inProgress === 1 ? '' : 's'} in a lobby or running`} />
              <Kpi label="Average game size" value={n(d.live.avgPlayersPerGame)} sub={`players · biggest room ${n(d.live.biggest)}`} />
              <Kpi label="Games finished" value={rate(d.live.finishRate)} sub={`${n(d.live.finished)} finished · ${n(d.live.cancelled)} cancelled`} />
              <Kpi label="Practice completion" value={rate(d.practice.completionRate)} sub={`${n(d.practice.submitted)} of ${n(d.practice.started)} attempts submitted`} spark={col('attempts')} color="#12b886" />
            </section>

            <section aria-label="Trends" className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
              <Panel title="Trends" hint="Day by day, last 30 days.">
                <div role="tablist" aria-label="Trend" className="mb-4 flex flex-wrap gap-2">
                  {SERIES.map((s) => <button key={s.key} role="tab" aria-selected={series === s.key} onClick={() => setSeries(s.key)} className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 transition ${series === s.key ? 'bg-white text-ink ring-white' : 'text-white/80 ring-white/25 hover:bg-white/10'}`}>{s.label}</button>)}
                </div>
                <Bars trend={trend} series={cur} />
              </Panel>
              <div className="grid gap-4">
                <Panel title="What hosts create"><Split rows={[{ label: 'Live games', value: d.content.live, color: '#8b73ff' }, { label: 'Practice links', value: d.content.solo, color: '#12b886' }, { label: 'CBTs', value: d.content.cbt, color: '#ffc933' }]} /></Panel>
                <Panel title="Scoring style"><Split rows={[{ label: 'Points', value: d.content.points, color: '#38b6ff' }, { label: 'Steps', value: d.content.steps, color: '#ff6b6b' }]} /></Panel>
              </div>
            </section>

            <section aria-label="Content and CBT" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Quests written" value={n(d.content.quizzes)} sub={`${n(d.content.published)} published · ${n(d.content.examSets)} CBT question sets`} />
              <Kpi label="Pictures uploaded" value={n(d.content.images)} />
              <Kpi label="CBT attempts" value={n(d.cbt.started)} sub={`${rate(d.cbt.completionRate)} submitted · ${n(d.cbt.autoSubmitted)} auto-submitted`} />
              <Kpi label="CBT invitations sent" value={n(d.cbt.invitations)} sub={`${n(d.integrations.partners)} connected platform${d.integrations.partners === 1 ? '' : 's'}`} />
            </section>

            <section aria-label="Hosts" className="grid gap-4 lg:grid-cols-2">
              <Panel title="Top hosts" hint="By games and attempts in the last 30 days.">
                <div className="overflow-x-auto"><table className="w-full min-w-[22rem] text-sm"><thead><tr><th className={th}>Host</th><th className={th}>Games</th><th className={th}>Players</th><th className={th}>Attempts</th></tr></thead>
                  <tbody>{d.topHosts.map((h: any) => <tr key={h.id}><td className={td}><b>{h.name}</b><span className="block break-all text-white/60">{h.email}</span></td><td className={`${td} tabular-nums`}>{h.games}</td><td className={`${td} tabular-nums`}>{n(h.players)}</td><td className={`${td} tabular-nums`}>{n(h.attempts)}</td></tr>)}</tbody></table></div>
                {d.topHosts.length === 0 && <p className="text-white/60">No hosts yet.</p>}
              </Panel>
              <Panel title="Newest sign-ups">
                <ul className="divide-y divide-white/10">{d.recentHosts.map((h: any) => <li key={h.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><b>{h.name}</b><span className="block truncate text-sm text-white/60">{h.email}</span></span><span className="shrink-0 text-sm text-white/70">{fmtDate(h.joinedAt)}</span></li>)}</ul>
                {d.recentHosts.length === 0 && <p className="text-white/60">No sign-ups yet.</p>}
              </Panel>
            </section>

            <section aria-label="Integrations" className="grid gap-4 sm:grid-cols-3">
              <Kpi label="Partner results delivered" value={n(d.integrations.delivered)} />
              <Kpi label="Waiting to be delivered" value={n(d.integrations.pending)} />
              <Kpi label="Failed deliveries" value={n(d.integrations.failed)} tone={d.integrations.failed > 0 ? 'warn' : undefined} />
            </section>

            <HostsDirectory />
          </>
        )}
        <p className="pb-4 text-center text-xs text-white/50">Counts only. No player answers, candidate results or player names are shown here.</p>
      </main>
    </div>
  );
}
