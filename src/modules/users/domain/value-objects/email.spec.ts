import { InvalidEmailError } from '../errors/invalid-email.error';
import { Email } from './email';

describe('Email', () => {
  it('deve normalizar com trim e minúsculas (RN02)', () => {
    expect(Email.create('  Maria.Silva@Example.COM ').value).toBe('maria.silva@example.com');
  });

  it.each(['maria+reports@example.com', 'a@b.co', 'deleted+id@reportaai.invalid'])(
    'deve aceitar %p',
    (raw) => {
      expect(Email.create(raw).value).toBe(raw);
    },
  );

  it.each([
    '',
    'maria',
    'maria@',
    '@example.com',
    'maria@example',
    'maria@@example.com',
    'maria silva@example.com',
    'maria@example..com',
    'maria@.example.com',
  ])('deve rejeitar %p', (raw) => {
    expect(() => Email.create(raw)).toThrow(InvalidEmailError);
  });

  it('deve rejeitar e-mail com mais de 254 caracteres', () => {
    const raw = `maria@${'a'.repeat(250)}.com`;

    expect(() => Email.create(raw)).toThrow(InvalidEmailError);
  });

  it('deve rejeitar a parte local com mais de 64 caracteres', () => {
    expect(() => Email.create(`${'a'.repeat(65)}@example.com`)).toThrow(InvalidEmailError);
  });

  it('deve considerar iguais e-mails que só diferem na caixa', () => {
    expect(Email.create('MARIA@example.com').equals(Email.create('maria@example.com'))).toBe(true);
  });
});
