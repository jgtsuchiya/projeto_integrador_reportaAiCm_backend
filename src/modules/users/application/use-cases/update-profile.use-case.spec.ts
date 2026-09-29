import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { ClientOnlyFieldsError } from '../../domain/errors/client-only-fields.error';
import { InvalidBirthDateError } from '../../domain/errors/invalid-birth-date.error';
import { InvalidPhoneError } from '../../domain/errors/invalid-phone.error';
import { InvalidUserNameError } from '../../domain/errors/invalid-user-name.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Phone } from '../../domain/value-objects/phone';
import {
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { UpdateProfileUseCase } from './update-profile.use-case';

describe('UpdateProfileUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let sut: UpdateProfileUseCase;
  let client: User;
  let profile: ClientProfile;
  let admin: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    sut = new UpdateProfileUseCase(userRepository, new InMemoryClientProfileRepository(database));

    client = User.createClient({
      id: 'client-1',
      name: 'Maria da Silva',
      email: Email.create('maria@example.com'),
    });
    profile = ClientProfile.create({
      userId: client.id,
      cpf: Cpf.create('529.982.247-25'),
      phone: Phone.create('(43) 99999-8888'),
      birthDate: BirthDate.create('1990-05-20'),
    });
    admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-1',
    });
    admin.acceptInvitation();
    database.users.set(client.id, client);
    database.profiles.set(client.id, profile);
    database.users.set(admin.id, admin);
  });

  it('deve editar o nome, o telefone e a data de nascimento do CLIENT na mesma gravação', async () => {
    const updateClient = jest.spyOn(userRepository, 'updateClient');

    const result = await sut.execute({
      userId: client.id,
      name: '  Maria Souza  ',
      phone: '(43) 3222-1111',
      birthDate: '1991-06-21',
    });

    expect(updateClient).toHaveBeenCalledWith(client, profile);
    expect(result).toMatchObject({
      name: 'Maria Souza',
      phone: '4332221111',
      birthDate: '1991-06-21',
      cpf: '52998224725',
      email: 'maria@example.com',
    });
  });

  it('deve manter os campos que não foram enviados', async () => {
    const result = await sut.execute({ userId: client.id, phone: '43988887777' });

    expect(result).toMatchObject({
      name: 'Maria da Silva',
      phone: '43988887777',
      birthDate: '1990-05-20',
    });
  });

  it('deve informar como updatedAt a alteração mais recente entre o usuário e o perfil', async () => {
    jest.useFakeTimers({ now: new Date('2030-01-01T12:00:00.000Z') });

    try {
      const result = await sut.execute({ userId: client.id, phone: '43988887777' });

      expect(result.updatedAt).toEqual(new Date('2030-01-01T12:00:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('deve editar o nome de um ADMIN', async () => {
    const save = jest.spyOn(userRepository, 'save');

    const result = await sut.execute({ userId: admin.id, name: 'Ana Lima' });

    expect(save).toHaveBeenCalledWith(admin);
    expect(result).toMatchObject({ id: admin.id, role: 'ADMIN', name: 'Ana Lima' });
    expect(result).not.toHaveProperty('phone');
  });

  it('deve recusar telefone e data de nascimento de quem não é CLIENT', async () => {
    const save = jest.spyOn(userRepository, 'save');

    await expect(
      sut.execute({
        userId: admin.id,
        name: 'Ana Lima',
        phone: '43988887777',
        birthDate: '1990-01-01',
      }),
    ).rejects.toThrow(new ClientOnlyFieldsError(['phone', 'birthDate']));
    expect(admin.name).toBe('Ana Souza');
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    [{ phone: '123' }, InvalidPhoneError],
    [{ birthDate: '2999-01-01' }, InvalidBirthDateError],
    [{ name: ' ' }, InvalidUserNameError],
  ])('deve recusar %p sem alterar nada', async (changes, error) => {
    const updateClient = jest.spyOn(userRepository, 'updateClient');

    await expect(
      sut.execute({ userId: client.id, name: 'Outro Nome', phone: '43988887777', ...changes }),
    ).rejects.toThrow(error);
    expect(client.name).toBe('Maria da Silva');
    expect(profile.phone.value).toBe('43999998888');
    expect(updateClient).not.toHaveBeenCalled();
  });

  it('deve lançar UserNotFoundError para um usuário inexistente', async () => {
    await expect(sut.execute({ userId: 'nao-existe', name: 'Fulano' })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
