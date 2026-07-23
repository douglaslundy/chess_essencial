import { describe, expect, it } from 'vitest';

import { runAutoAcceptFriendRequests } from './auto-accept-job.js';

function fakeSql(count: number) {
  return (() => Promise.resolve({ count })) as never;
}

describe('runAutoAcceptFriendRequests', () => {
  it('returns how many pending requests were accepted', async () => {
    await expect(runAutoAcceptFriendRequests(fakeSql(3))).resolves.toBe(3);
  });

  it('returns zero when nothing was pending', async () => {
    await expect(runAutoAcceptFriendRequests(fakeSql(0))).resolves.toBe(0);
  });
});
