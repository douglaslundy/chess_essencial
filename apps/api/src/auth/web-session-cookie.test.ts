import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './web-session-cookie.js';

describe('web refresh cookie', () => {
  it('uses a Secure __Host cookie in production', () => {
    const header = vi.fn();
    const config = new ConfigService({
      AUTH_REFRESH_TTL_SECONDS: 3_600,
      NODE_ENV: 'production',
    });

    setRefreshCookie({ header } as never, 'opaque-token', config);

    expect(header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining(
        '__Host-xadrez_refresh=opaque-token; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax; Secure',
      ),
    );
  });

  it('reads and expires the development cookie without exposing it to scripts', () => {
    const config = new ConfigService({ NODE_ENV: 'test' });
    expect(
      readRefreshCookie(
        { headers: { cookie: 'other=1; xadrez_refresh=rotating%2Dtoken' } } as never,
        config,
      ),
    ).toBe('rotating-token');

    const header = vi.fn();
    clearRefreshCookie({ header } as never, config);
    expect(header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('xadrez_refresh=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
    );
  });

  it('drops Secure and the __Host- prefix when the web origin is plain HTTP', () => {
    const header = vi.fn();
    const config = new ConfigService({
      AUTH_REFRESH_TTL_SECONDS: 3_600,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'http://192.168.0.233:3100',
    });

    setRefreshCookie({ header } as never, 'opaque-token', config);

    const cookie = header.mock.calls[0]![1] as string;
    expect(cookie).toContain('xadrez_refresh=opaque-token');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('__Host-');
  });
});
