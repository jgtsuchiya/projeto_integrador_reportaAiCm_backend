import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityProvider } from './application/ports/identity-provider';
import { AuthorizeSignInUseCase } from './application/use-cases/authorize-sign-in.use-case';
import { CheckPasswordPolicyUseCase } from './application/use-cases/check-password-policy.use-case';
import { CreateSuperAdminUseCase } from './application/use-cases/create-super-admin.use-case';
import { GetAuthenticatedUserUseCase } from './application/use-cases/get-authenticated-user.use-case';
import { RegisterClientUseCase } from './application/use-cases/register-client.use-case';
import { ClientProfileRepository } from './domain/repositories/client-profile.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { ClientProfileOrmEntity } from './infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from './infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from './infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from './infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from './infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmUserRepository } from './infra/database/repositories/typeorm-user.repository';
import { SuperTokensIdentityProvider } from './infra/identity/supertokens-identity-provider';
import { ClientsController } from './presentation/controllers/clients.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      UserOrmEntity,
      ClientProfileOrmEntity,
      UserTokenOrmEntity,
    ]),
  ],
  controllers: [ClientsController],
  providers: [
    CreateSuperAdminUseCase,
    RegisterClientUseCase,
    AuthorizeSignInUseCase,
    GetAuthenticatedUserUseCase,
    CheckPasswordPolicyUseCase,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: ClientProfileRepository, useClass: TypeOrmClientProfileRepository },
    { provide: IdentityProvider, useClass: SuperTokensIdentityProvider },
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
