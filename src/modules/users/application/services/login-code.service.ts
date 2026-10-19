import { Injectable } from '@nestjs/common';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { UserMailService } from './user-mail.service';

/** O código não entra no assunto: o assunto vai para o log quando o envio falha. */
export const LOGIN_CODE_MAIL_SUBJECT = 'Seu código de acesso ao ReportaAi Cm';

/**
 * Configuração do código da segunda etapa, lida das variáveis de ambiente pelo UsersModule.
 * Fica numa classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class LoginCodeConfig {
  /** `MFA_CODE_EXPIRES_IN_MINUTES`. */
  abstract readonly expiresInMinutes: number;
}

/**
 * Emissão e envio do código da segunda etapa do login (RN25), comuns ao login por senha e ao
 * reenvio. O código vai só no e-mail: o banco guarda o hash dele.
 */
@Injectable()
export class LoginCodeService {
  constructor(
    private readonly userTokenRepository: UserTokenRepository,
    private readonly userMailService: UserMailService,
    private readonly config: LoginCodeConfig,
  ) {}

  /**
   * Emite um código novo, que substitui o anterior, e o envia por e-mail. Devolve false, sem
   * emitir nada, quando o código vigente saiu há menos de um minuto e ainda não foi usado:
   * ele continua valendo.
   *
   * O intervalo limita os e-mails da conta e, principalmente, as tentativas de adivinhar o
   * código: um código novo zera o contador de erros, então quem tem a senha não pode trocar
   * de código a cada 5 erros. O código já usado não entra na regra, para quem acabou de
   * entrar num aparelho conseguir entrar em outro sem esperar.
   *
   * Uma falha no SMTP não vira erro: o motivo fica no log do `MailSender`, e o usuário pede o
   * reenvio depois do intervalo.
   */
  async send(user: User): Promise<boolean> {
    const latest = await this.userTokenRepository.findLatest(user.id, UserTokenType.LOGIN_CODE);

    if (latest?.usedAt === null && latest.wasIssuedRecently()) {
      return false;
    }

    const minutes = this.config.expiresInMinutes;
    const { token, secret } = UserToken.issueCode({ userId: user.id, validForMinutes: minutes });
    await this.userTokenRepository.replace(token);
    await this.userMailService.send({
      to: user.email.value,
      subject: LOGIN_CODE_MAIL_SUBJECT,
      content: {
        title: 'Seu código de acesso',
        paragraphs: [
          `Olá, ${user.name}!`,
          'Use o código abaixo para concluir o seu login no ReportaAi Cm.',
        ],
        code: secret,
        note: `O código vale por ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e só pode ser usado uma vez. Se você não tentou entrar, alguém pode ter a sua senha: redefina-a pela opção "Esqueci minha senha", na tela de login.`,
      },
    });

    return true;
  }
}
