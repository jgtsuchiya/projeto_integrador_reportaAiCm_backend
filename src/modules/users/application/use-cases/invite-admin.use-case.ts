import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { IssuedUserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { IdentityProvider } from '../ports/identity-provider';
import { AdminInvitationService, InvitationOutput } from '../services/admin-invitation.service';

export interface InviteAdminInput {
  name: string;
  email: string;
  /** SuperAdm que fez o convite, gravado em `created_by_id`. */
  invitedById: string;
}

/** ADMIN recém-convidado e a situação do convite. */
export interface InviteAdminOutput {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: UserStatus;
  createdById: string | null;
  createdAt: Date;
  invitation: InvitationOutput;
}

/**
 * Convite de ADMIN pelo SuperAdm (RN04, RN06). O ADMIN nasce PENDING, com uma senha aleatória
 * e descartada no SuperTokens, e recebe por e-mail o link para definir a própria senha.
 *
 * A credencial é criada antes da gravação no MySQL, porque o id gerado pelo SuperTokens é o
 * `users.id`. Se a gravação falhar, a credencial é removida (compensação). Já uma falha no
 * envio do e-mail não desfaz o convite, que pode ser reenviado.
 */
@Injectable()
export class InviteAdminUseCase implements UseCase<InviteAdminInput, InviteAdminOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityProvider: IdentityProvider,
    private readonly invitationService: AdminInvitationService,
  ) {}

  async execute(input: InviteAdminInput): Promise<InviteAdminOutput> {
    const email = Email.create(input.email);

    if (await this.userRepository.existsByEmail(email)) {
      throw new EmailAlreadyInUseError();
    }

    const { admin, invitation } = await this.createPendingAdmin(input, email);
    const sent = await this.invitationService.send(admin, invitation);

    return toOutput(admin, sent);
  }

  private async createPendingAdmin(
    input: InviteAdminInput,
    email: Email,
  ): Promise<{ admin: User; invitation: IssuedUserToken }> {
    // Ninguém conhece esta senha: o ADMIN define a dele ao aceitar o convite.
    const userId = await this.identityProvider.createCredentials(email, Password.random());

    try {
      await this.identityProvider.assignRole(userId, Role.ADMIN);

      const admin = User.createAdmin({
        id: userId,
        name: input.name,
        email,
        createdById: input.invitedById,
      });
      const invitation = this.invitationService.issue(userId);
      await this.userRepository.saveWithToken(admin, invitation.token);

      return { admin, invitation };
    } catch (error) {
      // Compensação: sem o registro no MySQL, a credencial ficaria órfã no SuperTokens.
      await this.identityProvider.deleteCredentials(userId);
      throw error;
    }
  }
}

function toOutput(admin: User, invitation: InvitationOutput): InviteAdminOutput {
  return {
    id: admin.id,
    role: admin.role,
    name: admin.name,
    email: admin.email.value,
    status: admin.status,
    createdById: admin.createdById,
    createdAt: admin.createdAt,
    invitation,
  };
}
