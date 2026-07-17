import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { sendVerificationEmail } from './verification-email.service.js';

describe('sendVerificationEmail', () => {
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

  it('sends the recipient and verification link through SMTP', async () => {
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

    await sendVerificationEmail(
      new URL(`smtp://127.0.0.1:${address.port}`),
      'https://xadrez.example',
      { email: 'jogador@example.com', token: 'verification-token' },
    );

    expect(transcript).toContain('RCPT TO:<jogador@example.com>');
    expect(transcript).toContain('https://xadrez.example/entrar?verify=verification-token');
  });
});
