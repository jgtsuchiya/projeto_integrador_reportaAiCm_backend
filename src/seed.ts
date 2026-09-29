import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';

import { seedEnvSchema } from '@config/seed-env.schema';
import { CreateSuperAdminUseCase } from '@modules/users/application/use-cases/create-super-admin.use-case';

import { SeedModule } from './seed.module';

const logger = new Logger('Seed');

/**
 * Cadastra o SuperAdm a partir das variáveis `SUPER_ADMIN_*` (`npm run seed`).
 * Roda sobre o `dist/`, como as migrations, e precisa delas já aplicadas.
 */
async function seed(): Promise<void> {
  const env = seedEnvSchema.parse(process.env);
  const app = await NestFactory.createApplicationContext(SeedModule);

  try {
    const result = await app.get(CreateSuperAdminUseCase).execute({
      name: env.SUPER_ADMIN_NAME,
      email: env.SUPER_ADMIN_EMAIL,
      password: env.SUPER_ADMIN_PASSWORD,
    });

    if (result.created) {
      logger.log(`SuperAdm criado (id ${result.userId}).`);
    } else {
      logger.warn('Já existe um SuperAdm cadastrado. Nada foi alterado.');
    }
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  // As mensagens de erro nunca incluem o valor da senha.
  if (error instanceof z.ZodError) {
    logger.error(`Variáveis de ambiente inválidas:\n${z.prettifyError(error)}`);
  } else if (error instanceof Error) {
    logger.error(error.message, error.stack);
  } else {
    logger.error(error);
  }

  process.exitCode = 1;
});
