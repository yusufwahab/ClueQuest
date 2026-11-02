import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { limits } from '@cluequest/config';
import { ApiError, api } from '../lib/api';
import { Field, Icon, Modal, Notice } from './ui';

export interface AiResult { title: string; subject: string; instructions: string; questions: any[]; provider: string; skipped: number }

/**
 * "AI assistant" card for the quest editor. A short form (topic, optional notes, how many, how hard, who for) is sent in ONE request;
 * the answer is handed to the editor as ordinary draft questions that the host reviews. Nothing is saved or published from here.
 */
export default function AiAssistant({ onResult }: { onResult: (r: AiResult) => void }) {
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ enabled: boolean }>('GET', '/ai/status'), staleTime: 300_000 });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ topic: '', notes: '', count: 8, difficulty: 'mixed', level: '', language: 'English', optionCount: 4, explanations: false });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<AiResult>('POST', '/ai/quest', { body: { ...f, count: Number(f.count), optionCount: Number(f.optionCount) } });
      onResult(r);
      setOpen(false);
    } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not reach the assistant. Try again.'); } finally { setBusy(false); }
  };

  if (status.isLoading) return null;
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 border-2 border-primary/30 bg-primary-soft/60" aria-label="AI assistant">
      <div>
        <h2 className="flex items-center gap-2"><Icon name="spark" className="h-5 w-5 text-primary" />Short on time?</h2>
        <p className="hint">Tell the AI assistant the topic and it writes a full draft for you to review. Nothing is shared until you publish.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Use AI assistant</button>

      {open && (
        <Modal title="AI assistant" onClose={() => !busy && setOpen(false)} wide>
          {!status.data?.enabled ? (
            <Notice kind="warn">The assistant is not switched on for this server yet. Whoever runs ClueQuest can turn it on by adding a free Gemini or Groq key (see <code>apps/server/.env.example</code>). You can still write questions by hand.</Notice>
          ) : (
            <form className="space-y-4" onSubmit={generate}>
              <Field label="What is the quest about?" htmlFor="ai-topic" hint="For example: Photosynthesis, Python loops, World War II causes, French food vocabulary.">
                <input id="ai-topic" className="field" required minLength={3} maxLength={300} value={f.topic} onChange={(e) => set('topic', e.target.value)} />
              </Field>
              <Field label="How many questions?" htmlFor="ai-count"><input id="ai-count" type="number" min={1} max={20} className="field" value={f.count} onChange={(e) => set('count', Number(e.target.value))} /></Field>
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer font-bold">More options (optional)</summary>
                <div className="mt-3 space-y-4">
                  <Field label="Your notes (optional)" htmlFor="ai-notes" hint="Paste a lesson or text. Questions then use only what is in it, which keeps them accurate.">
                    <textarea id="ai-notes" className="field min-h-24" maxLength={6000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Difficulty" htmlFor="ai-diff">
                      <select id="ai-diff" className="field" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                        <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                      </select>
                    </Field>
                    <Field label="Answer options each" htmlFor="ai-opts">
                      <select id="ai-opts" className="field" value={f.optionCount} onChange={(e) => set('optionCount', Number(e.target.value))}>
                        {Array.from({ length: limits.maxOptions - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                    <Field label="Language" htmlFor="ai-lang"><input id="ai-lang" className="field" maxLength={30} value={f.language} onChange={(e) => set('language', e.target.value)} /></Field>
                  </div>
                  <Field label="Who is it for? (optional)" htmlFor="ai-level" hint="For example: beginners, Grade 5, first-year university.">
                    <input id="ai-level" className="field" maxLength={60} value={f.level} onChange={(e) => set('level', e.target.value)} />
                  </Field>
                  <label className="flex min-h-11 items-center gap-3 font-semibold">
                    <input type="checkbox" className="h-5 w-5 accent-[#5b3df5]" checked={f.explanations} onChange={(e) => set('explanations', e.target.checked)} />
                    Add a short explanation to each answer
                  </label>
                </div>
              </details>
              {err && <Notice kind="bad">{err}</Notice>}
              <button className="btn btn-primary w-full sm:w-auto" disabled={busy || f.topic.trim().length < 3}>{busy ? 'Writing your draft…' : 'Generate draft'}</button>
              <p className="hint">One request builds the whole draft, and you can edit every question after.</p>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
