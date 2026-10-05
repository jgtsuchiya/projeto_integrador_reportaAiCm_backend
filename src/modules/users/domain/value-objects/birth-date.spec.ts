import { InvalidBirthDateError } from '../errors/invalid-birth-date.error';
import { BirthDate } from './birth-date';

describe('BirthDate', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deve aceitar uma data no passado no formato AAAA-MM-DD', () => {
    expect(BirthDate.create(' 1990-05-20 ').value).toBe('1990-05-20');
  });

  it('deve aceitar a data de ontem', () => {
    expect(BirthDate.create('2026-09-26').value).toBe('2026-09-26');
  });

  it('deve aceitar 29 de fevereiro em ano bissexto', () => {
    expect(BirthDate.create('2000-02-29').value).toBe('2000-02-29');
  });

  it.each(['20/05/1990', '1990-5-20', '1990-05-20T00:00:00Z', 'abc', ''])(
    'deve rejeitar o formato %p',
    (raw) => {
      expect(() => BirthDate.create(raw)).toThrow(InvalidBirthDateError);
    },
  );

  it.each(['2001-02-29', '1990-02-30', '1990-13-01', '1990-04-31'])(
    'deve rejeitar a data inexistente %p',
    (raw) => {
      expect(() => BirthDate.create(raw)).toThrow('Data de nascimento inválida');
    },
  );

  it.each(['2026-09-27', '2026-09-28', '2030-01-01'])(
    'deve rejeitar a data de hoje ou futura %p',
    (raw) => {
      expect(() => BirthDate.create(raw)).toThrow('A data de nascimento precisa estar no passado.');
    },
  );

  it('deve rejeitar datas anteriores a 1900', () => {
    expect(() => BirthDate.create('1899-12-31')).toThrow(InvalidBirthDateError);
  });
});
