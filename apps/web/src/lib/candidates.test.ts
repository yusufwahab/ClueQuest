import { describe, expect, it } from 'vitest';
import { TEMPLATE_CSV, candidatesFromText, cleanRows, isEmail, parseCsv, rowProblem } from './candidates';

describe('reading candidates from CSV or pasted text', () => {
  it('reads a file with a header row, in either column order', () => {
    expect(candidatesFromText('Name,Email\nAda Obi,ada@school.org\nBola Ade,bola@school.org').rows).toEqual([
      { name: 'Ada Obi', email: 'ada@school.org' }, { name: 'Bola Ade', email: 'bola@school.org' },
    ]);
    expect(candidatesFromText('E-mail,Full name\nada@school.org,Ada Obi').rows).toEqual([{ name: 'Ada Obi', email: 'ada@school.org' }]);
  });

  it('reads a file with no header by spotting the email, whichever column it is in', () => {
    expect(candidatesFromText('Ada Obi,ada@school.org\nbola@school.org,Bola Ade').rows).toEqual([
      { name: 'Ada Obi', email: 'ada@school.org' }, { name: 'Bola Ade', email: 'bola@school.org' },
    ]);
  });

  it('copes with quotes, commas inside names, semicolons, tabs, Windows line endings, a byte-order mark and blank lines', () => {
    expect(candidatesFromText('﻿Name,Email\r\n"Obi, Ada",ada@school.org\r\n\r\n"Say ""Bo"" Ade",bola@school.org\r\n').rows).toEqual([
      { name: 'Obi, Ada', email: 'ada@school.org' }, { name: 'Say "Bo" Ade', email: 'bola@school.org' },
    ]);
    expect(candidatesFromText('Name;Email\nAda;ada@school.org').rows).toEqual([{ name: 'Ada', email: 'ada@school.org' }]);
    expect(candidatesFromText('Name\tEmail\nAda\tada@school.org').rows).toEqual([{ name: 'Ada', email: 'ada@school.org' }]);
  });

  it('reports rows with no email instead of silently dropping them, and ignores empty lines', () => {
    const r = candidatesFromText('Name,Email\nAda,ada@school.org\nNo Email Person,\n,\n');
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(candidatesFromText('')).toEqual({ rows: [], skipped: 0 });
  });

  it('parses the downloadable template back into its own two examples', () => {
    expect(candidatesFromText(TEMPLATE_CSV).rows.map((r) => r.email)).toEqual(['ada@school.org', 'bola@school.org']);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('checking rows before they are sent', () => {
  it('says what is wrong with a row', () => {
    expect(rowProblem({ name: '', email: 'a@b.co' })).toBe('Add a name');
    expect(rowProblem({ name: 'Ada', email: 'not-an-email' })).toBe('Enter a valid email address');
    expect(rowProblem({ name: 'Ada', email: 'ada@school.org' })).toBe('');
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail(' ada@school.org ')).toBe(true);
  });

  it('keeps good rows, drops empty and broken ones, and removes repeated emails regardless of capitals', () => {
    const r = cleanRows([
      { name: 'Ada', email: 'ada@school.org' }, { name: '', email: '' }, { name: 'Bad', email: 'nope' },
      { name: 'Ada Again', email: 'ADA@school.org' }, { name: 'Bola', email: 'bola@school.org' },
    ]);
    expect(r.valid.map((c) => c.name)).toEqual(['Ada', 'Bola']);
    expect(r.duplicates).toBe(1);
  });
});
