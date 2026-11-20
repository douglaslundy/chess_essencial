import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { sendMail } from '../settings/mailer.js';
import { SettingsService } from '../settings/settings.service.js';

type VerificationEmail = { email: string; token: string };

@Injectable()
export class VerificationEmailService {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async sendPasswordReset(message: VerificationEmail) {
    await this.send(message, 'reset');
  }

  async send(message: VerificationEmail, mode: 'verify' | 'reset' = 'verify') {
    const smtp = await this.settings.resolveActiveSmtpConfig();
    if (!smtp) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Serviço de verificação de e-mail indisponível');
      }
      return;
    }

    const email = message.email.replace(/[\r\n]/g, '');
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
    const actionUrl = new URL(`${this.config.get<string>('WEB_BASE_PATH', '')}/entrar`, webOrigin);
    actionUrl.searchParams.set(mode === 'verify' ? 'verify' : 'reset', message.token);
    const subject =
      mode === 'verify'
        ? 'Confirme seu cadastro no Xadrez Essencial'
        : 'Redefina sua senha no Xadrez Essencial';
    const intro =
      mode === 'verify'
        ? 'Confirme seu cadastro acessando o link:'
        : 'Redefina sua senha acessando o link:';

    try {
      await sendMail(smtp, {
        subject,
        text: [
          intro,
          actionUrl.toString(),
          '',
          'Se você não solicitou esta conta, ignore esta mensagem.',
        ].join('\n'),
        to: email,
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível enviar o e-mail de verificação');
    }
  }
}
