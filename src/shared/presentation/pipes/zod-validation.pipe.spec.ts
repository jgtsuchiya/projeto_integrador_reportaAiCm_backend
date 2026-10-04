import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import {
  VALIDATION_ERROR_MESSAGE,
  ValidationErrorDetail,
  ZodValidationPipe,
} from './zod-validation.pipe';

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  address: z.object({ city: z.string() }),
});

function metadataFor(schema: unknown, overrides: Partial<ArgumentMetadata> = {}): ArgumentMetadata {
  return { type: 'body', schema, ...overrides } as ArgumentMetadata;
}

async function catchError(promise: Promise<unknown>): Promise<BadRequestException> {
  try {
    await promise;
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('Era esperado que a validação falhasse.');
}

function detailsOf(error: BadRequestException): ValidationErrorDetail[] {
  return (error.getResponse() as { details: ValidationErrorDetail[] }).details;
}

describe('ZodValidationPipe', () => {
  let sut: ZodValidationPipe;

  beforeEach(() => {
    sut = new ZodValidationPipe();
  });

  it('deve retornar o valor transformado pelo schema quando ele é válido', async () => {
    const value = {
      name: '  Maria  ',
      email: 'maria@email.com',
      address: { city: 'Campo Mourão' },
    };

    const result = await sut.transform(value, metadataFor(bodySchema));

    expect(result).toEqual({
      name: 'Maria',
      email: 'maria@email.com',
      address: { city: 'Campo Mourão' },
    });
  });

  it('deve lançar 400 com a lista de campos inválidos', async () => {
    const value = { name: '', email: 'invalido', address: { city: 42 } };

    const error = await catchError(sut.transform(value, metadataFor(bodySchema)));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ message: VALIDATION_ERROR_MESSAGE });
    expect(detailsOf(error).map(({ field }) => field)).toEqual(['name', 'email', 'address.city']);
  });

  it('deve usar as mensagens padrão em português', async () => {
    const error = await catchError(sut.transform({}, metadataFor(z.object({ name: z.string() }))));

    expect(detailsOf(error)[0]?.message).toContain('Entrada inválida');
  });

  it('deve manter a mensagem definida no schema', async () => {
    const schema = z.object({ cpf: z.string().length(11, 'CPF inválido.') });

    const error = await catchError(sut.transform({ cpf: '123' }, metadataFor(schema)));

    expect(error.getResponse()).toMatchObject({
      details: [{ field: 'cpf', message: 'CPF inválido.' }],
    });
  });

  it('deve usar o nome do parâmetro como campo quando o decorator recebe um', async () => {
    const metadata = metadataFor(z.uuid(), { type: 'param', data: 'id' });

    const error = await catchError(sut.transform('nao-e-uuid', metadata));

    expect(error.getResponse()).toMatchObject({ details: [{ field: 'id' }] });
  });

  it('deve usar o tipo do parâmetro como campo quando o erro é na raiz do valor', async () => {
    const error = await catchError(sut.transform('texto', metadataFor(bodySchema)));

    expect(error.getResponse()).toMatchObject({ details: [{ field: 'body' }] });
  });

  it('deve aceitar schemas com validação assíncrona', async () => {
    const schema = z.string().refine(async (value) => value !== 'ocupado', 'Já está em uso.');

    const error = await catchError(sut.transform('ocupado', metadataFor(schema)));

    expect(error.getResponse()).toMatchObject({ details: [{ message: 'Já está em uso.' }] });
  });

  it('deve retornar o valor sem alteração quando não há schema', async () => {
    const value = { qualquer: 'coisa' };

    const result = await sut.transform(value, metadataFor(undefined));

    expect(result).toBe(value);
  });
});
