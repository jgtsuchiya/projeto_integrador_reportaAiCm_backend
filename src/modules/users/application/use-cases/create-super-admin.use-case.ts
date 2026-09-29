import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role, ROLES } from '../../domain/value-objects/role';
import { IdentityProvider } from '../ports/identity-provider';

export interface CreateSuperAdminInput {
  name: string;
  email: string;
  password: string;
}

export type CreateSuperAdminOutput = { created: true; userId: string } | { created: false };

/**
 * Cadastra o SUPER_ADMIN, que só é criado pelo seed (RN03). Idempotente: se já existir
 * um SUPER_ADMIN, não faz nada.
 *
 * Também cria os papéis no SuperTokens, que precisam existir antes de qualquer cadastro.
 */
@Injectable()
export class CreateSuperAdminUseCase implements UseCase<
  CreateSuperAdminInput,
  CreateSuperAdminOutput
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: CreateSuperAdminInput): Promise<CreateSuperAdminOutput> {
    const email = Email.create(input.email);
    const password = Password.create(input.password);

    await this.identityProvider.createRoles(ROLES);

    if (await this.userRepository.existsByRole(Role.SUPER_ADMIN)) {
      return { created: false };
    }

    if (await this.userRepository.existsByEmail(email)) {
      throw new EmailAlreadyInUseError();
    }

    const userId = await this.identityProvider.createCredentials(email, password);

    try {
      await this.identityProvider.assignRole(userId, Role.SUPER_ADMIN);
      await this.userRepository.save(
        User.createSuperAdmin({ id: userId, name: input.name, email }),
      );
    } catch (error) {
      // Compensação: sem o registro no MySQL, a credencial ficaria órfã no SuperTokens.
      await this.identityProvider.deleteCredentials(userId);
      throw error;
    }

    return { created: true, userId };
  }
}
