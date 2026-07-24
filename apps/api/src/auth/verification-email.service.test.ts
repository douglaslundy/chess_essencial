import { createServer, type Server } from 'node:net';

import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';

import type { SettingsService } from '../settings/settings.service.js';
import { VerificationEmailService } from './verification-email.service.js';

function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as ConfigService;
}

describe('VerificationEmailService', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  it('silently does nothing outside production when no SMTP is configured', async () => {
    const settings = { resolveActiveSmtpConfig: () => Promise.resolve(null) } as SettingsService;
    const service = new VerificationEmailService(fakeConfig({ NODE_ENV: 'development' }), settings);
    await expect(
      service.send({ email: 'jogador@example.com', token: 'token' }),
    ).resolves.toBeUndefined();
  });

  it('fails loudly in production when no SMTP is configured', async () => {
    const settings = { resolveActiveSmtpConfig: () => Promise.resolve(null) } as SettingsService;
    const service = new VerificationEmailService(fakeConfig({ NODE_ENV: 'production' }), settings);
    await expect(service.send({ email: 'jogador@example.com', token: 'token' })).rejects.toThrow(
      'Serviço de verificação de e-mail indisponível',
    );
  });

  it('sends the verification link when SMTP is configured', async () => {
    let transcript = '';
    const server = createServer((socket) => {
      let dataMode = false;
      socket.write('220 mail.test ESMTP\r\n');
      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        transcript += text;
        if (dataMode) {
          if (text.endsWith('.\r\n')) {
            dataMode = false;
            socket.write('250 queued\r\n');
          }
          return;
        }
        const command = text.trim();
        if (command.startsWith('EHLO')) socket.write('250 mail.test\r\n');
        else if (command.startsWith('MAIL FROM')) socket.write('250 sender ok\r\n');
        else if (command.startsWith('RCPT TO')) socket.write('250 recipient ok\r\n');
        else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 end with dot\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SMTP port was not assigned');

    const settings = {
      resolveActiveSmtpConfig: () =>
        Promise.resolve({
          fromAddress: 'nao-responda@xadrez-essencial.local',
          fromName: 'Xadrez Essencial',
          host: '127.0.0.1',
          password: null,
          port: address.port,
          secure: false,
          username: null,
        }),
    } as SettingsService;
    const service = new VerificationEmailService(
      fakeConfig({ NODE_ENV: 'development', WEB_ORIGIN: 'https://xadrez.example' }),
      settings,
    );

    await service.send({ email: 'jogador@example.com', token: 'verification-token' });

    // The body is quoted-printable encoded (soft line-wraps, "=" -> "=3D"),
    // so check for the unescaped token plus the host rather than the exact
    // URL string.
    expect(transcript).toContain('RCPT TO:<jogador@example.com>');
    expect(transcript).toContain('xadrez.example');
    expect(transcript).toContain('verification-token');
  });
});
