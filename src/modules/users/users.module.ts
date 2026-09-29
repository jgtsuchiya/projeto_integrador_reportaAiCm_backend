import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Env } from '@config/env.schema';
import { MailModule } from '@shared/infra/mail/mail.module';

import { IdentityProvider } from './application/ports/identity-provider';
import {
  AdminInvitationConfig,
  AdminInvitationService,
} from './application/services/admin-invitation.service';
import { AcceptInvitationUseCase } from './application/use-cases/accept-invitation.use-case';
import { AuthorizeSignInUseCase } from './application/use-cases/authorize-sign-in.use-case';
import { ChangeAdminStatusUseCase } from './application/use-cases/change-admin-status.use-case';
import { ChangeClientStatusUseCase } from './application/use-cases/change-client-status.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { CheckPasswordPolicyUseCase } from './application/use-cases/check-password-policy.use-case';
import { CreateSuperAdminUseCase } from './application/use-cases/create-super-admin.use-case';
import { DeleteAdminUseCase } from './application/use-cases/delete-admin.use-case';
import { DeleteOwnAccountUseCase } from './application/use-cases/delete-own-account.use-case';
import { GetAdminUseCase } from './application/use-cases/get-admin.use-case';
import { GetAuthenticatedUserUseCase } from './application/use-cases/get-authenticated-user.use-case';
import { GetClientUseCase } from './application/use-cases/get-client.use-case';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { InviteAdminUseCase } from './application/use-cases/invite-admin.use-case';
import { ListAdminsUseCase } from './application/use-cases/list-admins.use-case';
import { ListClientsUseCase } from './application/use-cases/list-clients.use-case';
import { RegisterClientUseCase } from './application/use-cases/register-client.use-case';
import { ResendAdminInvitationUseCase } from './application/use-cases/resend-admin-invitation.use-case';
import { UpdateAdminUseCase } from './application/use-cases/update-admin.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { ClientProfileRepository } from './domain/repositories/client-profile.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { UserTokenRepository } from './domain/repositories/user-token.repository';
import { ClientProfileOrmEntity } from './infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from './infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from './infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from './infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from './infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmUserTokenRepository } from './infra/database/repositories/typeorm-user-token.repository';
import { TypeOrmUserRepository } from './infra/database/repositories/typeorm-user.repository';
import { SuperTokensIdentityProvider } from './infra/identity/supertokens-identity-provider';
import { AdminsController } from './presentation/controllers/admins.controller';
import { ClientsController } from './presentation/controllers/clients.controller';
import { InvitationsController } from './presentation/controllers/invitations.controller';
import { ProfileController } from './presentation/controllers/profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      UserOrmEntity,
      ClientProfileOrmEntity,
      UserTokenOrmEntity,
    ]),
    // Envio do convite do ADMIN.
    MailModule,
  ],
  controllers: [ClientsController, AdminsController, InvitationsController, ProfileController],
  providers: [
    CreateSuperAdminUseCase,
    RegisterClientUseCase,
    InviteAdminUseCase,
    ResendAdminInvitationUseCase,
    AcceptInvitationUseCase,
    AdminInvitationService,
    ListAdminsUseCase,
    GetAdminUseCase,
    UpdateAdminUseCase,
    ChangeAdminStatusUseCase,
    DeleteAdminUseCase,
    ListClientsUseCase,
    GetClientUseCase,
    ChangeClientStatusUseCase,
    GetProfileUseCase,
    UpdateProfileUseCase,
    ChangePasswordUseCase,
    DeleteOwnAccountUseCase,
    AuthorizeSignInUseCase,
    GetAuthenticatedUserUseCase,
    CheckPasswordPolicyUseCase,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: ClientProfileRepository, useClass: TypeOrmClientProfileRepository },
    { provide: UserTokenRepository, useClass: TypeOrmUserTokenRepository },
    { provide: IdentityProvider, useClass: SuperTokensIdentityProvider },
    {
      provide: AdminInvitationConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AdminInvitationConfig => ({
        webAppUrl: config.get('WEB_APP_URL', { infer: true }),
        expiresInHours: config.get('INVITATION_EXPIRES_IN_HOURS', { infer: true }),
      }),
    },
  ],
  exports: [
    // Usado pelo seed (src/seed.ts).
    CreateSuperAdminUseCase,
    // Usados pelo AuthModule: override do sign-in, guard de autenticação e validador de senha.
    AuthorizeSignInUseCase,
    GetAuthenticatedUserUseCase,
    CheckPasswordPolicyUseCase,
  ],
})
export class UsersModule {}
