import { Test } from '@nestjs/testing';

import type { ClientOutput } from '../../application/dtos/client.output';
import { ChangeClientStatusUseCase } from '../../application/use-cases/change-client-status.use-case';
import { GetClientUseCase } from '../../application/use-cases/get-client.use-case';
import { ListClientsUseCase } from '../../application/use-cases/list-clients.use-case';
import {
  RegisterClientOutput,
  RegisterClientUseCase,
} from '../../application/use-cases/register-client.use-case';
import { RegisterClientBody } from '../dtos/register-client.dto';
import { ClientsController } from './clients.controller';

describe('ClientsController', () => {
  let sut: ClientsController;
  let registerClientUseCase: jest.Mocked<RegisterClientUseCase>;
  let listClientsUseCase: jest.Mocked<ListClientsUseCase>;
  let getClientUseCase: jest.Mocked<GetClientUseCase>;
  let changeClientStatusUseCase: jest.Mocked<ChangeClientStatusUseCase>;

  const client: ClientOutput = {
    id: 'client-1',
    role: 'CLIENT',
    name: 'Maria da Silva',
    email: 'maria@example.com',
    status: 'ACTIVE',
    cpf: '***.982.247-**',
    phone: '43999998888',
    birthDate: '1990-05-20',
    lastLoginAt: null,
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
    updatedAt: new Date('2026-09-28T12:00:00.000Z'),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: RegisterClientUseCase, useValue: { execute: jest.fn() } },
        { provide: ListClientsUseCase, useValue: { execute: jest.fn() } },
        { provide: GetClientUseCase, useValue: { execute: jest.fn() } },
        { provide: ChangeClientStatusUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(ClientsController);
    registerClientUseCase = moduleRef.get(RegisterClientUseCase);
    listClientsUseCase = moduleRef.get(ListClientsUseCase);
    getClientUseCase = moduleRef.get(GetClientUseCase);
    changeClientStatusUseCase = moduleRef.get(ChangeClientStatusUseCase);
  });

  it('deve delegar o autocadastro para o caso de uso e retornar o perfil criado', async () => {
    const body: RegisterClientBody = {
      name: 'Maria da Silva',
      email: 'maria@example.com',
      password: 'senha-forte-1',
      cpf: '529.982.247-25',
      phone: '(43) 99999-8888',
      birthDate: '1990-05-20',
    };
    const output: RegisterClientOutput = {
      id: 'user-1',
      role: 'CLIENT',
      name: 'Maria da Silva',
      email: 'maria@example.com',
      status: 'ACTIVE',
      cpf: '52998224725',
      phone: '43999998888',
      birthDate: '1990-05-20',
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    };
    registerClientUseCase.execute.mockResolvedValue(output);

    const result = await sut.register(body);

    expect(registerClientUseCase.execute).toHaveBeenCalledWith(body);
    expect(result).toEqual(output);
  });

  it('deve delegar a listagem com a paginação, o filtro e a busca', async () => {
    const page = { items: [client], page: 1, pageSize: 20, total: 1 };
    listClientsUseCase.execute.mockResolvedValue(page);

    const result = await sut.list({ page: 1, pageSize: 20, status: 'ACTIVE', search: 'maria' });

    expect(listClientsUseCase.execute).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'ACTIVE',
      search: 'maria',
    });
    expect(result).toBe(page);
  });

  it('deve delegar o detalhe para o caso de uso', async () => {
    getClientUseCase.execute.mockResolvedValue(client);

    await expect(sut.findOne('client-1')).resolves.toBe(client);
    expect(getClientUseCase.execute).toHaveBeenCalledWith({ clientId: 'client-1' });
  });

  it('deve delegar a mudança de status para o caso de uso', async () => {
    changeClientStatusUseCase.execute.mockResolvedValue({ ...client, status: 'INACTIVE' });

    const result = await sut.changeStatus('client-1', { status: 'INACTIVE' });

    expect(changeClientStatusUseCase.execute).toHaveBeenCalledWith({
      clientId: 'client-1',
      status: 'INACTIVE',
    });
    expect(result.status).toBe('INACTIVE');
  });
});
