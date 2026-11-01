/** ClueQuest brand and platform limits. Subject-neutral by design. */
export const brand = {
  name: 'ClueQuest',
  tagline: 'Build a quest once. Use it for practice, live games, exams and class assignments.',
  email: { footer: 'Sent by ClueQuest. If you did not expect this message you can ignore it.' },
} as const;

export const limits = {
  maxQuestions: 100,
  minOptions: 2,
  maxOptions: 6,
  maxMarks: 100,
  maxPoints: 1000,
  maxLivePlayers: 150,
} as const;

/** Colours mirrored in apps/web/src/index.css (@theme). Solid colours only. */
export const themeTokens = {
  paper: '#f6f5f1', ink: '#16202a', primary: '#1f4fd8', accent: '#0f7b6c', warn: '#b45309', danger: '#b42318', line: '#d8d5cb',
} as const;
