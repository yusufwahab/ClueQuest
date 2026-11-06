import { StepRace } from './StepScene';
import { formatRoomCode } from '@cluequest/game-core';

/**
 * Small still pictures of the product, drawn in code (no image files), used on the landing and welcome pages so people can see what each
 * part looks like before they sign up. All are decorative: the text around them says the same thing.
 */

/** The exam screen a candidate sees: plain, with a clear timer and one question at a time. */
export function ExamMock({ large = false }: { large?: boolean }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-lg border border-[#d3d7de] bg-[#f3f4f6] text-[#1b2029] shadow-[0_18px_40px_-24px_rgba(23,19,71,0.5)]">
      <div className="flex items-center justify-between border-b border-[#d3d7de] bg-white px-3 py-2">
        <div><p className="text-[9px] font-semibold uppercase tracking-wider text-[#5a6270]">Examination</p><p className={`${large ? 'text-sm' : 'text-xs'} font-semibold`}>Biology term test · Ada Obi</p></div>
        <div className="rounded border border-[#d3d7de] bg-[#f3f4f6] px-2 py-0.5 text-right"><p className="text-[8px] font-semibold uppercase">Time remaining</p><p className={`font-mono ${large ? 'text-lg' : 'text-base'} font-bold leading-tight`}>44:59</p></div>
      </div>
      <div className={`grid gap-2 p-3 ${large ? 'sm:grid-cols-[1fr_7rem]' : ''}`}>
        <div className="rounded-lg border border-[#d3d7de] bg-white p-3">
          <p className="text-xs font-semibold">Question 3 of 20</p>
          <p className={`mt-1 ${large ? 'text-base' : 'text-sm'}`}>Which organelle makes energy for the cell?</p>
          {['Nucleus', 'Mitochondrion', 'Ribosome'].map((o, i) => (
            <div key={o} className={`mt-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${i === 1 ? 'border-[#1f3b8a] bg-[#e9eefb]' : 'border-[#d3d7de] bg-white'}`}>
              <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border-2 ${i === 1 ? 'border-[#1f3b8a]' : 'border-[#9aa3b2]'}`}>{i === 1 && <span className="h-1.5 w-1.5 rounded-full bg-[#1f3b8a]" />}</span>{o}
            </div>
          ))}
        </div>
        {large && (
          <div className="hidden rounded-lg border border-[#d3d7de] bg-white p-2 sm:block">
            <p className="text-[10px] font-semibold">Questions</p>
            <div className="mt-1 grid grid-cols-4 gap-1">{Array.from({ length: 12 }, (_, i) => <span key={i} className={`grid h-5 place-items-center rounded border text-[9px] font-semibold ${i === 2 ? 'border-[#1f3b8a] bg-[#1f3b8a] text-white' : i < 2 || i === 5 ? 'border-[#1f3b8a] bg-[#e9eefb] text-[#1f3b8a]' : 'border-[#d3d7de]'}`}>{i + 1}</span>)}</div>
            <p className="mt-1.5 text-[9px]"><strong>3</strong> of 20 answered</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The AI assistant form: a topic, a count, and one button. */
export function AiMock() {
  return (
    <div aria-hidden className="space-y-2 rounded-2xl bg-gradient-to-b from-primary-soft to-white p-3 ring-1 ring-line">
      <p className="text-xs font-bold">What is the quest about?</p>
      <div className="rounded-xl border-2 border-[#d6d0f7] bg-white px-3 py-2 text-sm font-semibold">Photosynthesis</div>
      <div className="flex items-center gap-2">
        <div className="rounded-xl border-2 border-[#d6d0f7] bg-white px-3 py-1.5 text-sm font-semibold">8 questions</div>
        <div className="flex-1 rounded-xl bg-primary px-3 py-2 text-center text-sm font-bold text-white">Generate draft</div>
      </div>
      <p className="text-[11px] font-semibold text-muted">✓ 8 questions ready to review. Nothing is shared until you publish.</p>
    </div>
  );
}

const CLASS = [
  { id: 'a', nickname: 'Ada', step: 7 }, { id: 'b', nickname: 'Ben', step: 6 }, { id: 'c', nickname: 'Chi', step: 6 }, { id: 'd', nickname: 'Dee', step: 4 },
  { id: 'e', nickname: 'Eli', step: 3 }, { id: 'f', nickname: 'Fay', step: 3 }, { id: 'g', nickname: 'Gus', step: 1 },
];

/** The host's live screen: the room code to share, and everyone on one staircase. */
export function HostScreenMock() {
  return (
    <div aria-hidden className="space-y-3 rounded-2xl bg-white p-4 text-ink shadow-[0_18px_40px_-24px_rgba(23,19,71,0.5)] ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Room code</p><p className="font-brand text-3xl font-bold tracking-widest">{formatRoomCode('482915')}</p></div>
        <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Question</p><p className="font-brand text-xl font-bold">5 of 8</p></div>
      </div>
      <StepRace racers={CLASS} max={8} />
      <div className="flex items-center justify-between text-xs font-bold"><span>7 of 7 answered</span><span className="rounded-full bg-primary px-3 py-1 text-white">Next question</span></div>
    </div>
  );
}
