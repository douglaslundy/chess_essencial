import { describe, expect, it } from 'vitest';

import { MEDIEVAL_VIEWS, medievalViewUrl, nearestView } from './medieval';

describe('medieval statue views', () => {
  const views = [0, 45, 135, 180, 225, 315];

  it('picks the closest photographed angle, across 0°', () => {
    expect(nearestView(views, 10)).toBe(0);
    expect(nearestView(views, 350)).toBe(0);
    expect(nearestView(views, 300)).toBe(315);
    expect(nearestView(views, 100)).toBe(135);
  });

  it('keeps the current photo while the camera sits near the midpoint', () => {
    // 90° is 45° from 45 and 45° from 135: no flicker between them.
    expect(nearestView(views, 92, 45)).toBe(45);
    expect(nearestView(views, 120, 45)).toBe(135);
  });

  it('has a front and a back photo for every piece', () => {
    for (const angles of Object.values(MEDIEVAL_VIEWS)) {
      expect(angles).toContain(0);
      expect(angles).toContain(180);
    }
  });

  it('builds zero-padded asset paths', () => {
    expect(medievalViewUrl('b', 'n', 45)).toBe('/pieces/medieval/bn/045.webp');
  });
});
