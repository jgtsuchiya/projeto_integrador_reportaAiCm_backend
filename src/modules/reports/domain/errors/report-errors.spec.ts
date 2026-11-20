import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';
import { ConflictError } from '@shared/domain/errors/conflict.error';
import { DomainError } from '@shared/domain/errors/domain.error';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';
import { NotFoundError } from '@shared/domain/errors/not-found.error';

import { DuplicateIdempotencyKeyError } from './duplicate-idempotency-key.error';
import { EmailVerificationRequiredError } from './email-verification-required.error';
import { InaccurateLocationError } from './inaccurate-location.error';
import { InvalidLocationError } from './invalid-location.error';
import { InvalidReportDescriptionError } from './invalid-report-description.error';
import { InvalidReportImageError } from './invalid-report-image.error';
import { LocationOutsideAreaError } from './location-outside-area.error';
import { ReportAuthorOnlyError } from './report-author-only.error';
import { ReportDailyLimitError } from './report-daily-limit.error';
import { ReportHasVotesError } from './report-has-votes.error';
import { ReportNotDeletableError } from './report-not-deletable.error';
import { ReportNotEditableError } from './report-not-editable.error';
import { ReportNotFoundError } from './report-not-found.error';

// A categoria define o status HTTP no GlobalExceptionFilter (404/409/422/403).
describe('Erros do domínio de reportes', () => {
  it.each<[DomainError, abstract new (...args: never[]) => DomainError, unknown]>([
    [new ReportNotFoundError(), NotFoundError, undefined],
    [new ReportAuthorOnlyError(), ForbiddenError, undefined],
    [new DuplicateIdempotencyKeyError(), ConflictError, { field: 'Idempotency-Key' }],
    [new ReportNotEditableError(), BusinessRuleError, undefined],
    [new ReportHasVotesError(), BusinessRuleError, undefined],
    [new ReportNotDeletableError(), BusinessRuleError, undefined],
    [new LocationOutsideAreaError(), BusinessRuleError, undefined],
    [new InaccurateLocationError(), BusinessRuleError, undefined],
    [new ReportDailyLimitError(10), BusinessRuleError, { limit: 10 }],
    [new EmailVerificationRequiredError(), BusinessRuleError, undefined],
    [new InvalidLocationError('latitude', 'mensagem'), BusinessRuleError, { field: 'latitude' }],
    [new InvalidReportDescriptionError(500), BusinessRuleError, { field: 'description' }],
    [
      new InvalidReportImageError('mensagem', 'photo.content'),
      BusinessRuleError,
      {
        field: 'photo.content',
      },
    ],
  ])('%p deve ser da categoria certa e ter os detalhes esperados', (error, category, details) => {
    expect(error).toBeInstanceOf(category);
    expect(error.message).not.toHaveLength(0);
    expect(error.details).toEqual(details);
  });

  it.each([
    [new EmailVerificationRequiredError(), 'Confirme o seu e-mail para abrir reportes.'],
    [new LocationOutsideAreaError(), 'Este lugar fica fora de Campo Mourão.'],
    [
      new InaccurateLocationError(),
      'A localização está imprecisa. Tente de novo num lugar aberto.',
    ],
    [new ReportDailyLimitError(10), 'Você chegou ao limite de 10 reportes por dia.'],
    [new ReportHasVotesError(), 'O reporte já recebeu votos e não pode mais ser editado.'],
    [new ReportNotEditableError(), 'Só é possível editar um reporte em validação.'],
    [new ReportNotDeletableError(), 'Só é possível excluir um reporte em validação.'],
  ])('%p deve ter a mensagem do plano', (error, message) => {
    expect(error.message).toBe(message);
  });
});
