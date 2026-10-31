import { describe, expect, it } from 'vitest';

import { compatibilityProblems, loadOrder } from './backup-format.js';

describe('loadOrder', () => {
  it('loads every foreign-key parent before its children', () => {
    const order = loadOrder(
      ['moves', 'games', 'users'],
      [
        { child: 'games', parent: 'users' },
        { child: 'moves', parent: 'games' },
      ],
    );
    expect(order).toEqual(['users', 'games', 'moves']);
  });

  it('still returns every table when references form a cycle', () => {
    const order = loadOrder(
      ['a', 'b'],
      [
        { child: 'a', parent: 'b' },
        { child: 'b', parent: 'a' },
      ],
    );
    expect(order.sort()).toEqual(['a', 'b']);
  });
});

describe('compatibilityProblems', () => {
  const header = {
    createdAt: '2026-10-31T00:00:00.000Z',
    migration: '0047_chatgpt_oauth.up.sql',
    tables: [{ columns: ['id', 'email'], name: 'users' }],
  };

  it('accepts a backup from the same version and schema', () => {
    expect(
      compatibilityProblems(
        header,
        '0047_chatgpt_oauth.up.sql',
        new Map([['users', ['id', 'email', 'x']]]),
      ),
    ).toEqual([]);
  });

  it('rejects another database version or a missing table/column', () => {
    const problems = compatibilityProblems(
      header,
      '0048_next.up.sql',
      new Map([['users', ['id']]]),
    );
    expect(problems.join(' ')).toContain('0048_next.up.sql');
    expect(problems.join(' ')).toContain('email');
  });
});
