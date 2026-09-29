import { User } from '../../domain/entities/user.entity';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { Role } from '../../domain/value-objects/role';
import { GetAuthenticatedUserUseCase } from './get-authenticated-user.use-case';

describe('GetAuthenticatedUserUseCase', () => {
  let userRepository: jest.Mocked<Pick<UserRepository, 'findById'>>;
  let sut: GetAuthenticatedUserUseCase;

  beforeEach(() => {
    userRepository = { findById: jest.fn() };
    sut = new GetAuthenticatedUserUseCase(userRepository as unknown as UserRepository);
  });

  function createClient(): User {
    return User.createClient({
      id: 'client-1',
      name: 'Maria',
      email: Email.create('maria@example.com'),
    });
  }

  it('deve retornar o id, o papel e a sessão de um usuário ACTIVE', async () => {
    userRepository.findById.mockResolvedValue(createClient());

    const result = await sut.execute({ userId: 'client-1', sessionHandle: 'session-1' });

    expect(result).toEqual({ id: 'client-1', role: Role.CLIENT, sessionHandle: 'session-1' });
    expect(userRepository.findById).toHaveBeenCalledWith('client-1');
  });

  it('deve retornar null quando o usuário não existe ou foi excluído', async () => {
    userRepository.findById.mockResolvedValue(null);

    const result = await sut.execute({ userId: 'client-1', sessionHandle: 'session-1' });

    expect(result).toBeNull();
  });

  it('deve retornar null quando o usuário está INACTIVE', async () => {
    const user = createClient();
    user.deactivate();
    userRepository.findById.mockResolvedValue(user);

    const result = await sut.execute({ userId: user.id, sessionHandle: 'session-1' });

    expect(result).toBeNull();
  });

  it('deve retornar null quando o ADMIN ainda está PENDING', async () => {
    userRepository.findById.mockResolvedValue(
      User.createAdmin({
        id: 'admin-1',
        name: 'João',
        email: Email.create('joao@example.com'),
        createdById: 'super-1',
      }),
    );

    const result = await sut.execute({ userId: 'admin-1', sessionHandle: 'session-1' });

    expect(result).toBeNull();
  });
});
