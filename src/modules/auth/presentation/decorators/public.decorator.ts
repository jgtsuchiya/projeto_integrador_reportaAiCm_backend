import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Libera a rota (ou o controller inteiro) sem sessão. Sem ele, o `AuthGuard` global exige
 * uma sessão válida do SuperTokens.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
