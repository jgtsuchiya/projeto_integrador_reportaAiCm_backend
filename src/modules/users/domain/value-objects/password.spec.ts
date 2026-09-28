import { inspect } from 'node:util';

import { InvalidPasswordError } from '../errors/invalid-password.error';
import { Password } from './password';

describe('Password', () => {
  it.each([
    ['o mínimo de 8 caracteres', 'abcdef12'],
    ['o máximo de 128 caracteres', `a1${'x'.repeat(126)}`],
    ['letras acentuadas', 'ção12345'],
    ['espaços e símbolos', ' senha 1! '],
  ])('deve aceitar uma senha com %s', (_, raw) => {
    expect(Password.create(raw).value).toBe(raw);
  });

  it.each([
    ['menos de 8 caracteres', 'abcde12'],
    ['mais de 128 caracteres', `a1${'x'.repeat(127)}`],
  ])('deve rejeitar uma senha com %s (RN08)', (_, raw) => {
    expect(() => Password.create(raw)).toThrow('A senha deve ter de 8 a 128 caracteres.');
  });

  it.each([
    ['sem número', 'abcdefgh'],
    ['sem letra', '12345678'],
    ['só símbolos e números', '!@#$1234'],
  ])('deve rejeitar uma senha %s (RN08)', (_, raw) => {
    expect(() => Password.create(raw)).toThrow(InvalidPasswordError);
  });

  it('não deve expor a senha ao ser serializada ou inspecionada', () => {
    const sut = Password.create('segredo123');

    expect(JSON.stringify(sut)).not.toContain('segredo123');
    expect(JSON.stringify({ password: sut })).not.toContain('segredo123');
    expect(inspect(sut)).not.toContain('segredo123');
  });
});
