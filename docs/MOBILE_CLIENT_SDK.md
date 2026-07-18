# Mobile client SDK

The workspace package `@xadrez/sdk` is the transport boundary for web-independent clients.
It contains committed REST types generated from `api/openapi.yaml`, a small fetch client and a
WebSocket client that follows protocol version 1. It has no Next.js or database dependency.

## Reproduce the REST contract

From the repository root:

```bash
pnpm sdk:generate
pnpm --filter @xadrez/sdk generate:check
pnpm --filter @xadrez/sdk typecheck
pnpm --filter @xadrez/sdk test
```

The generated file is `packages/sdk/src/generated/openapi.ts`. CI fails when it differs from
the current OpenAPI source.

## Client setup

```ts
import { XadrezApiClient, XadrezRealtimeClient } from '@xadrez/sdk';

const api = new XadrezApiClient({
  baseUrl: 'https://api.example.com/v1',
});

const login = await api.login({
  identifier: 'player@example.com',
  password: 'a strong account password',
});
api.setAccessToken(login.tokens.accessToken);
```

Mobile applications must keep refresh tokens in platform secure storage (Keychain/Keystore),
not AsyncStorage, logs, URLs or analytics. Access tokens may stay in memory.

## Session lifecycle

1. `POST /auth/login` returns the user and an access/refresh pair.
2. Before access expiry, or after one HTTP 401, call `POST /auth/refresh` exactly once.
3. Persist the returned refresh token before allowing another refresh. Rotation invalidates the
   previous token; reuse revokes the session.
4. Update `XadrezApiClient.setAccessToken()` with the new access token.
5. On sign-out, call `POST /auth/logout`, remove both tokens and disconnect realtime.
6. Never retry a failed refresh in a loop. Return to login after a refresh 401.

## Password recovery

Call `api.forgotPassword({ email })`. The endpoint always returns 204 so an attacker cannot
enumerate accounts. The email link contains a `reset` query parameter; the app may claim it
through an HTTPS universal/app link and then call:

```ts
await api.resetPassword({
  token: resetToken,
  newPassword: 'a new strong account password',
});
```

The token expires after 30 minutes by default, is bound to the current password hash and can
be used only once. A successful reset revokes all active refresh sessions.

## Realtime authentication and reconnect

```ts
const realtime = new XadrezRealtimeClient({
  url: 'wss://api.example.com/v1/ws',
  getAccessToken: async () => currentAccessToken(),
  onState: (state) => renderConnectionState(state),
  onEvent: (message) => applyServerEvent(message),
});

realtime.joinGame(gameId, lastPersistedServerVersion);
realtime.connect();
```

Every socket connection obtains a current access token, sends `auth.authenticate`, waits for
`auth.authenticated`, and then rejoins each game with its last canonical server version.
Snapshots and committed moves advance that version. Reconnect uses bounded exponential
backoff from 250 ms to 10 seconds. The server remains authoritative for moves, clocks,
results and versions.

The client must not send tokens in the WebSocket URL. Close code 4401 means authentication
must be refreshed or the user must log in again; 4429 means command rate limiting. Code 1013
is transient capacity pressure and may reconnect with backoff.
