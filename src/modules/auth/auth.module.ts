import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { UsersModule } from '@modules/users/users.module';

import { SuperTokensService } from './infra/supertokens/supertokens.service';
import { SuperTokensMiddleware } from './presentation/middlewares/supertokens.middleware';

@Module({
  // O override do sign-in e o validador de senha usam as regras do módulo users.
  imports: [UsersModule],
  providers: [SuperTokensService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // O middleware só responde em /api/auth; nas outras rotas ele apenas chama o next().
    consumer.apply(SuperTokensMiddleware).forRoutes('{*path}');
  }
}
