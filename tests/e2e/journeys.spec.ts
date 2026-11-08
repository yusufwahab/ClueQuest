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
  // Signing in hashes the password, which can be slow on a busy machine, so allow more than the default 5 seconds.
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), / })).toBeVisible({ timeout: 20_000 }); // the dashboard
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
    await page.getByRole('link', { name: 'Create a quest' }).click(); // from the dashboard
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

  test('scheduling: early visitors are told when it starts, a manual practice link opens on the host\'s button, and a live quest set to automatic starts itself', async ({ browser, page, request }) => {
    await ensureQuest(request);
    const startsAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    const act = await createActivity(request, { mode: 'solo', style: 'points', startMode: 'manual', startsAt });

    // someone opens the link too early: they are told it has not started, and when it will
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/q/${act.shareCode}`);
    await expect(visitor.getByText('Not started yet', { exact: true })).toBeVisible();
    await expect(visitor.getByText('Starts in', { exact: true })).toBeVisible();
    await expect(visitor.getByRole('button', { name: 'Start quest' })).toHaveCount(0);

    // the host sees the plan and opens it by hand; the same page then lets the visitor in
    await signIn(page);
    await page.goto(`/activities/${act.id}`);
    await expect(page.getByText('You start it yourself')).toBeVisible();
    await page.getByRole('button', { name: 'Open it now' }).click();
    await expect(page.getByText('You opened it. It is open now.')).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole('button', { name: 'Start quest' })).toBeVisible();

    // the host can turn a schedule back into "instant"
    const later = await createActivity(request, { mode: 'live', style: 'steps', startMode: 'manual', startsAt });
    await page.goto(`/activities/${later.id}`);
    await page.getByRole('button', { name: 'Change schedule' }).click();
    await page.getByText('Instant', { exact: true }).click();
    await page.getByRole('button', { name: 'Save schedule' }).click();
    await expect(page.getByText('Starts straight away. No schedule.')).toBeVisible();

    // a live quest set to start by itself, with a player waiting in the lobby, starts without anyone pressing a button
    const live = await createActivity(request, { mode: 'live', style: 'steps', secondsPerQuestion: 30, startMode: 'auto', startsAt: new Date(Date.now() + 6000).toISOString() });
    const room = await (await request.post(`/api/activities/${live.id}/rooms`, { headers: auth() })).json();
    const player = await (await browser.newContext()).newPage();
    await player.goto(`/join/${room.code}`);
    await player.getByLabel('Your nickname').fill('Early bird');
    await player.getByRole('button', { name: 'Join game' }).click();
    await expect(player.getByText('You are in')).toBeVisible();
    await expect(player.getByRole('radio', { name: /^Correct answer/ })).toBeVisible({ timeout: 20_000 });
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
    // Pictures load lazily, so wait for the file to arrive rather than checking the instant the picture appears.
    await expect.poll(() => page.getByRole('img', { name: 'A bar chart of results' }).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 10_000 }).toBe(true);
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

  test('exams: a host writes an exam from scratch, schedules it, edits it, and it never appears under quests', async ({ page, request }) => {
    await ensureQuest(request);
    await signIn(page);
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Customize CBT', exact: true }).click(); // its own place in the menu
    await expect(page.getByRole('heading', { name: 'Customize CBT', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '+ Create CBT' }).click();

    // 1 Details
    await page.getByLabel('CBT title').fill('Chemistry paper');
    await page.getByRole('button', { name: 'Next: questions' }).click();
    // 2 Questions: the same editor as quests, with no quest needed first
    await page.getByLabel('Question', { exact: true }).fill('What is the symbol for water?');
    await page.getByLabel('Option 1 text').fill('H2O');
    await page.getByLabel('Option 2 text').fill('CO2');
    await page.getByRole('button', { name: 'Next: schedule' }).click();
    // 3 Schedule
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date(Date.now() + 86_400_000);
    await page.getByLabel('Closes').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    await page.getByLabel('Time allowed (minutes)').fill('45');
    await expect(page.getByText('Each candidate gets 45 minutes')).toBeVisible(); // plain-English summary of what candidates will see
    await page.getByRole('button', { name: 'Next: rules' }).click();
    // 4 Rules
    await page.getByLabel('Attempts allowed').fill('2');
    await page.getByLabel('Pass mark (% of marks)').fill('60');
    await expect(page.getByText('Everything looks ready.')).toBeVisible();
    await page.getByRole('button', { name: 'Create CBT' }).click();

    await expect(page).toHaveURL(/\/activities\//);
    await expect(page.getByRole('button', { name: 'Add candidates' })).toBeVisible();
    await expect(page.getByText('45 minutes each')).toBeVisible();
    const activityUrl = page.url();

    // edit it while nobody has started
    await page.getByRole('link', { name: 'Edit CBT' }).click();
    await page.getByRole('button', { name: 'Next: schedule' }).click();
    await page.getByLabel('Time allowed (minutes)').fill('90');
    await page.getByRole('button', { name: 'Next: rules' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(activityUrl);
    await expect(page.getByText('90 minutes each')).toBeVisible();

    // exam questions are not a quest
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'My quests' }).click();
    await expect(page.getByRole('heading', { name: 'My quests' })).toBeVisible();
    await expect(page.getByText('Chemistry paper')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Customize CBT', exact: true }).click();
    await expect(page.getByText('Chemistry paper')).toBeVisible();
    await expect(page.getByText('90 min').first()).toBeVisible();
  });

  test('exams: candidates write from one shared link, and the host adds people side by side or from a CSV', async ({ browser, page, request }) => {
    await ensureQuest(request);
    const q = { id: 'q1', text: 'Which is a noble gas?', options: [{ id: 'a', text: 'Neon' }, { id: 'b', text: 'Oxygen' }], correctId: 'a' };
    const draft = await (await request.post('/api/quizzes?kind=exam', { headers: auth(), data: { title: 'Shared link exam', subject: '', instructions: 'Answer the question.', questions: [q] } })).json();
    const exam = await (await request.post('/api/exams', { headers: auth(), data: { quizId: draft.id, durationMinutes: 30, release: 'manual', access: 'link' } })).json();
    await signIn(page);
    await page.goto(`/activities/${exam.id}`);

    // a link is there straight away, ready to copy
    const link = page.getByLabel('CBT link', { exact: true });
    await expect(link).toHaveValue(new RegExp(`/q/${exam.shareCode}$`));
    await expect(page.getByRole('button', { name: 'Copy CBT link' })).toBeVisible();

    // name and email side by side; a half-filled row is explained, not silently dropped
    await page.getByRole('button', { name: 'Add candidates' }).click();
    await page.getByLabel('Name 1').fill('Ada Obi'); await page.getByLabel('Email 1').fill('ada@school.test');
    await page.getByLabel('Name 2').fill('Bola Ade'); await page.getByLabel('Email 2').fill('bola@school.test');
    await page.getByLabel('Name 3').fill('No Email'); await page.getByLabel('Email 3').fill('nope');
    await page.getByRole('button', { name: /Create 2 invitations/ }).click();
    await expect(page.getByText('Row 3: Enter a valid email address')).toBeVisible();
    await page.getByRole('button', { name: 'Remove row 3' }).click();
    await page.getByRole('button', { name: /Create 2 invitations/ }).click();
    await expect(page.getByText('2 personal links created.')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // a CSV file, with a quoted name containing a comma, and one email that repeats
    await page.getByRole('button', { name: 'Add candidates' }).click();
    await page.getByLabel('Choose a CSV file').setInputFiles({ name: 'class.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Email\nCy Ade,cy@school.test\n"Eli, Jr",eli@school.test\nCy Again,CY@school.test\n') });
    await expect(page.getByText(/Added 3 candidates from/)).toBeVisible();
    await expect(page.getByLabel('Name 1')).toHaveValue('Cy Ade');
    await expect(page.getByText('1 repeated email ignored')).toBeVisible();
    await page.getByRole('button', { name: /Create 2 invitations/ }).click();
    await expect(page.getByText('2 personal links created.')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('4 invited')).toBeVisible();

    // the candidate's side: open the shared link, give a name, write the exam
    const cand = await (await browser.newContext()).newPage();
    await cand.goto(`/q/${exam.shareCode}`);
    await expect(cand.getByText('Enter your details to begin')).toBeVisible();
    await expect(cand.locator('.exam')).toBeVisible();
    await expect(cand.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
    await cand.getByLabel('Full name').fill('Ngozi Eze');
    await cand.getByLabel('Email address or ID number').fill('ngozi@school.test');
    await cand.getByLabel('I have read the instructions').check();
    await cand.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(cand.getByRole('timer')).toBeVisible();
    await cand.getByRole('radio', { name: /^Neon/ }).click();
    await expect(cand.getByText('All answers saved')).toBeVisible();
    await cand.getByRole('button', { name: 'Review and submit' }).click();
    await cand.getByRole('button', { name: 'Submit my answers' }).click();
    await expect(cand.getByText('Your host will release the results.')).toBeVisible();

    // and the host sees who sat it, by name and by the email they gave
    await page.reload();
    await page.getByRole('tab', { name: /Results/ }).click();
    await expect(page.getByText('Ngozi Eze')).toBeVisible();
    await expect(page.getByText('ngozi@school.test')).toBeVisible();
  });

  test('exams: an exam set to invitations only has no shared link and cannot be opened without one', async ({ browser, page, request }) => {
    await ensureQuest(request);
    const q = { id: 'q1', text: 'Question?', options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correctId: 'a' };
    const draft = await (await request.post('/api/quizzes?kind=exam', { headers: auth(), data: { title: 'Invite only exam', subject: '', instructions: '', questions: [q] } })).json();
    const exam = await (await request.post('/api/exams', { headers: auth(), data: { quizId: draft.id, durationMinutes: 30, release: 'manual', access: 'invited' } })).json();
    await signIn(page);
    await page.goto(`/activities/${exam.id}`);
    await expect(page.getByRole('heading', { name: 'Invite your candidates' })).toBeVisible();
    await expect(page.getByLabel('CBT link', { exact: true })).toHaveCount(0);
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(`/q/${exam.shareCode}`);
    await expect(stranger.getByText('personal invitation link')).toBeVisible();
  });

  test('exams: a bad schedule is explained in plain words and nothing is created', async ({ page, request }) => {
    await ensureQuest(request);
    await signIn(page);
    await page.goto('/exams/new');
    await page.getByLabel('CBT title').fill('Late exam');
    await page.getByRole('button', { name: 'Next: questions' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Question?');
    await page.getByLabel('Option 1 text').fill('Yes');
    await page.getByLabel('Option 2 text').fill('No');
    await page.getByRole('button', { name: 'Next: schedule' }).click();
    await page.getByLabel('Closes').fill('2020-01-01T09:00');
    await page.getByRole('button', { name: 'Next: rules' }).click();
    await expect(page.getByText('The closing time has already passed.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Create CBT' }).click();
    await expect(page.getByText('The closing time has already passed.').first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/activities\//);
  });

  test('exams: once a candidate starts, the questions and rules are locked', async ({ page, request }) => {
    await ensureQuest(request);
    const q = { id: 'q1', text: 'Question?', options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correctId: 'a' };
    const draft = await (await request.post('/api/quizzes?kind=exam', { headers: auth(), data: { title: 'Locked exam', subject: '', instructions: '', questions: [q] } })).json();
    const exam = await (await request.post('/api/exams', { headers: auth(), data: { quizId: draft.id, durationMinutes: 30, release: 'manual' } })).json();
    const inv = await (await request.post(`/api/activities/${exam.id}/invitations`, { headers: auth(), data: { invitees: [{ name: 'Cy', email: 'cy@school.test' }] } })).json();
    await signIn(page);
    await page.goto(`/activities/${exam.id}`);
    await expect(page.getByRole('link', { name: 'Edit CBT' })).toBeVisible(); // nobody has started yet
    expect((await request.post(`/api/public/invite/${inv.invitations[0].url.split('/exam/')[1]}/start`)).status()).toBe(201);
    await page.reload();
    await expect(page.getByText('locked because candidates have started')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit CBT' })).toHaveCount(0);
    await page.goto(`/exams/${exam.id}/edit`);
    await expect(page.getByRole('heading', { name: 'This CBT is locked' })).toBeVisible();
  });

  test('a new host is welcomed, shown what the platform offers, and taken straight into what they pick', async ({ page }) => {
    await page.goto('/sign-in?mode=register');
    await page.getByLabel('Your name').fill('Tomi Adeyemi');
    await page.getByLabel('Email').fill(`tomi-${Date.now()}@school.test`);
    await page.getByLabel('Password').fill('a-long-password-1');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Tomi!' })).toBeVisible();
    for (const name of ['Create a quest', 'Host a Live Quest', 'Set up a CBT', 'Try the AI assistant']) await expect(page.getByRole('link', { name })).toBeVisible();

    await page.getByRole('link', { name: 'Set up a CBT' }).click();
    await expect(page.getByRole('heading', { name: 'Create CBT' })).toBeVisible();

    // and the dashboard guides someone with nothing yet
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Tomi$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Start something new' })).toBeVisible();
  });

  test('"Draft with AI" from the welcome screen opens the assistant straight away', async ({ page }) => {
    await signIn(page);
    await page.goto('/welcome');
    await page.getByRole('link', { name: 'Try the AI assistant' }).click();
    await expect(page.getByLabel('What is the quest about?')).toBeVisible();
  });

  test('@phone a phone gets a bottom navigation bar, and the main screens fit without sideways scrolling', async ({ browser, request }) => {
    await ensureQuest(request);
    // A live room with a long title is listed on the dashboard; long titles must wrap, not push the page wider than the screen.
    const long = await (await request.post('/api/quizzes', { headers: auth(), data: { title: 'A quest with a rather long title to test wrapping on a narrow phone screen', subject: '', instructions: '', questions: [{ id: 'q1', text: 'Question?', options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correctId: 'a' }] } })).json();
    await request.post(`/api/quizzes/${long.id}/publish`, { headers: auth() });
    const liveAct = await (await request.post('/api/activities', { headers: auth(), data: { quizId: long.id, mode: 'live', style: 'steps' } })).json();
    await request.post(`/api/activities/${liveAct.id}/rooms`, { headers: auth() });
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript((tk) => localStorage.setItem('cq.teacher', tk), teacherToken);
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), / })).toBeVisible();
    const bottom = page.getByRole('navigation', { name: 'Main' });
    await expect(bottom).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeHidden(); // the sidebar is for bigger screens
    await expect(bottom.getByRole('link', { name: 'Host Live Quest' })).toBeVisible(); // full name for assistive tech, short label on screen

    for (const [link, heading] of [['Customize CBT', 'Customize CBT'], ['My quests', 'My quests'], ['Results', 'Results'], ['Home', null]] as const) {
      await bottom.getByRole('link', { name: link, exact: true }).click();
      if (heading) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `sideways scroll on ${link}`).toBeLessThanOrEqual(0);
    }
    await page.goto('/exams/new');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Your account' }).click(); // sign out lives behind the avatar
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('landing page: explains everything the platform does, answers the common questions, and leads straight into sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Create quizzes, host live games and customize CBT.');
    for (const name of [
      'From questions to results in three steps', 'One set of questions, three ways to run it', 'Everything you need to teach, test and play', 'Questions people ask', 'Ready to run your first quest?',
    ]) await expect(page.getByRole('heading', { name })).toBeVisible();
    for (const name of ['Practice quests', 'Live Quests', 'Customize CBT']) await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();

    // the questions people ask are answered, and honestly: no proctoring is claimed
    await page.getByText('How does Customize CBT work, and how is it kept fair?').click();
    await expect(page.getByText('does not use webcams or lock-down software')).toBeVisible();

    // a learner can use the room-code box straight away
    await page.getByLabel('Room code').fill('123456');
    await page.getByRole('button', { name: 'Join game' }).click();
    await expect(page).toHaveURL(/\/join\/123456$/);

    // a visitor can sign up from the first screen
    await page.goto('/');
    await page.getByRole('link', { name: 'Create free account' }).first().click();
    await expect(page).toHaveURL(/sign-in\?mode=register/);
    await expect(page.getByRole('heading', { name: 'Create a host account' })).toBeVisible();
  });

  test('@phone the landing page fits a phone without sideways scrolling', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('heading', { name: 'Questions people ask' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
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
