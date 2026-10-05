import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { CpfAlreadyInUseError } from '../../domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { IdentityProvider } from '../ports/identity-provider';

export interface RegisterClientInput {
  name: string;
  email: string;
  password: string;
  /** Com ou sem máscara (`123.456.789-09` ou `12345678909`). */
  cpf: string;
  /** Com ou sem máscara (`(43) 99999-8888` ou `43999998888`). */
  phone: string;
  /** `YYYY-MM-DD`. */
  birthDate: string;
}

/** Perfil do CLIENT recém-cadastrado. Nunca inclui a senha. */
export interface RegisterClientOutput {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: UserStatus;
  /** Só dígitos. */
  cpf: string;
  /** Só dígitos. */
  phone: string;
  birthDate: string;
  createdAt: Date;
}

/**
 * Autocadastro do CLIENT pelo app (RN05). Substitui o sign-up nativo do SuperTokens, que
 * fica desativado. O CLIENT já nasce ACTIVE, e o app faz o login em seguida pelo SDK.
 *
 * A credencial é criada no SuperTokens antes da gravação no MySQL, porque o id gerado por ele
 * é o `users.id`. Se algo falhar depois disso, a credencial é removida (compensação).
 */
@Injectable()
export class RegisterClientUseCase implements UseCase<RegisterClientInput, RegisterClientOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: RegisterClientInput): Promise<RegisterClientOutput> {
    const email = Email.create(input.email);
    const password = Password.create(input.password);
    const cpf = Cpf.create(input.cpf);
    const phone = Phone.create(input.phone);
    const birthDate = BirthDate.create(input.birthDate);

    if (await this.userRepository.existsByEmail(email)) {
      throw new EmailAlreadyInUseError();
    }

    if (await this.clientProfileRepository.existsByCpf(cpf)) {
      throw new CpfAlreadyInUseError();
    }

    const userId = await this.identityProvider.createCredentials(email, password);

    try {
      await this.identityProvider.assignRole(userId, Role.CLIENT);

      const user = User.createClient({ id: userId, name: input.name, email });
      const profile = ClientProfile.create({ userId, cpf, phone, birthDate });
      await this.userRepository.saveClient(user, profile);

      return toOutput(user, profile);
    } catch (error) {
      // Compensação: sem o registro no MySQL, a credencial ficaria órfã no SuperTokens.
      await this.identityProvider.deleteCredentials(userId);
      throw error;
    }
  }
}

function toOutput(user: User, profile: ClientProfile): RegisterClientOutput {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email.value,
    status: user.status,
    cpf: profile.cpf.value,
    phone: profile.phone.value,
    birthDate: profile.birthDate.value,
    createdAt: user.createdAt,
  };
}
