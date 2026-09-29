import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';

import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';

import type { ProfileOutput } from '../../application/dtos/profile.output';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { DeleteOwnAccountUseCase } from '../../application/use-cases/delete-own-account.use-case';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import { GetProfileUseCase } from '../../application/use-cases/get-profile.use-case';
import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { Role } from '../../domain/value-objects/role';
import {
  type ChangePasswordBody,
  changePasswordBodySchema,
  type DeleteOwnAccountBody,
  deleteOwnAccountBodySchema,
  type UpdateProfileBody,
  updateProfileBodySchema,
} from '../dtos/profile.dto';

/** Perfil do usuário logado, de qualquer papel. O alvo é sempre o usuário da sessão. */
@Controller('users/me')
export class ProfileController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly deleteOwnAccountUseCase: DeleteOwnAccountUseCase,
  ) {}

  /** Perfil e papel. É por aqui que os fronts descobrem o papel depois do login. */
  @Get()
  findMe(@CurrentUser() user: AuthenticatedUser): Promise<ProfileOutput> {
    return this.getProfileUseCase.execute({ userId: user.id });
  }

  /** Nome (todos), telefone e data de nascimento (só o CLIENT). */
  @Patch()
  update(
    @Body({ schema: updateProfileBodySchema }) body: UpdateProfileBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileOutput> {
    return this.updateProfileUseCase.execute({ userId: user.id, ...body });
  }

  /** Troca a senha e revoga as outras sessões, mantendo a atual (RN13). */
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @Body({ schema: changePasswordBodySchema }) body: ChangePasswordBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.changePasswordUseCase.execute({
      userId: user.id,
      sessionHandle: user.sessionHandle,
      ...body,
    });
  }

  /** Autoexclusão com anonimização, só para o CLIENT (RN11, RN15). */
  @Roles(Role.CLIENT)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Body({ schema: deleteOwnAccountBodySchema }) body: DeleteOwnAccountBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.deleteOwnAccountUseCase.execute({ userId: user.id, ...body });
  }
}
