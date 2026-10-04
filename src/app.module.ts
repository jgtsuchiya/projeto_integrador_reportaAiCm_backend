import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { envSchema } from '@config/env.schema';
import { HealthModule } from '@modules/health/health.module';
import { DatabaseModule } from '@shared/infra/database/database.module';
import { GlobalExceptionFilter } from '@shared/presentation/filters/global-exception.filter';
import { ZodValidationPipe } from '@shared/presentation/pipes/zod-validation.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    DatabaseModule,
    HealthModule,
  ],
  providers: [
    // Registrados aqui (e não no main.ts) para valerem também nos testes e2e.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
