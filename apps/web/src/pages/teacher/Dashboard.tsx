import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { examPhase } from '../../lib/examPhase';
import { ICON_TONES } from '../../lib/tones';
import { Icon, Loading, Notice, PageHead, Stat, fmtDate } from '../../components/ui';

const MODE: Record<string, string> = { solo: 'Solo link', live: 'Live quest', cbt: 'Exam' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const START = [
  { to: '/quizzes/new', title: 'Create a quest', text: 'Questions for practice links and live games.', icon: 'plus', tone: '' },
  { to: '/host', title: 'Host a Live Quest', text: 'Run a game with a room code.', icon: 'live', tone: '' },
  { to: '/exams/new', title: 'Create an exam', text: 'Timed, scheduled, with candidates.', icon: 'exam', tone: '' },
  { to: '/quizzes/new?ai=1', title: 'Draft with AI', text: 'Describe a topic, review the draft.', icon: 'spark', tone: '' },
] as const;

/** The first screen after sign-in: what is happening, what needs attention, and the next thing to do. */
export default function Dashboard() {
  const { user } = useAuth();
  const quests = useQuery({ queryKey: ['quizzes'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes') });
  const drafts = useQuery({ queryKey: ['exam-drafts'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes?kind=exam') });
  const acts = useQuery({ queryKey: ['activities'], queryFn: () => api<{ activities: any[] }>('GET', '/activities'), refetchInterval: 20000 });
  const results = useQuery({ queryKey: ['results'], queryFn: () => api<{ activities: any[]; rooms: any[] }>('GET', '/results') });
  const first = (user?.displayName ?? '').trim().split(/\s+/)[0] || 'there';

  // The greeting shows straight away; the sections fill in once their data arrives.
  const head = <PageHead title={`${greeting()}, ${first}`} sub="Here is what is happening across your quests and exams." />;
  if (quests.isLoading || acts.isLoading || drafts.isLoading || results.isLoading) return <div className="space-y-6">{head}<Loading what="Loading your overview" /></div>;
  const err = quests.error ?? acts.error ?? results.error;
  if (err) return <div className="space-y-6">{head}<Notice kind="bad">{(err as Error).message}</Notice></div>;

  const qs = quests.data?.quizzes ?? [];
  const published = qs.filter((q) => q.latest_version > 0);
  const questDrafts = qs.filter((q) => !q.latest_version);
  const activities = acts.data?.activities ?? [];
  const exams = activities.filter((a) => a.mode === 'cbt');
  const examDrafts = (drafts.data?.quizzes ?? []).filter((d) => !d.has_exam);
  const rooms = results.data?.rooms ?? [];
  const live = rooms.filter((r) => r.phase !== 'finished' && r.phase !== 'cancelled');
  const players = rooms.reduce((n, r) => n + (r.players ?? 0), 0);
  const submitted = activities.filter((a) => a.mode !== 'live').reduce((n, a) => n + (a.submitted ?? 0), 0);
  const phases = exams.map((a) => ({ a, p: examPhase(a) }));
  const open = phases.filter((x) => x.p.label === 'Open');
  const scheduled = phases.filter((x) => x.p.label === 'Scheduled').sort((x, y) => +new Date(x.a.opensAt) - +new Date(y.a.opensAt));

  // What needs doing, most urgent first
  const attention: { key: string; icon: 'live' | 'exam' | 'grid'; text: ReactNode; to: string; cta: string }[] = [];
  for (const r of live) attention.push({ key: `r${r.id}`, icon: 'live', text: <><strong>{r.title}</strong> is running now with {r.players} player{r.players === 1 ? '' : 's'}.</>, to: `/host/room/${r.code}`, cta: 'Open room' });
  for (const { a } of open) attention.push({ key: `o${a.id}`, icon: 'exam', text: <><strong>{a.title}</strong> is open: {a.inProgress} in progress, {a.submitted} submitted.</>, to: `/activities/${a.id}`, cta: 'Manage' });
  for (const { a } of scheduled.slice(0, 2)) attention.push({ key: `s${a.id}`, icon: 'exam', text: <><strong>{a.title}</strong> opens {fmtDate(a.opensAt)}. {a.access === 'link' ? 'Share the exam link.' : a.invited ? `${a.invited} invited.` : 'No one is invited yet.'}</>, to: `/activities/${a.id}`, cta: a.invited || a.access === 'link' ? 'Manage' : 'Invite candidates' });
  if (examDrafts.length) attention.push({ key: 'xd', icon: 'exam', text: <>{examDrafts.length} exam{examDrafts.length === 1 ? '' : 's'} started but not scheduled.</>, to: `/exams/draft/${examDrafts[0].id}`, cta: 'Finish setting up' });
  if (questDrafts.length) attention.push({ key: 'qd', icon: 'grid', text: <>{questDrafts.length} quest{questDrafts.length === 1 ? ' is' : 's are'} still a draft.</>, to: `/quizzes/${questDrafts[0].id}`, cta: 'Finish and publish' });

  const recent = [...activities.map((a) => ({ id: a.id, title: a.title, kind: a.mode as string, when: a.createdAt as string, to: `/activities/${a.id}`, detail: a.mode === 'cbt' ? `${a.submitted} submitted` : a.mode === 'live' ? `${a.rooms} room${a.rooms === 1 ? '' : 's'}` : `${a.submitted} attempt${a.submitted === 1 ? '' : 's'}` }))]
    .sort((x, y) => +new Date(y.when) - +new Date(x.when)).slice(0, 5);

  const steps = [
    { done: qs.length > 0, text: 'Create your first quest', to: '/quizzes/new' },
    { done: published.length > 0, text: 'Publish it', to: qs[0] ? `/quizzes/${qs[0].id}` : '/quizzes/new' },
    { done: activities.some((a) => a.mode !== 'cbt'), text: 'Share it, or host it live', to: published[0] ? `/quizzes/${published[0].id}/use` : '/quizzes' },
    { done: exams.length > 0, text: 'Set up an exam', to: '/exams/new' },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="space-y-6">
      {head}

      <section aria-label="Start something new" className="space-y-3">
        <h2>Start something new</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {START.map((s, i) => (
            <Link key={s.to} to={s.to} className="card card-link flex flex-col gap-2 !p-4">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${ICON_TONES[i]}`}><Icon name={s.icon} className="h-6 w-6" /></span>
              <span className="font-display text-base font-semibold leading-tight">{s.title}</span>
              <span className="hint hidden sm:block">{s.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Quests" value={qs.length} sub={`${published.length} published · ${questDrafts.length} draft`} />
        <Stat label="Exams" value={exams.length + examDrafts.length} sub={`${open.length} open · ${scheduled.length} scheduled`} />
        <Stat label="Live quests hosted" value={rooms.length} sub={`${players} player${players === 1 ? '' : 's'} in total`} />
        <Stat label="Submissions" value={submitted} sub="from links and exams" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Needs your attention" className="min-w-0 space-y-3 rounded-3xl bg-[#171347] p-5 text-white shadow-[0_18px_40px_-24px_rgba(23,19,71,0.9)]">
          <h2 className="text-white">Needs your attention</h2>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-sun text-ink"><Icon name="check" className="h-5 w-5" /></span><p className="font-semibold">You are all caught up.</p></div>
          ) : (
            <ul className="space-y-2">
              {attention.slice(0, 5).map((x) => (
                <li key={x.key} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun text-ink"><Icon name={x.icon} className="h-5 w-5" /></span>
                  <p className="min-w-0 flex-1 break-words text-sm text-white/90 [&_strong]:text-white">{x.text}</p>
                  <Link className="btn btn-sun min-h-10! px-4! text-sm!" to={x.to}>{x.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent activity" className="min-w-0 space-y-3">
          <h2>Recent activity</h2>
          {recent.length === 0 ? <div className="card !p-4"><p className="text-muted">Nothing yet. Share a quest, host a live quest or invite candidates to an exam and it will show up here.</p></div> : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border-2 border-line/80 bg-surface">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={r.to} className="flex items-center gap-3 p-3 hover:bg-primary-soft/40">
                    <span className="chip shrink-0">{MODE[r.kind] ?? r.kind}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                    <span className="hidden text-sm text-muted sm:block">{r.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link className="btn-quiet" to="/results">See all results →</Link>
        </section>
      </div>

      {!allDone && (
        <section aria-label="Getting started" className="space-y-4 rounded-3xl bg-[#171347] p-5 text-white shadow-[0_18px_40px_-24px_rgba(23,19,71,0.9)] sm:p-6">
          <div><h2 className="text-white">Getting started</h2><p className="mt-1 text-sm text-white/80">Four steps to your first quest and your first CBT.</p></div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.text}>
                <Link to={s.to} className={`flex items-center gap-4 rounded-2xl p-4 transition ${s.done ? 'bg-white/5' : 'bg-white/10 hover:bg-white/15'}`}>
                  <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold ${s.done ? 'bg-white/20 text-sun' : 'bg-sun text-ink'}`}>{s.done ? <Icon name="check" className="h-5 w-5" /> : i + 1}</span>
                  <span className={`font-semibold ${s.done ? 'text-white/60 line-through' : ''}`}>{s.text}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
