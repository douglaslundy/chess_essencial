import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameSocket, realtimeUrl } from './game-socket';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {}

  send(value: string) {
    this.sent.push(value);
  }

  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(data === undefined ? {} : { data: JSON.stringify(data) });
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

describe('realtimeUrl', () => {
  it('derives the typed websocket endpoint from the API base URL', () => {
    expect(realtimeUrl('https://xadrez.example/v1')).toBe('wss://xadrez.example/v1/ws');
    expect(realtimeUrl('http://localhost:4000/v1/')).toBe('ws://localhost:4000/v1/ws');
  });
});

describe('GameSocket authentication handshake', () => {
  it('joins only after the server confirms authentication', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const connection = vi.fn();
    const socket = new GameSocket('00000000-0000-4000-8000-000000000001', 'access-token', 3, {
      connection,
      drawOffered: vi.fn(),
      snapshot: vi.fn(),
      move: vi.fn(),
      finished: vi.fn(),
      error: vi.fn(),
    });

    socket.connect();
    const transport = FakeWebSocket.instances[0]!;
    transport.emit('open');
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(transport.sent.map((item) => JSON.parse(item).event)).toEqual(['auth.authenticate']);
    expect(connection).not.toHaveBeenCalledWith('online');

    transport.emit('message', {
      event: 'auth.authenticated',
      data: { protocolVersion: 1 },
    });
    expect(transport.sent.map((item) => JSON.parse(item).event)).toEqual([
      'auth.authenticate',
      'game.join',
    ]);
    expect(connection).not.toHaveBeenCalledWith('online');
  });

  it('requests the latest stored token before authenticating a reconnectable socket', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const tokenProvider = vi.fn().mockResolvedValue('fresh-access-token');
    const socket = new GameSocket('00000000-0000-4000-8000-000000000001', tokenProvider, 0, {
      connection: vi.fn(),
      drawOffered: vi.fn(),
      snapshot: vi.fn(),
      move: vi.fn(),
      finished: vi.fn(),
      error: vi.fn(),
    });

    socket.connect();
    const transport = FakeWebSocket.instances[0]!;
    transport.emit('open');
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
    expect(tokenProvider).toHaveBeenCalledWith(false);
    expect(JSON.parse(transport.sent[0]!).data.accessToken).toBe('fresh-access-token');
  });
});
