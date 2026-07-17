import { createConnection, type Socket } from 'node:net';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type VerificationEmail = { email: string; token: string };

function readReply(socket: Socket) {
  return new Promise<number>((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', finish);
    };
    const finish = (error?: Error, code?: number) => {
      cleanup();
      if (error) reject(error);
      else resolve(code ?? 0);
    };
    const timer = setTimeout(() => finish(new Error('SMTP response timeout')), 5_000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) finish(undefined, Number(last.slice(0, 3)));
    };
    socket.on('data', onData);
    socket.once('error', finish);
  });
}

async function command(socket: Socket, value: string, expected: number[]) {
  const response = readReply(socket);
  socket.write(`${value}\r\n`);
  const code = await response;
  if (!expected.includes(code)) throw new Error(`Unexpected SMTP response ${code}`);
}

export async function sendVerificationEmail(
  smtpUrl: URL,
  webOrigin: string,
  message: VerificationEmail,
) {
  if (smtpUrl.protocol !== 'smtp:') throw new Error('Only smtp:// URLs are supported');
  const email = message.email.replace(/[\r\n]/g, '');
  const verificationUrl = new URL('/entrar', webOrigin);
  verificationUrl.searchParams.set('verify', message.token);
  const socket = createConnection({ host: smtpUrl.hostname, port: Number(smtpUrl.port || 25) });
  socket.setTimeout(5_000, () => socket.destroy(new Error('SMTP connection timeout')));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  try {
    const greeting = await readReply(socket);
    if (greeting !== 220) throw new Error(`Unexpected SMTP greeting ${greeting}`);
    await command(socket, 'EHLO xadrez-essencial', [250]);
    await command(socket, 'MAIL FROM:<nao-responda@xadrez-essencial.local>', [250]);
    await command(socket, `RCPT TO:<${email}>`, [250, 251]);
    await command(socket, 'DATA', [354]);
    const body = [
      'From: Xadrez Essencial <nao-responda@xadrez-essencial.local>',
      `To: ${email}`,
      'Subject: Confirme seu cadastro no Xadrez Essencial',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Confirme seu cadastro acessando o link:',
      verificationUrl.toString(),
      '',
      'Se você não solicitou esta conta, ignore esta mensagem.',
      '.',
    ].join('\r\n');
    await command(socket, body, [250]);
    await command(socket, 'QUIT', [221]);
  } finally {
    socket.end();
  }
}

@Injectable()
export class VerificationEmailService {
  constructor(private readonly config: ConfigService) {}

  async send(message: VerificationEmail) {
    const smtpUrl = this.config.get<string>('SMTP_URL');
    if (!smtpUrl) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Serviço de verificação de e-mail indisponível');
      }
      return;
    }
    try {
      await sendVerificationEmail(
        new URL(smtpUrl),
        this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
        message,
      );
    } catch {
      throw new ServiceUnavailableException('Não foi possível enviar o e-mail de verificação');
    }
  }
}
