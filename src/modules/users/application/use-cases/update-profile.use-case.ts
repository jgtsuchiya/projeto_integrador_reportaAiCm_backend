import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientOnlyFieldsError } from '../../domain/errors/client-only-fields.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Phone } from '../../domain/value-objects/phone';
import { ProfileOutput, toProfileOutput } from '../dtos/profile.output';
import { findAccountOrFail } from '../services/find-account';

/** Campos ausentes não mudam. */
export interface UpdateProfileInput {
  /** Usuário da sessão. */
  userId: string;
  name?: string;
  /** Só do CLIENT. Com ou sem máscara (`(43) 99999-8888` ou `43999998888`). */
  phone?: string;
  /** Só do CLIENT. `YYYY-MM-DD`. */
  birthDate?: string;
}

/**
 * Edição do próprio perfil: todos editam o nome, e o CLIENT também o telefone e a data de
 * nascimento. E-mail, CPF e papel não mudam (RN01, RN07). Telefone ou data de nascimento
 * enviados por ADMIN ou SUPER_ADMIN geram `ClientOnlyFieldsError` (422).
 */
@Injectable()
export class UpdateProfileUseCase implements UseCase<UpdateProfileInput, ProfileOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
  ) {}

  async execute(input: UpdateProfileInput): Promise<ProfileOutput> {
    const { user, profile } = await findAccountOrFail(
      this.userRepository,
      this.clientProfileRepository,
      input.userId,
    );

    const clientFields = (['phone', 'birthDate'] as const).filter(
      (field) => input[field] !== undefined,
    );
    if (!profile && clientFields.length > 0) {
      throw new ClientOnlyFieldsError(clientFields);
    }

    // Os value objects são criados antes de qualquer alteração, para um valor inválido não
    // deixar a edição pela metade.
    const phone = input.phone === undefined ? undefined : Phone.create(input.phone);
    const birthDate = input.birthDate === undefined ? undefined : BirthDate.create(input.birthDate);

    if (input.name !== undefined) {
      user.rename(input.name);
    }

    if (!profile) {
      await this.userRepository.save(user);

      return toProfileOutput(user, null);
    }

    if (phone) {
      profile.changePhone(phone);
    }
    if (birthDate) {
      profile.changeBirthDate(birthDate);
    }
    await this.userRepository.updateClient(user, profile);

    return toProfileOutput(user, profile);
  }
}
