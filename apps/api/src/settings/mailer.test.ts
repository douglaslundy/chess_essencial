import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { sendMail } from './mailer.js';

describe('sendMail', () => {
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

  async function startFakeSmtpServer(): Promise<{ port: number; transcript: () => string }> {
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
        if (command.startsWith('EHLO')) {
          socket.write('250-mail.test\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (command.startsWith('AUTH PLAIN')) {
          socket.write('235 authenticated\r\n');
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 sender ok\r\n');
        } else if (command.startsWith('RCPT TO')) {
          socket.write('250 recipient ok\r\n');
        } else if (command === 'DATA') {
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
    return { port: address.port, transcript: () => transcript };
  }

  it('sends the message body and recipient over SMTP', async () => {
    const { port, transcript } = await startFakeSmtpServer();

    await sendMail(
      {
        fromAddress: 'nao-responda@xadrez-essencial.local',
        fromName: 'Xadrez Essencial',
        host: '127.0.0.1',
        password: null,
        port,
        secure: false,
        username: null,
      },
      {
        subject: 'Confirme seu cadastro',
        text: 'https://xadrez.example/entrar?verify=token',
        to: 'jogador@example.com',
      },
    );

    expect(transcript()).toContain('RCPT TO:<jogador@example.com>');
    expect(transcript()).toContain('https://xadrez.example/entrar?verify=token');
  });

  it('authenticates with AUTH when credentials are configured', async () => {
    const { port, transcript } = await startFakeSmtpServer();

    await sendMail(
      {
        fromAddress: 'no-reply@example.com',
        fromName: 'Xadrez Essencial',
        host: '127.0.0.1',
        password: 'super-secret',
        port,
        secure: false,
        username: 'smtp-user',
      },
      { subject: 'Teste', text: 'corpo', to: 'jogador@example.com' },
    );

    expect(transcript()).toContain('AUTH PLAIN');
  });
});
