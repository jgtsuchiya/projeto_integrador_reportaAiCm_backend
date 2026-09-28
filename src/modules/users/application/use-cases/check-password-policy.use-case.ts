import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { Password } from '../../domain/value-objects/password';

/**
 * Confere se uma senha segue a política da RN08, para quem valida fora do domínio (o
 * validador do campo `password` no SuperTokens). Retorna a mensagem da violação, ou null
 * quando a senha é válida.
 */
@Injectable()
export class CheckPasswordPolicyUseCase implements UseCase<string, string | null> {
  async execute(password: string): Promise<string | null> {
    try {
      Password.create(password);

      return null;
    } catch (error) {
      if (error instanceof InvalidPasswordError) {
        return error.message;
      }

      throw error;
    }
  }
}
