import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '@config/env.schema';
import { MailSender } from '@shared/application/ports/mail-sender';

import { NodemailerMailSender } from './nodemailer-mail-sender';

/**
 * Envio de e-mail, compartilhado entre os módulos: quem precisa importa o MailModule e
 * injeta o `MailSender`. Nos testes que sobem a aplicação, o SMTP pode ser trocado pelo
 * `FakeMailSender` com `overrideProvider(MailSender).useValue(...)`.
 */
@Module({
  providers: [
    {
      provide: MailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new NodemailerMailSender({
          SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
          SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
          SMTP_SECURE: config.get('SMTP_SECURE', { infer: true }),
          SMTP_USER: config.get('SMTP_USER', { infer: true }),
          SMTP_PASSWORD: config.get('SMTP_PASSWORD', { infer: true }),
          MAIL_FROM: config.get('MAIL_FROM', { infer: true }),
        }),
    },
  ],
  exports: [MailSender],
})
export class MailModule {}
