import { InvalidPhoneError } from '../errors/invalid-phone.error';
import { Phone } from './phone';

describe('Phone', () => {
  it.each([
    ['celular só com dígitos', '43999998888', '43999998888'],
    ['celular com máscara', '(43) 99999-8888', '43999998888'],
    ['fixo', '4332221111', '4332221111'],
    ['fixo com máscara', '(11) 3222-1111', '1132221111'],
  ])('deve aceitar %s', (_, raw, expected) => {
    expect(Phone.create(raw).value).toBe(expected);
  });

  it.each([
    ['sem DDD', '999998888'],
    ['DDD com zero', '03999998888'],
    ['celular sem o 9 inicial', '43899998888'],
    ['fixo começando com 9 e 8 dígitos', '4392221111'],
    ['fixo começando com 1', '4312221111'],
    ['dígitos a mais', '439999988881'],
    ['letras', '43 9999-abcd'],
    ['vazio', ''],
  ])('deve rejeitar %s', (_, raw) => {
    expect(() => Phone.create(raw)).toThrow(InvalidPhoneError);
  });
});
