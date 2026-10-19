import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN22: o link de verificação só é reenviado para quem ainda não verificou o e-mail. */
export class EmailAlreadyVerifiedError extends BusinessRuleError {
  constructor() {
    super('O e-mail desta conta já foi verificado.');
  }
}
