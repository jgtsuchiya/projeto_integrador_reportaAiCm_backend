import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { AdminOutput, toAdminOutput } from '../dtos/admin.output';
import { findAdminOrFail } from '../services/find-admin';

export interface UpdateAdminInput {
  adminId: string;
  name: string;
}

/** Edição do nome de um ADMIN pelo SuperAdm (RN04). O e-mail e o papel não mudam. */
@Injectable()
export class UpdateAdminUseCase implements UseCase<UpdateAdminInput, AdminOutput> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: UpdateAdminInput): Promise<AdminOutput> {
    const admin = await findAdminOrFail(this.userRepository, input.adminId);

    admin.rename(input.name);
    await this.userRepository.save(admin);

    return toAdminOutput(admin);
  }
}
