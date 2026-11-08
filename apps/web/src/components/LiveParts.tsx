import { useEffect, useState } from 'react';
import type { Standing } from '../lib/useRoom';
import { AvatarView } from './Avatar';

export function useCountdown(deadline: number | null, now: () => number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
  return deadline ? left : 0;
}

export function Standings({ rows, style, total, meId }: { rows: Standing[]; style: 'points' | 'steps'; total: number; meId?: string }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="table">
        <thead><tr><th>#</th><th>Player</th><th>{style === 'points' ? 'Points' : 'Step'}</th><th>Marks</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.id === meId ? 'bg-primary-soft font-semibold' : ''}>
              <td>{r.rank}</td>
              <td className="min-w-32"><span className="flex items-center gap-2"><AvatarView avatar={r.avatar} name={r.nickname} size={28} />{r.nickname}{r.id === meId ? ' (you)' : ''}</span></td>
              <td>{style === 'points' ? r.points : `${r.step} / ${total}`}</td>
              <td>{r.marks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timer({ left, total }: { left: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <div role="timer" aria-label={`${left} seconds left`}>
      <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">Time left</span><span className="text-2xl font-bold tabular-nums">{left}s</span></div>
      <div className="mt-1 h-3 w-full bg-line"><div className={`h-3 ${left <= 5 ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}
