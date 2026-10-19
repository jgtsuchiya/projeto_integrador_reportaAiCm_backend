import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { IssuedUserToken } from '../../domain/entities/user-token.entity';
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
import { EmailVerificationService } from '../services/email-verification.service';

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

/** Dados do cadastro, já validados pelos value objects. */
interface ClientData {
  name: string;
  email: Email;
  password: Password;
  cpf: Cpf;
  phone: Phone;
  birthDate: BirthDate;
}

/**
 * Autocadastro do CLIENT pelo app (RN05). Substitui o sign-up nativo do SuperTokens, que
 * fica desativado. O CLIENT já nasce ACTIVE, e o app faz o login em seguida pelo SDK.
 *
 * Ele nasce com o e-mail não verificado e recebe o link de verificação (RN22). O login não
 * depende dela, e uma falha no envio do e-mail não desfaz o cadastro: o link pode ser reenviado.
 *
 * A credencial é criada no SuperTokens antes da gravação no MySQL, porque o id gerado por ele
 * é o `users.id`. Se a gravação falhar, a credencial é removida (compensação).
 */
@Injectable()
export class RegisterClientUseCase implements UseCase<RegisterClientInput, RegisterClientOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
    private readonly identityProvider: IdentityProvider,
    private readonly emailVerificationService: EmailVerificationService,
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

    const { user, profile, verification } = await this.createClient({
      name: input.name,
      email,
      password,
      cpf,
      phone,
      birthDate,
    });
    await this.emailVerificationService.send(user, verification);

    return toOutput(user, profile);
  }

  private async createClient({
    name,
    email,
    password,
    ...profileData
  }: ClientData): Promise<{ user: User; profile: ClientProfile; verification: IssuedUserToken }> {
    const userId = await this.identityProvider.createCredentials(email, password);

    try {
      await this.identityProvider.assignRole(userId, Role.CLIENT);

      const user = User.createClient({ id: userId, name, email });
      const profile = ClientProfile.create({ userId, ...profileData });
      const verification = this.emailVerificationService.issue(userId);
      await this.userRepository.saveClient(user, profile, verification.token);

      return { user, profile, verification };
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
