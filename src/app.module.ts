import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';

import { envSchema } from '@config/env.schema';
import { AuthModule } from '@modules/auth/auth.module';
import { SuperTokensExceptionFilter } from '@modules/auth/presentation/filters/supertokens-exception.filter';
import { AuthGuard } from '@modules/auth/presentation/guards/auth.guard';
import { HealthModule } from '@modules/health/health.module';
import { UsersModule } from '@modules/users/users.module';
import { DatabaseModule } from '@shared/infra/database/database.module';
import { GlobalExceptionFilter } from '@shared/presentation/filters/global-exception.filter';
import { ZodValidationPipe } from '@shared/presentation/pipes/zod-validation.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    UsersModule,
  ],
  providers: [
    // Registrados aqui (e não no main.ts) para valerem também nos testes e2e.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Os filtros globais são consultados na ordem inversa: este tem precedência sobre o anterior.
    { provide: APP_FILTER, useClass: SuperTokensExceptionFilter },
    // Toda rota exige sessão, exceto as marcadas com @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
