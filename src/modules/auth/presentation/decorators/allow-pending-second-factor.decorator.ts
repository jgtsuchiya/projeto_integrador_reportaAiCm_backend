import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_SECOND_FACTOR_KEY = 'auth:allowPendingSecondFactor';

/**
 * Libera a rota (ou o controller inteiro) para a sessão pendente: a de quem tem a verificação
 * em duas etapas ativa, já passou pela senha e ainda não conferiu o código (RN25). Sem ele, o
 * `AuthGuard` responde 403 a essa sessão. É só para as rotas da segunda etapa.
 */
export const AllowPendingSecondFactor = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_SECOND_FACTOR_KEY, true);
