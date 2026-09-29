import { BirthDate } from '../value-objects/birth-date';
import { Cpf } from '../value-objects/cpf';
import { Phone } from '../value-objects/phone';
import { ClientProfile } from './client-profile.entity';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const LATER = new Date('2026-09-28T08:30:00.000Z');
const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

describe('ClientProfile', () => {
  let sut: ClientProfile;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    sut = ClientProfile.create({
      userId: USER_ID,
      cpf: Cpf.create('529.982.247-25'),
      phone: Phone.create('(43) 99999-8888'),
      birthDate: BirthDate.create('1990-05-20'),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deve usar o id do usuário como identidade', () => {
    expect(sut.id).toBe(USER_ID);
    expect(sut.userId).toBe(USER_ID);
  });

  it('deve guardar os dados já normalizados', () => {
    expect(sut.cpf.value).toBe('52998224725');
    expect(sut.phone.value).toBe('43999998888');
    expect(sut.birthDate.value).toBe('1990-05-20');
    expect(sut.createdAt).toEqual(NOW);
    expect(sut.updatedAt).toEqual(NOW);
  });

  it('deve trocar o telefone e atualizar o updatedAt', () => {
    jest.setSystemTime(LATER);

    sut.changePhone(Phone.create('4332221111'));

    expect(sut.phone.value).toBe('4332221111');
    expect(sut.updatedAt).toEqual(LATER);
  });

  it('deve trocar a data de nascimento e atualizar o updatedAt', () => {
    jest.setSystemTime(LATER);

    sut.changeBirthDate(BirthDate.create('1991-01-15'));

    expect(sut.birthDate.value).toBe('1991-01-15');
    expect(sut.updatedAt).toEqual(LATER);
  });

  it('deve reconstruir o perfil persistido', () => {
    const restored = ClientProfile.restore(USER_ID, {
      cpf: sut.cpf,
      phone: sut.phone,
      birthDate: sut.birthDate,
      createdAt: NOW,
      updatedAt: LATER,
    });

    expect(restored.equals(sut)).toBe(true);
    expect(restored.updatedAt).toEqual(LATER);
  });
});
