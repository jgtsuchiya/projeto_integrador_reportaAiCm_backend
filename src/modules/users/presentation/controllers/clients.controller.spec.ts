import { Test } from '@nestjs/testing';

import {
  RegisterClientOutput,
  RegisterClientUseCase,
} from '../../application/use-cases/register-client.use-case';
import { RegisterClientBody } from '../dtos/register-client.dto';
import { ClientsController } from './clients.controller';

describe('ClientsController', () => {
  let sut: ClientsController;
  let registerClientUseCase: jest.Mocked<RegisterClientUseCase>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [{ provide: RegisterClientUseCase, useValue: { execute: jest.fn() } }],
    }).compile();

    sut = moduleRef.get(ClientsController);
    registerClientUseCase = moduleRef.get(RegisterClientUseCase);
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
});
