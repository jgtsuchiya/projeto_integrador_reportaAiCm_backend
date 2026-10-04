import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';
import { DomainError } from '@shared/domain/errors/domain.error';
import { Page, PageRequest } from '@shared/domain/pagination';

import { ClientFilter, UserRepository } from '../../domain/repositories/user.repository';
import { Cpf } from '../../domain/value-objects/cpf';
import { UserStatus } from '../../domain/value-objects/user-status';
import { ClientOutput, toClientOutput } from '../dtos/client.output';

export interface ListClientsInput extends PageRequest {
  status?: UserStatus;
  /** Trecho do nome ou do e-mail, ou um CPF completo (com ou sem máscara). */
  search?: string;
}

/**
 * Lista paginada dos CLIENTs para ADMIN e SUPER_ADMIN (RN12), sem os excluídos.
 *
 * Uma busca que é um CPF válido procura só pelo CPF, e pelo valor exato: como o CPF aparece
 * mascarado, uma busca por trecho permitiria descobrir os dígitos escondidos. Qualquer outra
 * busca procura o trecho no nome ou no e-mail.
 */
@Injectable()
export class ListClientsUseCase implements UseCase<ListClientsInput, Page<ClientOutput>> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute({ status, search, ...page }: ListClientsInput): Promise<Page<ClientOutput>> {
    const result = await this.userRepository.findClientPage(toFilter(status, search), page);

    return {
      ...result,
      items: result.items.map(({ user, profile }) => toClientOutput(user, profile)),
    };
  }
}

function toFilter(status: UserStatus | undefined, search: string | undefined): ClientFilter {
  if (!search) {
    return { status };
  }

  const cpf = parseCpf(search);

  return cpf ? { status, cpf } : { status, text: search };
}

function parseCpf(search: string): Cpf | null {
  try {
    return Cpf.create(search);
  } catch (error) {
    if (error instanceof DomainError) {
      return null;
    }

    throw error;
  }
}
