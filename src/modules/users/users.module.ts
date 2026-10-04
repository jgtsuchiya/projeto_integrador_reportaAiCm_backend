import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityProvider } from './application/ports/identity-provider';
import { CreateSuperAdminUseCase } from './application/use-cases/create-super-admin.use-case';
import { ClientProfileRepository } from './domain/repositories/client-profile.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { ClientProfileOrmEntity } from './infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from './infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from './infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from './infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from './infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmUserRepository } from './infra/database/repositories/typeorm-user.repository';
import { SuperTokensIdentityProvider } from './infra/identity/supertokens-identity-provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      UserOrmEntity,
      ClientProfileOrmEntity,
      UserTokenOrmEntity,
    ]),
  ],
  providers: [
    CreateSuperAdminUseCase,
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: ClientProfileRepository, useClass: TypeOrmClientProfileRepository },
    { provide: IdentityProvider, useClass: SuperTokensIdentityProvider },
  ],
  // Usado pelo seed (src/seed.ts).
  exports: [CreateSuperAdminUseCase],
})
export class UsersModule {}
