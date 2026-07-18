import { afterEach, describe, expect, it, vi } from 'vitest';

import { XadrezRealtimeClient } from './realtime.js';

class FakeSocket {
  static readonly instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  message(event: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ data, event }) } as MessageEvent);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
}

describe('XadrezRealtimeClient reconnect contract', () => {
  afterEach(() => {
    vi.useRealTimers();
    FakeSocket.instances.length = 0;
  });

  it('reauthenticates and rejoins from the last canonical version', async () => {
    vi.useFakeTimers();
    let token = 'first-access';
    const states: string[] = [];
    const client = new XadrezRealtimeClient({
      getAccessToken: () => token,
      onState: (state) => states.push(state),
      reconnectMinDelayMs: 250,
      url: 'wss://api.example/v1/ws',
      webSocketFactory: (url) => new FakeSocket(url) as unknown as WebSocket,
    });

    client.joinGame('018f47f4-7b2f-4d90-8a66-9abcdef01234');
    client.connect();
    const first = FakeSocket.instances[0]!;
    first.open();
    await Promise.resolve();
    expect(JSON.parse(first.sent[0]!)).toMatchObject({
      data: { accessToken: 'first-access', protocolVersion: 1 },
      event: 'auth.authenticate',
    });

    first.message('auth.authenticated', { protocolVersion: 1 });
    expect(JSON.parse(first.sent[1]!)).toMatchObject({
      data: { lastKnownVersion: 0 },
      event: 'game.join',
    });
    first.message('game.snapshot', {
      state: { id: '018f47f4-7b2f-4d90-8a66-9abcdef01234', version: 3 },
    });
    first.close();

    token = 'second-access';
    await vi.advanceTimersByTimeAsync(250);
    const second = FakeSocket.instances[1]!;
    second.open();
    await Promise.resolve();
    expect(JSON.parse(second.sent[0]!)).toMatchObject({
      data: { accessToken: 'second-access' },
      event: 'auth.authenticate',
    });
    second.message('auth.authenticated', { protocolVersion: 1 });
    expect(JSON.parse(second.sent[1]!)).toMatchObject({
      data: { lastKnownVersion: 3 },
      event: 'game.join',
    });
    expect(states).toContain('online');

    client.disconnect();
    await vi.runAllTimersAsync();
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
