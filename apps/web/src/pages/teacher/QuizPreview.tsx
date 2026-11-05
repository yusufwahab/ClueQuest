import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { gradeAttempt, type Style } from '@cluequest/game-core';
import { api } from '../../lib/api';
import { Loading, Notice, OptionBadge, PageHead } from '../../components/ui';
import { StepScene } from '../../components/StepScene';
import { QuestionImage, Rich } from '../../components/Rich';
import { AnswerPop, ScoreCard, ScoreChip, useAnswerPop } from '../../components/Feedback';

/** Host preview: plays the saved draft exactly like a learner would, graded locally. Nothing is stored. */
export default function QuizPreview() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['quiz', id], queryFn: () => api('GET', `/quizzes/${id}`) });
  const [style, setStyle] = useState<Style>('points');
  const [wrong, setWrong] = useState<'stay' | 'down'>('stay');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [pop, showPop] = useAnswerPop();

  const questions: any[] = q.data?.questions ?? [];
  const graded = useMemo(() => questions.map((x) => ({ id: x.id, correctId: x.correctId, marks: x.marks, points: x.points })), [questions]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const g = gradeAttempt(graded, answers, { wrong });
  const cur = questions[idx];

  return (
    <div className="space-y-5">
      <AnswerPop event={pop} />
      <PageHead back={{ to: `/quizzes/${id}`, label: 'Back to editor' }} title={`Preview: ${q.data.title}`} sub="Play it the way a learner will." />
      <Notice kind="info">This is how a learner sees the saved draft. Your answers here are not recorded.</Notice>
      <div className="card flex flex-wrap gap-4">
        <div><label className="label" htmlFor="pv-style">Scoring style</label>
          <select id="pv-style" className="field" value={style} onChange={(e) => setStyle(e.target.value as Style)}><option value="points">Points</option><option value="steps">Steps</option></select></div>
        {style === 'steps' && <div><label className="label" htmlFor="pv-wrong">Wrong or unanswered</label>
          <select id="pv-wrong" className="field" value={wrong} onChange={(e) => setWrong(e.target.value as 'stay' | 'down')}><option value="stay">Stay on the same step</option><option value="down">Move down one step</option></select></div>}
      </div>
      {!cur ? <Notice kind="warn">This quest has no questions yet.</Notice> : done ? (
        <div className="space-y-4">
          {style === 'points'
            ? <ScoreCard points={g.points} possible={g.pointsPossible}><ScoreChip>Marks {g.marksEarned} / {g.marksPossible} ({g.percent}%)</ScoreChip></ScoreCard>
            : <><StepScene position={g.stepPosition} max={g.stepMax} /><p className="text-center font-semibold">Marks: {g.marksEarned} / {g.marksPossible} ({g.percent}%)</p></>}
          <div className="flex justify-center"><button className="btn btn-primary" onClick={() => { setAnswers({}); setIdx(0); setDone(false); }}>Try again</button></div>
        </div>
      ) : (
        <div className="card space-y-4">
          <p className="hint">Question {idx + 1} of {questions.length} · {cur.marks} mark{cur.marks === 1 ? '' : 's'}{style === 'points' ? ` · ${cur.points} points` : ''}</p>
          <h2><Rich text={cur.text} /></h2>
          <QuestionImage image={cur.image} />
          <div className="space-y-2" role="radiogroup" aria-label="Answers">
            {cur.options.map((o: any, oi: number) => {
              const chosen = answers[cur.id];
              const reveal = !!chosen;
              const tone = reveal && o.id === cur.correctId ? 'border-accent bg-accent-soft' : reveal && chosen === o.id ? 'border-danger bg-danger-soft' : 'border-[#cfc8f7] bg-surface';
              return <button key={o.id} role="radio" aria-checked={chosen === o.id} disabled={reveal} onClick={() => { setAnswers((a) => ({ ...a, [cur.id]: o.id })); const right = o.id === cur.correctId; showPop(right ? 'correct' : 'wrong', right ? (style === 'points' ? `+${cur.points} points` : 'One step up') : style === 'steps' && wrong === 'down' ? 'One step down' : undefined); }} className={`opt ${tone}`}><OptionBadge index={oi} /><span><Rich text={o.text} inline />{reveal && o.id === cur.correctId ? ' — correct' : reveal && chosen === o.id ? ' — your answer' : ''}</span></button>;
            })}
          </div>
          {answers[cur.id] && cur.explanation && <Notice kind="info"><Rich text={cur.explanation} /></Notice>}
          {style === 'steps' && <StepScene variant="compact" position={gradeAttempt(graded.slice(0, idx + (answers[cur.id] ? 1 : 0)), answers, { wrong }).stepPosition} max={questions.length} />}
          <div className="flex gap-2">
            <button className="btn btn-secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
            {idx < questions.length - 1 ? <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Next</button> : <button className="btn btn-primary" onClick={() => setDone(true)}>Finish preview</button>}
          </div>
        </div>
      )}
    </div>
  );
}
