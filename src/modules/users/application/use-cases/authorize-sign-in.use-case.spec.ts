import { User } from '../../domain/entities/user.entity';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { Role } from '../../domain/value-objects/role';
import { AuthorizeSignInUseCase } from './authorize-sign-in.use-case';

/** Como o repositório real, ignora os usuários excluídos. */
class InMemoryUserRepository extends UserRepository {
  readonly items = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    const user = this.items.get(id);

    return user && !user.isDeleted ? user : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return [...this.items.values()].find((user) => user.email.equals(email)) ?? null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }

  async existsByRole(role: Role): Promise<boolean> {
    return [...this.items.values()].some((user) => user.role === role);
  }

  async save(user: User): Promise<void> {
    this.items.set(user.id, user);
  }
  async saveClient(user: User): Promise<void> {
    await this.save(user);
  }
}

describe('AuthorizeSignInUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let sut: AuthorizeSignInUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    sut = new AuthorizeSignInUseCase(userRepository);
  });

  function createClient(): User {
    const user = User.createClient({
      id: 'client-1',
      name: 'Maria',
      email: Email.create('maria@example.com'),
    });
    userRepository.items.set(user.id, user);

    return user;
  }

  it('deve permitir o login de um usuário ACTIVE e registrar o último acesso', async () => {
    const user = createClient();
    const saveSpy = jest.spyOn(userRepository, 'save');

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: true });
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    expect(saveSpy).toHaveBeenCalledWith(user);
  });

  it('deve recusar um usuário que não existe no MySQL', async () => {
    const saveSpy = jest.spyOn(userRepository, 'save');

    const result = await sut.execute({ userId: 'desconhecido' });

    expect(result).toEqual({ allowed: false });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('deve recusar um usuário INACTIVE, sem registrar o acesso', async () => {
    const user = createClient();
    user.deactivate();

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: false });
    expect(user.lastLoginAt).toBeNull();
  });

  it('deve recusar um ADMIN PENDING', async () => {
    const admin = User.createAdmin({
      id: 'admin-1',
      name: 'João',
      email: Email.create('joao@example.com'),
      createdById: 'super-1',
    });
    userRepository.items.set(admin.id, admin);

    const result = await sut.execute({ userId: admin.id });

    expect(result).toEqual({ allowed: false });
  });

  it('deve recusar um usuário excluído', async () => {
    const user = createClient();
    user.delete();

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: false });
  });
});
