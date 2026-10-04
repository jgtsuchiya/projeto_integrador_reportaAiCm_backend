import { Body, Controller, Post } from '@nestjs/common';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';

import {
  RegisterClientOutput,
  RegisterClientUseCase,
} from '../../application/use-cases/register-client.use-case';
import { type RegisterClientBody, registerClientBodySchema } from '../dtos/register-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly registerClientUseCase: RegisterClientUseCase) {}

  /** Autocadastro do CLIENT pelo app (RN05). Responde 201 com o perfil, sem a senha. */
  @Public()
  @Post()
  register(
    @Body({ schema: registerClientBodySchema }) body: RegisterClientBody,
  ): Promise<RegisterClientOutput> {
    return this.registerClientUseCase.execute(body);
  }
}
