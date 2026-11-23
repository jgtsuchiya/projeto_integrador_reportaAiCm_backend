import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * A foto ou a miniatura não segue a RN29: não é um JPEG, passa do tamanho ou das dimensões. A
 * mensagem diz qual das duas imagens, e nunca traz o conteúdo dela (RN36).
 */
export class InvalidReportImageError extends BusinessRuleError {
  constructor(message: string, field: string) {
    super(message, { field });
  }
}
