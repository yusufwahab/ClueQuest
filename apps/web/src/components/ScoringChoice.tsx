import { Field } from './ui';
import { PointsPreview, StepsPreview } from './FormatPreview';


export type Style = 'points' | 'steps';
export type Wrong = 'stay' | 'down';

/** The scoring formats a host can pick. Add a row here (and in game-core) to offer another one. */
const FORMATS: { id: Style; name: string; tag: string; desc: string }[] = [
  { id: 'points', name: 'Points', tag: 'Race for the top score', desc: 'Every correct answer earns the points you set on that question. Wrong or skipped earns zero.' },
  { id: 'steps', name: 'Steps', tag: 'Climb the staircase', desc: 'Everyone starts at step 0 and climbs one step for each correct answer.' },
];

/** Picks how a quest is scored. Used when creating a quest and again when turning it into a link, game or exam. */
export default function ScoringChoice({ style, wrong, onStyle, onWrong }: { style: Style; wrong: Wrong; onStyle: (s: Style) => void; onWrong: (w: Wrong) => void }) {
  const card = (on: boolean) => `block cursor-pointer rounded-2xl border-2 p-4 transition has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky ${on ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50'}`;
  return (
    <div className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">How should it be scored?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <label key={f.id} className={card(style === f.id)}>
              <input type="radio" className="sr-only" name="style" checked={style === f.id} onChange={() => onStyle(f.id)} />
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-xl font-semibold">{f.name}</span>
                <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-extrabold ${style === f.id ? 'border-primary bg-primary text-white' : 'border-line'}`}>{style === f.id ? '✓' : ''}</span>
              </span>
              <span className="chip mt-1">{f.tag}</span>
              <span className="hint mt-2 block">{f.desc}</span>
              <span className="mt-3 block">{f.id === 'points' ? <PointsPreview compact /> : <StepsPreview compact />}</span>
            </label>
          ))}
        </div>
        <p className="hint">Marks (the grade) are always counted separately, whichever you pick.</p>
      </fieldset>
      {style === 'steps' && (
        <Field label="When an answer is wrong or missing" htmlFor="wrong" hint="Nobody goes below step 0.">
          <select id="wrong" className="field" value={wrong} onChange={(e) => onWrong(e.target.value as Wrong)}>
            <option value="stay">Stay on the same step</option><option value="down">Move down one step</option>
          </select>
        </Field>
      )}
    </div>
  );
}
