import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';
import { Page, PageRequest } from '@shared/domain/pagination';

import { UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { AdminOutput, toAdminOutput } from '../dtos/admin.output';

export interface ListAdminsInput extends PageRequest {
  status?: UserStatus;
}

/** Lista paginada dos ADMINs para o SuperAdm (RN04), sem os excluídos. */
@Injectable()
export class ListAdminsUseCase implements UseCase<ListAdminsInput, Page<AdminOutput>> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute({ status, ...page }: ListAdminsInput): Promise<Page<AdminOutput>> {
    const result = await this.userRepository.findPage({ role: Role.ADMIN, status }, page);

    return { ...result, items: result.items.map(toAdminOutput) };
  }
}
