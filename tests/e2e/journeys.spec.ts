import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const PARTNER = `http://localhost:${process.env.E2E_PARTNER_PORT ?? '4601'}`;
const TEACHER = { email: 'host@dev.local', password: 'devpassword1' };

import { deflateSync, crc32 } from 'node:zlib';

/** A valid 8x8 PNG, built here so the test does not depend on a hand-typed file. */
function makePng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2; // 8x8, 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(8 * 3, 0xc8)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(8).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng();

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
    await expect(page.getByText('First, choose how this quest is played')).toBeVisible();
    await page.getByText('Climb the staircase').click(); // Steps
    await page.getByLabel('When an answer is wrong or missing').selectOption('down');
    await page.getByRole('button', { name: 'Next: details' }).click();
    await page.getByLabel('Title').fill('Algebra basics');
    await page.getByLabel('Subject (optional)').fill('Mathematics');
    await page.getByRole('button', { name: 'Next: questions' }).click();
    for (let i = 0; i < 2; i++) {
      if (i === 1) await page.getByRole('button', { name: 'Add another question' }).click();
      await page.getByLabel('Question', { exact: true }).fill(`What is ${i + 2} + ${i + 2}?`);
      await page.getByLabel('Option 1 text').fill('Correct answer');
      await page.getByLabel('Option 2 text').fill('Wrong answer');
    }
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]{36}$/);
    quizId = page.url().split('/').pop()!;

    await page.getByRole('button', { name: 'Next: review' }).click();
    await page.getByRole('link', { name: 'Preview as player' }).click();
    await expect(page.getByText('Question 1 of 2')).toBeVisible();
    await page.getByRole('radio', { name: /^Correct answer/ }).click();
    await expect(page.getByText(/ — correct/)).toBeVisible();
    await page.goBack();

    await page.getByRole('button', { name: 'Next: review' }).click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText(/Published as version 1/)).toBeVisible();
    const check = await request.get(`/api/quizzes/${quizId}`, { headers: auth() });
    const saved = await check.json();
    expect(saved.latestVersion).toBe(1);
    expect(saved.play).toMatchObject({ style: 'steps', wrong: 'down' }); // the scoring chosen first is kept with the quest
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
    await expect(page.getByRole('rowheader', { name: 'Candidate' })).toBeVisible();
    await expect(page.getByText('20 minutes')).toBeVisible();
    await expect(page.locator('.exam')).toBeVisible(); // exams get the plain, calm look
    await expect(page.locator('.hero-bg')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled(); // not until the candidate confirms
    await page.getByLabel('I have read the instructions').check();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.locator('.exam')).toBeVisible();
    await page.getByRole('radio', { name: /^Correct answer/ }).click();
    await expect(page.getByText('All answers saved')).toBeVisible();
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
    await page.getByRole('button', { name: 'Next: details' }).click();
    await page.getByRole('button', { name: 'Use AI assistant' }).click();
    await page.getByLabel('What is the quest about?').fill('Photosynthesis');
    await page.getByLabel('How many questions?').fill('4');
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByText('Added 4 questions from the AI assistant')).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Photosynthesis quest');
    await page.getByRole('button', { name: 'Next: questions' }).click();
    await expect(page.getByRole('heading', { name: 'Questions (4)' })).toBeVisible();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
  });

  test('autosave: a slow save of an earlier answer can never wipe out the last answer', async ({ browser, request }) => {
    await ensureQuest(request);
    const act = await createActivity(request, { mode: 'solo', style: 'points' });
    const page = await (await browser.newContext()).newPage();
    // Hold the first save in the air, and let it land only AFTER question 2 has been answered but BEFORE question 2's own save is due (it waits
    // half a second). That is the exact window the old code got wrong: finishing the first save marked everything as saved, so question 2's
    // save was skipped and the last answer never reached the server. Releasing the gate by hand makes the timing exact instead of a guess.
    let saves = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    await page.route('**/api/attempts/me/answers', async (route) => { saves++; if (saves === 1) await gate; await route.continue(); });
    await page.goto(`/q/${act.shareCode}`);
    await page.getByRole('button', { name: 'Start quest' }).click();
    await page.getByRole('radio', { name: /^Correct answer/ }).click(); // question 1
    await expect.poll(() => saves).toBe(1); // its save is on the way, held back
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: /^Correct answer/ }).click(); // question 2, while question 1's save is still in flight
    release(); // question 1's save lands now
    await page.waitForTimeout(1500); // long enough for question 2's own save to be sent, or wrongly skipped
    await page.getByRole('button', { name: 'Review and submit' }).click();
    await page.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(page.getByText('2 / 2').first()).toBeVisible(); // both answers were saved and marked
  });

  test('maths and pictures written by the host are shown to students, and money stays plain text', async ({ browser, request }) => {
    await ensureQuest(request);
    const up = await request.post('/api/images', { headers: { ...auth(), 'content-type': 'image/png' }, data: PNG });
    expect(up.status()).toBe(201);
    const { id: imageId } = await up.json();
    const questions = [{
      id: 'm1', text: 'What is $\\frac{1}{2} + \\frac{1}{4}$? Two cups cost $5 and $10 in total.', image: { id: imageId, alt: 'A bar chart of results' },
      options: [{ id: 'a', text: '$\\frac{3}{4}$' }, { id: 'b', text: 'Not a fraction' }], correctId: 'a',
    }];
    const created = await request.post('/api/quizzes', { headers: auth(), data: { title: 'Maths check', subject: '', instructions: '', questions } });
    const id = (await created.json()).id;
    expect((await request.post(`/api/quizzes/${id}/publish`, { headers: auth() })).ok()).toBeTruthy();
    const act = (await (await request.post('/api/activities', { headers: auth(), data: { quizId: id, mode: 'solo', style: 'points' } })).json());

    const page = await (await browser.newContext()).newPage();
    await page.goto(`/q/${act.shareCode}`);
    await page.getByRole('button', { name: 'Start quest' }).click();
    await expect(page.locator('.katex').first()).toBeVisible({ timeout: 15_000 }); // the maths engine loads only when needed
    expect(await page.locator('.katex').count()).toBeGreaterThanOrEqual(2); // the question and the first option
    await expect(page.getByText('Two cups cost $5 and $10 in total.')).toBeVisible(); // not mistaken for maths
    await expect(page.getByRole('img', { name: 'A bar chart of results' })).toBeVisible();
    const loaded = await page.getByRole('img', { name: 'A bar chart of results' }).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
    expect(loaded).toBe(true);
  });

  test('editor: add a picture and maths symbols to a question and see what students will see', async ({ page, request }) => {
    await ensureQuest(request);
    await signIn(page);
    await page.goto(`/quizzes/${quizId}`); // an existing quest opens on its questions
    await page.getByText('Maths symbols').click();
    await page.getByRole('button', { name: 'Fraction' }).click();
    await expect(page.getByText('What students will see')).toBeVisible();
    await expect(page.locator('.katex').first()).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Choose a picture').setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('Describe the picture').fill('A plot of the data');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    const q = await (await request.get(`/api/quizzes/${quizId}`, { headers: auth() })).json();
    expect(q.questions[0].image).toMatchObject({ alt: 'A plot of the data' });
    expect(q.questions[0].text).toContain('\\frac');
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
