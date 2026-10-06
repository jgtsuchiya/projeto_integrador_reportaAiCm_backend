import { User } from '../../domain/entities/user.entity';
import { UserMailService } from './user-mail.service';

export const PASSWORD_CHANGED_MAIL_SUBJECT = 'Sua senha foi alterada';

/**
 * Avisa o usuário de que a senha dele mudou, na redefinição (RN21) e na troca pelo perfil
 * (RN13). É por este e-mail que o dono da conta descobre uma troca que não foi ele quem fez.
 *
 * Devolve se o servidor de e-mail aceitou a mensagem. Uma falha no SMTP não desfaz a troca,
 * que já aconteceu: o motivo fica no log do `MailSender`.
 */
export function sendPasswordChangedNotice(
  userMailService: UserMailService,
  user: User,
): Promise<boolean> {
  return userMailService.send({
    to: user.email.value,
    subject: PASSWORD_CHANGED_MAIL_SUBJECT,
    content: {
      title: 'Sua senha foi alterada',
      paragraphs: [
        `Olá, ${user.name}!`,
        'A senha da sua conta no ReportaAi Cm acabou de ser alterada.',
        'Se foi você, não precisa fazer nada.',
      ],
      note: 'Se não foi você, redefina a senha agora mesmo pela opção "Esqueci minha senha", na tela de login.',
    },
  });
}
