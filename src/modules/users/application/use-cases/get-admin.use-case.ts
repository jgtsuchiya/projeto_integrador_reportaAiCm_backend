import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { AdminOutput, toAdminOutput } from '../dtos/admin.output';
import { findAdminOrFail } from '../services/find-admin';

export interface GetAdminInput {
  adminId: string;
}

/** Detalhe de um ADMIN para o SuperAdm (RN04). */
@Injectable()
export class GetAdminUseCase implements UseCase<GetAdminInput, AdminOutput> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: GetAdminInput): Promise<AdminOutput> {
    return toAdminOutput(await findAdminOrFail(this.userRepository, input.adminId));
  }
}
