import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClientProfileOrmEntity } from './infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from './infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from './infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from './infra/database/entities/user.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleOrmEntity,
      UserOrmEntity,
      ClientProfileOrmEntity,
      UserTokenOrmEntity,
    ]),
  ],
})
export class UsersModule {}
