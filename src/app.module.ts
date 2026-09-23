import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { envSchema } from '@config/env.schema';
import { HealthModule } from '@modules/health/health.module';
import { DatabaseModule } from '@shared/infra/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
