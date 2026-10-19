import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Env } from '@config/env.schema';
import { BackgroundTasksModule } from '@shared/infra/background/background-tasks.module';
import { MailModule } from '@shared/infra/mail/mail.module';

import { IdentityProvider } from './application/ports/identity-provider';
import {
  AdminInvitationConfig,
  AdminInvitationService,
} from './application/services/admin-invitation.service';
import {
  EmailVerificationConfig,
  EmailVerificationService,
} from './application/services/email-verification.service';
import { LoginLockConfig, LoginLockService } from './application/services/login-lock.service';
import {
  PasswordResetConfig,
  PasswordResetService,
} from './application/services/password-reset.service';
import { UserMailConfig, UserMailService } from './application/services/user-mail.service';
import { AcceptInvitationUseCase } from './application/use-cases/accept-invitation.use-case';
import { AuthorizeSignInUseCase } from './application/use-cases/authorize-sign-in.use-case';
import { ChangeAdminStatusUseCase } from './application/use-cases/change-admin-status.use-case';
import { ChangeClientStatusUseCase } from './application/use-cases/change-client-status.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { CheckLoginLockUseCase } from './application/use-cases/check-login-lock.use-case';
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
import { ListSessionsUseCase } from './application/use-cases/list-sessions.use-case';
import { PurgeLoginAttemptsUseCase } from './application/use-cases/purge-login-attempts.use-case';
import { RecordLoginAttemptUseCase } from './application/use-cases/record-login-attempt.use-case';
import { RegisterClientUseCase } from './application/use-cases/register-client.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResendAdminInvitationUseCase } from './application/use-cases/resend-admin-invitation.use-case';
import { ResendEmailVerificationUseCase } from './application/use-cases/resend-email-verification.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { RevokeOtherSessionsUseCase } from './application/use-cases/revoke-other-sessions.use-case';
import { RevokeSessionUseCase } from './application/use-cases/revoke-session.use-case';
import { UpdateAdminUseCase } from './application/use-cases/update-admin.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { ClientProfileRepository } from './domain/repositories/client-profile.repository';
import { LoginAttemptRepository } from './domain/repositories/login-attempt.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { UserTokenRepository } from './domain/repositories/user-token.repository';
import { ClientProfileOrmEntity } from './infra/database/entities/client-profile.orm-entity';
import { LoginAttemptOrmEntity } from './infra/database/entities/login-attempt.orm-entity';
import { RoleOrmEntity } from './infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from './infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from './infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from './infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmLoginAttemptRepository } from './infra/database/repositories/typeorm-login-attempt.repository';
import { TypeOrmUserTokenRepository } from './infra/database/repositories/typeorm-user-token.repository';
import { TypeOrmUserRepository } from './infra/database/repositories/typeorm-user.repository';
import { SuperTokensIdentityProvider } from './infra/identity/supertokens-identity-provider';
import { LoginAttemptRetentionScheduler } from './infra/scheduling/login-attempt-retention.scheduler';
import { AdminsController } from './presentation/controllers/admins.controller';
import { ClientsController } from './presentation/controllers/clients.controller';
import { EmailVerificationsController } from './presentation/controllers/email-verifications.controller';
import { InvitationsController } from './presentation/controllers/invitations.controller';
import { PasswordResetsController } from './presentation/controllers/password-resets.controller';
import { ProfileController } from './presentation/controllers/profile.controller';
import { SessionsController } from './presentation/controllers/sessions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      UserOrmEntity,
      ClientProfileOrmEntity,
      UserTokenOrmEntity,
      LoginAttemptOrmEntity,
    ]),
    // E-mails da conta: convite do ADMIN, redefinição de senha, aviso de troca de senha e
    // verificação de e-mail.
    MailModule,
    // O pedido de redefinição de senha responde antes de buscar a conta e enviar o e-mail.
    BackgroundTasksModule,
  ],
  controllers: [
    ClientsController,
    AdminsController,
    InvitationsController,
    PasswordResetsController,
    EmailVerificationsController,
    ProfileController,
    SessionsController,
  ],
  providers: [
    CreateSuperAdminUseCase,
    RegisterClientUseCase,
    InviteAdminUseCase,
    ResendAdminInvitationUseCase,
    AcceptInvitationUseCase,
    AdminInvitationService,
    UserMailService,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    PasswordResetService,
    VerifyEmailUseCase,
    ResendEmailVerificationUseCase,
    EmailVerificationService,
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
    ListSessionsUseCase,
    RevokeSessionUseCase,
    RevokeOtherSessionsUseCase,
    AuthorizeSignInUseCase,
    GetAuthenticatedUserUseCase,
    CheckPasswordPolicyUseCase,
    LoginLockService,
    CheckLoginLockUseCase,
    RecordLoginAttemptUseCase,
    PurgeLoginAttemptsUseCase,
    LoginAttemptRetentionScheduler,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: ClientProfileRepository, useClass: TypeOrmClientProfileRepository },
    { provide: UserTokenRepository, useClass: TypeOrmUserTokenRepository },
    { provide: LoginAttemptRepository, useClass: TypeOrmLoginAttemptRepository },
    { provide: IdentityProvider, useClass: SuperTokensIdentityProvider },
    {
      provide: UserMailConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): UserMailConfig => ({
        webAppUrl: config.get('WEB_APP_URL', { infer: true }),
      }),
    },
    {
      provide: AdminInvitationConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AdminInvitationConfig => ({
        expiresInHours: config.get('INVITATION_EXPIRES_IN_HOURS', { infer: true }),
      }),
    },
    {
      provide: PasswordResetConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PasswordResetConfig => ({
        expiresInMinutes: config.get('PASSWORD_RESET_EXPIRES_IN_MINUTES', { infer: true }),
      }),
    },
    {
      provide: EmailVerificationConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailVerificationConfig => ({
        expiresInHours: config.get('EMAIL_VERIFICATION_EXPIRES_IN_HOURS', { infer: true }),
      }),
    },
    {
      provide: LoginLockConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LoginLockConfig => ({
        maxFailedAttempts: config.get('LOGIN_MAX_FAILED_ATTEMPTS', { infer: true }),
        windowMinutes: config.get('LOGIN_LOCK_WINDOW_MINUTES', { infer: true }),
      }),
    },
  ],
  exports: [
    // Usado pelo seed (src/seed.ts).
    CreateSuperAdminUseCase,
    // Usados pelo AuthModule: overrides do sign-in, guard de autenticação e validador de senha.
    AuthorizeSignInUseCase,
    CheckLoginLockUseCase,
    RecordLoginAttemptUseCase,
    GetAuthenticatedUserUseCase,
    CheckPasswordPolicyUseCase,
  ],
})
export class UsersModule {}
