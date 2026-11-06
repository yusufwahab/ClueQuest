import { useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { TEMPLATE_CSV, candidatesFromText, cleanRows, rowProblem, type Row } from '../lib/candidates';
import { CopyButton, Notice } from './ui';

const BATCH = 25; // invitations are emailed as they are created, so large lists go in small batches
const blankRows = (n: number): Row[] => Array.from({ length: n }, () => ({ name: '', email: '' }));
type Sent = { name: string; email: string; url: string; emailStatus: string };

/**
 * Add candidates to an exam: type them in side by side (name and email), paste them from a spreadsheet, or upload a CSV file.
 * Each person gets a personal link, emailed to them where email is set up, and shown here to copy.
 */
export default function InviteCandidates({ activityId, onSent, onDone }: { activityId: string; onSent: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => blankRows(3));
  const [sent, setSent] = useState<Sent[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const { valid, duplicates } = cleanRows(rows);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Fill the list from pasted or uploaded text. Existing typed rows are kept, and new ones are added after them. */
  const load = (text: string, source: string) => {
    const { rows: found, skipped } = candidatesFromText(text);
    if (!found.length) { setNote(''); setError(`No candidates found in ${source}. Each line needs a name and an email address.`); return; }
    setError('');
    setRows((rs) => [...rs.filter((r) => r.name.trim() || r.email.trim()), ...found, ...blankRows(1)]);
    setNote(`Added ${found.length} candidate${found.length === 1 ? '' : 's'} from ${source}.${skipped ? ` ${skipped} row${skipped === 1 ? ' was' : 's were'} skipped for having no email.` : ''}`);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) { setError('That file is too large. Keep it under 1 MB.'); return; }
    load(await f.text(), `“${f.name}”`);
    if (file.current) file.current.value = '';
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'candidates-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const send = async () => {
    setTried(true);
    if (!valid.length) { setError('Add at least one candidate with a name and a valid email.'); return; }
    if (rows.some((r) => (r.name.trim() || r.email.trim()) && rowProblem(r))) { setError('Fix the highlighted rows, or clear them, then try again.'); return; }
    setBusy(true); setError('');
    const done: Sent[] = [];
    try {
      for (let i = 0; i < valid.length; i += BATCH) {
        setProgress(valid.length > BATCH ? `Creating invitations… ${Math.min(i + BATCH, valid.length)} of ${valid.length}` : '');
        const r = await api('POST', `/activities/${activityId}/invitations`, { body: { invitees: valid.slice(i, i + BATCH) } });
        done.push(...r.invitations);
      }
      setSent(done); onSent();
    } catch (e) {
      if (done.length) { setSent(done); onSent(); }
      setError(`${e instanceof ApiError ? e.message : 'Could not create the invitations'}${done.length ? ` The first ${done.length} were created and are shown below.` : ''}`);
    } finally { setBusy(false); setProgress(''); }
  };

  if (sent.length) {
    return (
      <div className="space-y-3">
        {error && <Notice kind="bad">{error}</Notice>}
        <p className="hint">{sent.length} personal link{sent.length === 1 ? '' : 's'} created. They are shown only now, so copy them if any email does not arrive. Adding the same email again makes a new link and stops the old one working.</p>
        <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">{sent.map((i) => (
          <li key={i.email} className="rounded-xl border border-line p-3">
            <p className="font-bold">{i.name} <span className="hint font-normal">· {i.email} · {i.emailStatus === 'sent' ? 'emailed' : 'link only, not emailed'}</span></p>
            <div className="mt-2 flex gap-2"><input readOnly aria-label={`Link for ${i.name}`} value={i.url} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 text-sm" /><CopyButton value={i.url} what={`link for ${i.name}`} className="btn btn-primary" /></div>
          </li>))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={sent.map((i) => `${i.name} <${i.email}>: ${i.url}`).join('\n')} label="Copy all links" what="all links" />
          <button className="btn btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => void upload(e.target.files?.[0])} />
        <button type="button" className="btn btn-secondary min-h-10! px-4! text-base!" onClick={() => file.current?.click()}>Upload a CSV</button>
        <button type="button" className="btn-quiet" onClick={template}>Download a template</button>
      </div>
      <p className="hint -mt-2">A CSV needs two columns, Name and Email. Or type candidates below, or paste a list copied from a spreadsheet.</p>
      {note && <Notice kind="ok">{note}</Notice>}
      {error && <Notice kind="bad">{error}</Notice>}

      <div role="group" aria-label="Candidates" className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-2 text-sm font-bold" aria-hidden><span>Name</span><span>Email</span><span /></div>
        <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const touched = r.name.trim() || r.email.trim();
            const problem = touched && (tried || (r.name.trim() && r.email.trim())) ? rowProblem(r) : '';
            return (
              <div key={i}>
                <div className="grid grid-cols-[1fr_1fr_2.5rem] items-center gap-2">
                  <input className={`field min-h-11! py-1.5! ${problem === 'Add a name' ? 'border-danger!' : ''}`} value={r.name} placeholder="Ada Obi" aria-label={`Name ${i + 1}`} autoComplete="off" maxLength={80}
                    onChange={(e) => set(i, { name: e.target.value })}
                    onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\n\t]/.test(t) || (t.includes('@') && t.includes(','))) { e.preventDefault(); load(t, 'what you pasted'); } }} />
                  <input className={`field min-h-11! py-1.5! ${problem === 'Enter a valid email address' ? 'border-danger!' : ''}`} type="email" value={r.email} placeholder="ada@school.org" aria-label={`Email ${i + 1}`} autoComplete="off" maxLength={120}
                    onChange={(e) => set(i, { email: e.target.value })} />
                  <button type="button" className="grid h-11 place-items-center rounded-xl text-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : blankRows(1)))}>✕</button>
                </div>
                {problem && <p className="mt-0.5 text-sm font-semibold text-danger">Row {i + 1}: {problem}</p>}
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-quiet" onClick={() => setRows((rs) => [...rs, ...blankRows(3)])}>+ Add more rows</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button className="btn btn-primary" onClick={send} disabled={busy || !valid.length}>{busy ? 'Creating…' : `Create ${valid.length || ''} invitation${valid.length === 1 ? '' : 's'}`.replace('Create  ', 'Create ')}</button>
        <span className="hint" aria-live="polite">{progress || (valid.length ? `${valid.length} ready${duplicates ? ` · ${duplicates} repeated email${duplicates === 1 ? '' : 's'} ignored` : ''}` : 'Nothing to send yet')}</span>
      </div>
    </div>
  );
}
