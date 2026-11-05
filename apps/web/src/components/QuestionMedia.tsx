import { useRef, useState } from 'react';
import { ApiError, shrinkImage, uploadImage } from '../lib/api';
import { Notice } from './ui';
import { QuestionImage, Rich, hasMath, type PictureRef } from './Rich';

type Img = PictureRef | null;

const SYMBOLS: { label: string; tex: string; title: string }[] = [
  { label: 'x²', tex: '$x^2$', title: 'Power' }, { label: 'xₙ', tex: '$x_n$', title: 'Subscript' }, { label: 'a⁄b', tex: '$\\frac{a}{b}$', title: 'Fraction' },
  { label: '√', tex: '$\\sqrt{x}$', title: 'Square root' }, { label: 'π', tex: '$\\pi$', title: 'Pi' }, { label: 'θ', tex: '$\\theta$', title: 'Theta' },
  { label: '≤', tex: '$\\le$', title: 'Less than or equal' }, { label: '≥', tex: '$\\ge$', title: 'Greater than or equal' }, { label: '≠', tex: '$\\ne$', title: 'Not equal' },
  { label: '±', tex: '$\\pm$', title: 'Plus or minus' }, { label: '×', tex: '$\\times$', title: 'Times' }, { label: '÷', tex: '$\\div$', title: 'Divide' },
  { label: '∈', tex: '$\\in$', title: 'Element of' }, { label: '∪', tex: '$\\cup$', title: 'Union' }, { label: '∩', tex: '$\\cap$', title: 'Intersection' },
  { label: '∞', tex: '$\\infty$', title: 'Infinity' }, { label: 'Σ', tex: '$\\sum_{i=1}^{n} i$', title: 'Sum' }, { label: '∫', tex: '$\\int_a^b f(x)\\,dx$', title: 'Integral' }, { label: '°', tex: '$^\\circ$', title: 'Degrees' },
];

/** Under a question's text box: add a picture, insert maths symbols, and see the question the way a student will. */
export default function QuestionMedia({ text, image, onImage, onInsert }: { text: string; image: Img; onImage: (i: Img) => void; onInsert: (tex: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { const { id, url } = await uploadImage(await shrinkImage(f)); onImage({ id, url, alt: image?.alt ?? '' }); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add the picture'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label="Choose a picture" onChange={(e) => void pick(e.target.files?.[0])} />
        <button type="button" className="btn btn-secondary min-h-10! px-3! text-sm!" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Adding…' : image ? 'Replace picture' : '+ Add picture'}</button>
        <details className="relative">
          <summary className="btn btn-secondary min-h-10! cursor-pointer list-none px-3! text-sm!">Maths symbols</summary>
          <div className="absolute left-0 z-20 mt-2 w-[min(22rem,85vw)] rounded-2xl border-2 border-line bg-surface p-3 shadow-xl">
            <p className="hint mb-2">Tap a symbol to add it. Maths goes between dollar signs, for example $x^2 + 1$.</p>
            <div className="flex flex-wrap gap-1.5">
              {SYMBOLS.map((s) => <button key={s.tex} type="button" title={s.title} aria-label={s.title} onClick={() => onInsert(s.tex)} className="grid h-10 min-w-10 place-items-center rounded-lg border-2 border-line bg-white px-2 font-bold hover:border-primary">{s.label}</button>)}
            </div>
          </div>
        </details>
      </div>
      {err && <Notice kind="bad">{err}</Notice>}
      {image && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border-2 border-line p-3">
          <QuestionImage image={image} className="max-h-28" />
          <div className="min-w-48 flex-1 space-y-2">
            <label className="label" htmlFor={`alt-${image.id}`}>Describe the picture</label>
            <input id={`alt-${image.id}`} className="field" value={image.alt} maxLength={200} placeholder="For students who cannot see it" onChange={(e) => onImage({ ...image, alt: e.target.value })} />
            <button type="button" className="btn-quiet text-danger" onClick={() => onImage(null)}>Remove picture</button>
          </div>
        </div>
      )}
      {(hasMath(text) || image) && (
        <div className="rounded-2xl bg-primary-soft/60 p-3">
          <p className="hint mb-1">What students will see</p>
          <div className="space-y-2 text-lg font-semibold"><Rich text={text || '…'} />{image && <div><QuestionImage image={image} className="max-h-48" /></div>}</div>
        </div>
      )}
    </div>
  );
}
