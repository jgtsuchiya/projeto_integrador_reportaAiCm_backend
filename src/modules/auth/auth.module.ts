import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { SuperTokensService } from './infra/supertokens/supertokens.service';
import { SuperTokensMiddleware } from './presentation/middlewares/supertokens.middleware';

@Module({
  providers: [SuperTokensService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // O middleware só responde em /api/auth; nas outras rotas ele apenas chama o next().
    consumer.apply(SuperTokensMiddleware).forRoutes('{*path}');
  }
}
