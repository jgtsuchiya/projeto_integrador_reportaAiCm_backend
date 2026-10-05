import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';
import type { Page } from '@shared/domain/pagination';

import type { ClientOutput } from '../../application/dtos/client.output';
import { ChangeClientStatusUseCase } from '../../application/use-cases/change-client-status.use-case';
import { GetClientUseCase } from '../../application/use-cases/get-client.use-case';
import { ListClientsUseCase } from '../../application/use-cases/list-clients.use-case';
import {
  RegisterClientOutput,
  RegisterClientUseCase,
} from '../../application/use-cases/register-client.use-case';
import { Role } from '../../domain/value-objects/role';
import {
  type ChangeClientStatusBody,
  changeClientStatusBodySchema,
  type ListClientsQuery,
  listClientsQuerySchema,
} from '../dtos/manage-client.dto';
import { type RegisterClientBody, registerClientBodySchema } from '../dtos/register-client.dto';

/**
 * Autocadastro do CLIENT (público) e gestão dos CLIENTs pelo painel (ADMIN e SUPER_ADMIN,
 * RN12). Na gestão, o CPF sai sempre mascarado, e ids que não são de CLIENT respondem 404.
 */
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly registerClientUseCase: RegisterClientUseCase,
    private readonly listClientsUseCase: ListClientsUseCase,
    private readonly getClientUseCase: GetClientUseCase,
    private readonly changeClientStatusUseCase: ChangeClientStatusUseCase,
  ) {}

  /** Autocadastro do CLIENT pelo app (RN05). Responde 201 com o perfil, sem a senha. */
  @Public()
  @Post()
  register(
    @Body({ schema: registerClientBodySchema }) body: RegisterClientBody,
  ): Promise<RegisterClientOutput> {
    return this.registerClientUseCase.execute(body);
  }

  /**
   * Lista paginada, com filtro opcional por status e busca por nome ou e-mail (trecho) ou
   * por CPF (exato).
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get()
  list(
    @Query({ schema: listClientsQuerySchema }) query: ListClientsQuery,
  ): Promise<Page<ClientOutput>> {
    return this.listClientsUseCase.execute(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get(':id')
  findOne(@Param('id', { schema: z.uuid() }) id: string): Promise<ClientOutput> {
    return this.getClientUseCase.execute({ clientId: id });
  }

  /** Inativa ou reativa o CLIENT. Ao inativar, as sessões dele são revogadas (RN10). */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id/status')
  changeStatus(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: changeClientStatusBodySchema }) body: ChangeClientStatusBody,
  ): Promise<ClientOutput> {
    return this.changeClientStatusUseCase.execute({ clientId: id, ...body });
  }
}
