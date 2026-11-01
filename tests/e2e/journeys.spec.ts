import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const PARTNER = `http://localhost:${process.env.E2E_PARTNER_PORT ?? '4601'}`;
const TEACHER = { email: 'host@dev.local', password: 'devpassword1' };

let quizId = '';
let teacherToken = '';

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(TEACHER.email);
  await page.getByLabel('Password').fill(TEACHER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'My quests' })).toBeVisible();
}
const auth = () => ({ authorization: `Bearer ${teacherToken}` });
async function createActivity(request: APIRequestContext, body: Record<string, unknown>) {
  const r = await request.post('/api/activities', { headers: auth(), data: { quizId, ...body } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
/** Signs in over the API and publishes a two-question quest, unless an earlier journey already did. */
async function ensureQuest(request: APIRequestContext) {
  if (quizId && teacherToken) return;
  teacherToken = (await (await request.post('/api/auth/login', { data: TEACHER })).json()).token;
  const q = (n: number) => ({ id: `q${n}`, text: `What is ${n} + ${n}?`, options: [{ id: `a${n}`, text: 'Correct answer' }, { id: `b${n}`, text: 'Wrong answer' }], correctId: `a${n}` });
  const created = await request.post('/api/quizzes', { headers: auth(), data: { title: 'Phone check', subject: '', instructions: '', questions: [q(1), q(2)] } });
  quizId = (await created.json()).id;
  expect((await request.post(`/api/quizzes/${quizId}/publish`, { headers: auth() })).ok()).toBeTruthy();
}
/** Answer every question correctly (or wrongly) in the attempt UI by clicking options by their visible text. */
async function answerAll(page: Page, picks: ('Correct answer' | 'Wrong answer')[]) {
  for (let i = 0; i < picks.length; i++) {
    await page.getByRole('radio', { name: new RegExp(`^${picks[i]}`) }).click();
    if (i < picks.length - 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
}

test.describe.serial('ClueQuest journeys', () => {
  test('host creates, saves, previews and publishes a quest in any subject', async ({ page, request }) => {
    await signIn(page);
    teacherToken = (await page.evaluate(() => localStorage.getItem('cq.teacher')))!;
    await page.getByRole('link', { name: 'Create quest' }).first().click();
    await page.getByLabel('Title').fill('Algebra basics');
    await page.getByLabel('Subject (optional)').fill('Mathematics');
    for (let i = 0; i < 2; i++) {
      if (i === 1) await page.getByRole('button', { name: 'Add question' }).click();
      await page.getByLabel('Question', { exact: true }).nth(i).fill(`What is ${i + 2} + ${i + 2}?`);
      await page.getByLabel('Option 1 text').nth(i).fill('Correct answer');
      await page.getByLabel('Option 2 text').nth(i).fill('Wrong answer');
    }
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]{36}$/);
    quizId = page.url().split('/').pop()!;

    await page.getByRole('link', { name: 'Preview as player' }).click();
    await expect(page.getByText('Question 1 of 2')).toBeVisible();
    await page.getByRole('radio', { name: /^Correct answer/ }).click();
    await expect(page.getByText(/ — correct/)).toBeVisible();
    await page.goBack();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText(/Published as version 1/)).toBeVisible();
    const check = await request.get(`/api/quizzes/${quizId}`, { headers: auth() });
    expect((await check.json()).latestVersion).toBe(1);
  });

  test('the same published quest runs as Points and as Steps, with marks kept separate', async ({ browser, request }) => {
    const points = await createActivity(request, { mode: 'solo', style: 'points', passMarkPercent: 50 });
    const steps = await createActivity(request, { mode: 'solo', style: 'steps', steps: { wrong: 'down' }, passMarkPercent: 50 });
    expect(points.quizVersion).toBe(steps.quizVersion);

    const p = await (await browser.newContext()).newPage();
    await p.goto(`/q/${points.shareCode}`);
    await p.getByLabel('Your name (optional)').fill('Ada');
    await p.getByRole('button', { name: 'Start quest' }).click();
    await answerAll(p, ['Correct answer', 'Correct answer']);
    await p.getByRole('button', { name: 'Review and submit' }).click();
    await expect(p.getByText('Review before you submit')).toBeVisible();
    await p.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(p.getByRole('heading', { name: 'Your marks' })).toBeVisible();
    await expect(p.getByText('2 / 2').first()).toBeVisible();
    await expect(p.getByText('Passed')).toBeVisible();
    await expect(p.getByText('Points earned')).toBeVisible();
    await expect(p.getByText('200', { exact: true })).toBeVisible();

    const s = await (await browser.newContext()).newPage();
    await s.goto(`/q/${steps.shareCode}`);
    await s.getByRole('button', { name: 'Start quest' }).click();
    await answerAll(s, ['Wrong answer', 'Correct answer']);
    await s.getByRole('button', { name: 'Review and submit' }).click();
    await s.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(s.getByRole('img', { name: 'Step 1 of 2' })).toBeVisible();
    await expect(s.getByText('1 / 2').first()).toBeVisible(); // marks: 1 of 2
    await expect(s.getByText('Not passed').or(s.getByText('Passed'))).toBeVisible(); // 50% meets the 50% mark
    await expect(s.getByText('Passed')).toBeVisible();
    await expect(s.getByText('Points earned')).toHaveCount(0);
  });

  test('live: host runs rounds, a refresh reconnects without scoring twice', async ({ browser, page, request }) => {
    const act = await createActivity(request, { mode: 'live', style: 'steps', steps: { wrong: 'down' }, secondsPerQuestion: 30 });
    await signIn(page);
    const room = await (await request.post(`/api/activities/${act.id}/rooms`, { headers: auth() })).json();
    await page.goto(`/host/room/${room.code}`);
    await expect(page.getByText('Lobby — 0 joined')).toBeVisible();

    const mk = async (nick: string) => {
      const ctx = await browser.newContext(); const pg = await ctx.newPage();
      await pg.goto(`/join/${room.code}`);
      await pg.getByLabel('Your nickname').fill(nick);
      await pg.getByRole('button', { name: 'Join game' }).click();
      await expect(pg.getByText('You are in')).toBeVisible();
      return pg;
    };
    const ann = await mk('Ann'); const ben = await mk('Ben');
    await expect(page.getByText('Lobby — 2 joined')).toBeVisible();
    await page.getByRole('button', { name: 'Start first question' }).click();

    await ann.getByRole('radio', { name: /^Correct answer/ }).click();
    await expect(ann.getByText('Answer locked in')).toBeVisible();
    await ann.reload(); // reconnect with the stored credential
    await expect(ann.getByText('Answer locked in')).toBeVisible();
    await expect(ann.getByRole('radio', { name: /^Correct answer/ })).toBeDisabled();
    await ben.getByRole('radio', { name: /^Wrong answer/ }).click();
    await expect(page.getByText('2 of 2 answered')).toBeVisible();
    await page.getByRole('button', { name: 'Lock answers now' }).click();

    await expect(ann.getByRole('banner').getByRole('img', { name: 'Step 1 of 2' })).toBeVisible();
    await expect(ann.getByText('Correct.')).toBeVisible();
    await expect(ben.getByRole('banner').getByRole('img', { name: 'Step 0 of 2' })).toBeVisible();
    await ann.reload();
    await expect(ann.getByRole('banner').getByRole('img', { name: 'Step 1 of 2' })).toBeVisible(); // still 1, not 2

    await page.getByRole('button', { name: 'Next question' }).click();
    await ann.getByRole('radio', { name: /^Correct answer/ }).click();
    await page.getByRole('button', { name: 'Lock answers now' }).click();
    await page.getByRole('button', { name: 'Show final results' }).click();
    await expect(page.getByRole('heading', { name: 'Final results' })).toBeVisible();
    await expect(ann.getByText('You finished #1')).toBeVisible();
    await expect(ben.getByText('You finished #2')).toBeVisible();
  });

  test('CBT: invitation only, answers survive a refresh, review before submit, results released later', async ({ browser, request }) => {
    const act = await createActivity(request, { mode: 'cbt', style: 'points', durationMinutes: 20, attemptLimit: 1, passMarkPercent: 50, release: 'manual' });
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`/q/${act.shareCode}`);
    await expect(anon.getByText('personal invitation link')).toBeVisible();

    const inv = await (await request.post(`/api/activities/${act.id}/invitations`, { headers: auth(), data: { invitees: [{ name: 'Bola Ade', email: 'bola@school.test' }] } })).json();
    const path = new URL(inv.invitations[0].url).pathname;
    const page = await (await browser.newContext()).newPage();
    await page.goto(path);
    await expect(page.getByText('Candidate:')).toBeVisible();
    await expect(page.getByText('20 minutes')).toBeVisible();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('radio', { name: /^Correct answer/ }).click();
    await expect(page.getByText('· Saved')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: /^Correct answer/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('timer')).toBeVisible();

    await page.getByRole('button', { name: 'Review and submit' }).click();
    await expect(page.getByText('1 question is unanswered')).toBeVisible();
    await page.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(page.getByText('Your host will release the results.')).toBeVisible();
    await expect(page.getByText('Your marks')).toHaveCount(0);

    await page.goto(path); // the invitation page now shows no more attempts
    await expect(page.getByText('You have used all your attempts.')).toBeVisible();

    await request.post(`/api/activities/${act.id}/release`, { headers: auth() });
    await page.getByRole('link', { name: 'View your result' }).click();
    await expect(page.getByRole('heading', { name: 'Your marks' })).toBeVisible();
    await expect(page.getByText('1 / 2').first()).toBeVisible();
  });

  test('partner: launch, repeated clicks, submit, return to class, one signed result despite failed deliveries', async ({ browser, request }) => {
    await request.put(`/api/quizzes/${quizId}/partner-access`, { headers: auth(), data: { allow: true } });
    await request.post(`${PARTNER}/reset`);
    await request.post(`${PARTNER}/fail?n=2`); // the partner's webhook endpoint will fail twice first

    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const launch = `${PARTNER}/launch?quizId=${quizId}&assignmentRef=asg-77&learnerRef=stu-5&type=solo&style=steps&attempts=1&pass=50`;
    await page.goto(launch);
    await expect(page).toHaveURL(/\/launch\//);
    const launchUrl = page.url();
    await page.goto(launchUrl); await page.goto(launchUrl); // repeated clicks
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/attempt\//);
    const attemptUrl = page.url();
    await page.goto(launchUrl); // opening the link again resumes, it does not add an attempt
    await expect(page.getByRole('button', { name: 'Resume your attempt' })).toBeVisible();
    await page.goto(attemptUrl);

    await answerAll(page, ['Correct answer', 'Correct answer']);
    await page.getByRole('button', { name: 'Review and submit' }).click();
    await page.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(page.getByRole('img', { name: 'Step 2 of 2' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to class' }).click();
    await expect(page.locator('#back')).toBeVisible();

    await expect.poll(async () => (await (await request.get(`${PARTNER}/results`)).json()).deliveries.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
    const out = await (await request.get(`${PARTNER}/results`)).json();
    expect(out.results).toHaveLength(1); // one logical result
    expect(new Set(out.deliveries.map((d: any) => d.eventId)).size).toBe(1); // every retry carried the same event id
    expect(out.deliveries.every((d: any) => d.valid)).toBe(true); // all signatures verified
    expect(out.results[0]).toMatchObject({ type: 'attempt.submitted', partnerAssignmentRef: 'asg-77', learnerRef: 'stu-5', style: 'steps', marksEarned: 2, marksPossible: 2, passed: true, stepPosition: 2, quizVersion: 1 });

    // A second launch click after completion cannot create another attempt.
    await page.goto(launchUrl);
    await expect(page.getByText('You have used all your attempts.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View your result' })).toBeVisible();
  });

  test('AI assistant: a short form fills the whole draft, which the host reviews and saves', async ({ page }) => {
    await signIn(page);
    await page.goto('/quizzes/new');
    await page.getByRole('button', { name: 'Use AI assistant' }).click();
    await page.getByLabel('What is the quest about?').fill('Photosynthesis');
    await page.getByLabel('How many questions?').fill('4');
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByText('Added 4 questions from the AI assistant')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Questions (4)' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Photosynthesis quest');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
  });

  test('@phone the player screen and Steps track fit a phone without sideways scrolling', async ({ browser, request }) => {
    await ensureQuest(request); // the phone project runs this alone, so it makes its own quest
    const act = await createActivity(request, { mode: 'solo', style: 'steps', instantFeedback: true });
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`/q/${act.shareCode}`);
    await page.getByRole('button', { name: 'Start quest' }).click();
    await page.getByRole('radio', { name: /^Correct answer/ }).tap();
    await expect(page.getByRole('img', { name: 'Step 1 of 2' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto('/sign-in');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
