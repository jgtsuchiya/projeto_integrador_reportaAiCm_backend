import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** Telefone e data de nascimento são dados só do CLIENT: ADMIN e SUPER_ADMIN não os têm. */
export class ClientOnlyFieldsError extends BusinessRuleError {
  constructor(fields: readonly string[]) {
    super('Só o cidadão tem telefone e data de nascimento.', { fields });
  }
}
