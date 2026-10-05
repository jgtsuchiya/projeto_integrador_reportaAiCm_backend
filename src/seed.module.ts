import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { envSchema } from '@config/env.schema';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { DatabaseModule } from '@shared/infra/database/database.module';

/**
 * Módulo raiz do seed (`src/seed.ts`). Sobe só o necessário para cadastrar o SuperAdm:
 * a conexão com o MySQL e o SDK do SuperTokens, inicializado pelo AuthModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    DatabaseModule,
    AuthModule,
    UsersModule,
  ],
})
export class SeedModule {}
