import { InvalidCpfError } from '../errors/invalid-cpf.error';
import { Cpf } from './cpf';

describe('Cpf', () => {
  it('deve aceitar CPF só com dígitos', () => {
    expect(Cpf.create('52998224725').value).toBe('52998224725');
  });

  it('deve aceitar CPF com máscara e guardar só os dígitos (RN07)', () => {
    expect(Cpf.create(' 111.444.777-35 ').value).toBe('11144477735');
  });

  it('deve aceitar CPF cujo dígito verificador calculado é 10 (vira 0)', () => {
    expect(Cpf.create('123.456.789-09').value).toBe('12345678909');
  });

  it.each([
    ['primeiro dígito verificador errado', '52998224735'],
    ['segundo dígito verificador errado', '52998224726'],
    ['sequência repetida', '11111111111'],
    ['sequência de zeros', '000.000.000-00'],
    ['menos de 11 dígitos', '5299822472'],
    ['mais de 11 dígitos', '529982247250'],
    ['letras', '5299822472a'],
    ['máscara incompleta', '529.982.24725'],
    ['vazio', ''],
  ])('deve rejeitar CPF com %s', (_, raw) => {
    expect(() => Cpf.create(raw)).toThrow(InvalidCpfError);
  });

  it('deve mascarar o CPF para o painel (RN12)', () => {
    expect(Cpf.create('12345678909').masked()).toBe('***.456.789-**');
  });
});
