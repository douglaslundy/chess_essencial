import { describe, expect, it } from 'vitest';

import { corsOptions } from './bootstrap.js';

describe('corsOptions', () => {
  it('allows every method the API exposes, so browser preflights pass', () => {
    const options = corsOptions('http://192.168.0.233:3100');
    expect(options.methods).toEqual(expect.arrayContaining(['PUT', 'PATCH', 'DELETE']));
    expect(options).toMatchObject({ credentials: true, origin: 'http://192.168.0.233:3100' });
  });
});
