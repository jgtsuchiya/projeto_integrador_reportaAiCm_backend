import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

import type { UserStatus } from '../value-objects/user-status';

export class InvalidStatusTransitionError extends BusinessRuleError {
  constructor(from: UserStatus, to: UserStatus) {
    super(`Não é possível mudar o status do usuário de ${from} para ${to}.`, { from, to });
  }
}
