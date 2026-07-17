import { describe, expect, it } from 'vitest';

import { realtimeUrl } from './game-socket';

describe('realtimeUrl', () => {
  it('derives the typed websocket endpoint from the API base URL', () => {
    expect(realtimeUrl('https://xadrez.example/v1')).toBe('wss://xadrez.example/v1/ws');
    expect(realtimeUrl('http://localhost:4000/v1/')).toBe('ws://localhost:4000/v1/ws');
  });
});
