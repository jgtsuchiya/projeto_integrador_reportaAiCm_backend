import { Password } from '../../domain/value-objects/password';
import { CheckPasswordPolicyUseCase } from './check-password-policy.use-case';

describe('CheckPasswordPolicyUseCase', () => {
  const sut = new CheckPasswordPolicyUseCase();

  it('deve retornar null para uma senha que segue a política', async () => {
    await expect(sut.execute('senha-forte-1')).resolves.toBeNull();
  });

  it.each([
    ['curta', 'abc123', 'A senha deve ter de 8 a 128 caracteres.'],
    ['sem número', 'somenteletras', 'A senha deve ter pelo menos uma letra e um número.'],
    ['sem letra', '1234567890', 'A senha deve ter pelo menos uma letra e um número.'],
  ])('deve retornar a mensagem da violação para uma senha %s', async (_case, password, message) => {
    await expect(sut.execute(password)).resolves.toBe(message);
  });

  it('deve propagar um erro que não é de política de senha', async () => {
    const failure = new Error('inesperado');
    jest.spyOn(Password, 'create').mockImplementation(() => {
      throw failure;
    });

    await expect(sut.execute('senha-forte-1')).rejects.toBe(failure);
  });
});
