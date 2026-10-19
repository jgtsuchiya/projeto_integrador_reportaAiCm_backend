import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { UsersModule } from '@modules/users/users.module';

import { SessionSecondFactor } from './application/ports/session-second-factor';
import { SuperTokensSessionSecondFactor } from './infra/supertokens/supertokens-session-second-factor';
import { SuperTokensService } from './infra/supertokens/supertokens.service';
import { MfaController } from './presentation/controllers/mfa.controller';
import { SuperTokensMiddleware } from './presentation/middlewares/supertokens.middleware';

@Module({
  // Os overrides do sign-in, o validador de senha e as rotas da segunda etapa usam as regras
  // do módulo users.
  imports: [UsersModule],
  controllers: [MfaController],
  providers: [
    SuperTokensService,
    { provide: SessionSecondFactor, useClass: SuperTokensSessionSecondFactor },
  ],
  // Usado pelo AuthGuard, que é registrado como guard global no AppModule.
  exports: [SessionSecondFactor],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // O middleware só responde em /api/auth; nas outras rotas ele apenas chama o next().
    consumer.apply(SuperTokensMiddleware).forRoutes('{*path}');
  }
}
