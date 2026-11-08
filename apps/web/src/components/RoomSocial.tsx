import { useEffect, useRef, useState } from 'react';
import { REACTIONS } from '@cluequest/game-core';
import type { ChatMessage, ReactionBurst, RoomState } from '../lib/useRoom';
import { AvatarView } from './Avatar';

export const REACTION_EMOJI: Record<string, string> = { clap: '👏', fire: '🔥', laugh: '😂', wow: '😮', heart: '❤️', party: '🎉', rocket: '🚀', thumbs: '👍' };
const REACTION_NAME: Record<string, string> = { clap: 'Clap', fire: 'Fire', laugh: 'Laugh', wow: 'Wow', heart: 'Love', party: 'Celebrate', rocket: 'Rocket', thumbs: 'Thumbs up' };

type Say = (kind: 'chat' | 'reaction', body: string) => Promise<{ ok: boolean; error?: string }>;

/** Emoji that float up the screen when anyone in the room sends one. */
export function ReactionLayer({ bursts }: { bursts: ReactionBurst[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[70vh] overflow-hidden">
      {bursts.map((b) => (
        <div key={b.id} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${b.x}%`, animation: 'float-up 2.4s ease-out forwards' }}>
          <span className="text-5xl drop-shadow">{REACTION_EMOJI[b.reaction] ?? '✨'}</span>
          <span className="mt-0.5 max-w-24 truncate rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-bold text-white">{b.nickname}</span>
        </div>
      ))}
    </div>
  );
}

export function ReactionBar({ say, disabled }: { say: Say; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Send a reaction" className="flex flex-wrap gap-1.5">
      {REACTIONS.map((r) => (
        <button key={r} type="button" disabled={disabled} aria-label={REACTION_NAME[r]} title={REACTION_NAME[r]} onClick={() => void say('reaction', r)}
          className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-line bg-white text-2xl transition hover:-translate-y-0.5 hover:border-primary/50 active:scale-90 disabled:opacity-40">{REACTION_EMOJI[r]}</button>
      ))}
    </div>
  );
}

export function ChatBox({ messages, say, meId, enabled = true, locked = false }: { messages: ChatMessage[]; say: Say; meId?: string; enabled?: boolean; locked?: boolean }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = end.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr('');
    const r = await say('chat', text);
    setBusy(false);
    if (r.ok) setText(''); else setErr(r.error ?? 'Could not send');
  };
  return (
    <section aria-label="Room chat" className="space-y-2">
      <div role="log" aria-live="polite" className="max-h-56 min-h-28 space-y-1.5 overflow-y-auto rounded-2xl bg-paper p-3 ring-1 ring-line">
        {messages.length === 0 && <p className="hint">No messages yet. Say hello! 👋</p>}
        {messages.map((m) => (
          <p key={m.id} className={`break-words rounded-xl px-3 py-1.5 text-sm ${m.host ? 'bg-sun/30 font-semibold' : m.playerId && m.playerId === meId ? 'ml-6 bg-primary-soft' : 'bg-white'}`}>
            <b className={m.host ? 'text-ink' : 'text-primary'}>{m.host ? '⭐ Host' : m.nickname}</b> {m.body}
          </p>
        ))}
        <div ref={end} />
      </div>
      {!enabled ? <p className="hint">The host has turned chat off.</p> : locked ? <p className="hint">Chat opens again when the question closes.</p> : (
        <form onSubmit={send} className="flex gap-2">
          <label className="sr-only" htmlFor="chat-in">Message</label>
          <input id="chat-in" className="field min-h-11! flex-1" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Type a message" autoComplete="off" />
          <button className="btn btn-primary min-h-11! px-4! text-base!" disabled={busy || !text.trim()}>Send</button>
        </form>
      )}
      {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
    </section>
  );
}

/** Everyone in the room as a little character with a name. While a question is open it also shows who has answered. */
export function Roster({ players, meId, showAnswered = false, onKick }: { players: RoomState['players']; meId?: string; showAnswered?: boolean; onKick?: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {players.map((p) => {
        const me = p.id === meId;
        return (
          <li key={p.id} className={`relative flex flex-col items-center rounded-2xl p-2 text-center ${me ? 'bg-sun/25 ring-2 ring-sun' : 'bg-white ring-1 ring-line'}`}>
            <AvatarView avatar={p.avatar} name={p.nickname} size={64} className="animate-pop" />
            <span className="mt-1 w-full truncate text-xs font-bold">{p.nickname}{me ? ' (you)' : ''}</span>
            {showAnswered && <span className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-extrabold ${p.answered ? 'bg-accent text-white' : 'bg-line text-muted'}`} aria-label={p.answered ? 'Answered' : 'Still thinking'}>{p.answered ? '✓' : '…'}</span>}
            {onKick && <button type="button" className="mt-0.5 text-[11px] font-semibold text-danger underline" onClick={() => onKick(p.id)} aria-label={`Remove ${p.nickname}`}>remove</button>}
          </li>
        );
      })}
    </ul>
  );
}
