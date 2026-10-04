import { Entity } from '@shared/domain/entity';

import { BirthDate } from '../value-objects/birth-date';
import { Cpf } from '../value-objects/cpf';
import { Phone } from '../value-objects/phone';

export interface ClientProfileProps {
  cpf: Cpf;
  phone: Phone;
  birthDate: BirthDate;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateClientProfileInput {
  userId: string;
  cpf: Cpf;
  phone: Phone;
  birthDate: BirthDate;
}

/**
 * Dados exclusivos do CLIENT (1:1 com `User`). A identidade é o próprio id do usuário.
 * O CPF não muda depois do cadastro (RN07).
 */
export class ClientProfile extends Entity {
  private constructor(
    userId: string,
    private readonly props: ClientProfileProps,
  ) {
    super(userId);
  }

  static create(input: CreateClientProfileInput): ClientProfile {
    const now = new Date();

    return new ClientProfile(input.userId, {
      cpf: input.cpf,
      phone: input.phone,
      birthDate: input.birthDate,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói um perfil já persistido. */
  static restore(userId: string, props: ClientProfileProps): ClientProfile {
    return new ClientProfile(userId, { ...props });
  }

  get userId(): string {
    return this.id;
  }

  get cpf(): Cpf {
    return this.props.cpf;
  }

  get phone(): Phone {
    return this.props.phone;
  }

  get birthDate(): BirthDate {
    return this.props.birthDate;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  changePhone(phone: Phone): void {
    this.props.phone = phone;
    this.touch();
  }

  changeBirthDate(birthDate: BirthDate): void {
    this.props.birthDate = birthDate;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
