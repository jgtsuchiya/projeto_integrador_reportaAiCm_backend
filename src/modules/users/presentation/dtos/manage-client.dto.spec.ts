import { changeClientStatusBodySchema, listClientsQuerySchema } from './manage-client.dto';

describe('listClientsQuerySchema', () => {
  it('deve aplicar os padrões da paginação, sem filtro nem busca', () => {
    expect(listClientsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('deve converter a query string e aceitar o status e a busca, sem espaços nas pontas', () => {
    const result = listClientsQuerySchema.parse({
      page: '2',
      pageSize: '50',
      status: 'INACTIVE',
      search: '  maria  ',
    });

    expect(result).toEqual({ page: 2, pageSize: 50, status: 'INACTIVE', search: 'maria' });
  });

  it('deve ignorar uma busca vazia', () => {
    expect(listClientsQuerySchema.parse({ search: '   ' })).toEqual({ page: 1, pageSize: 20 });
  });

  it.each(['PENDING', 'DELETED'])('deve recusar o status %s', (status) => {
    const result = listClientsQuerySchema.safeParse({ status });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['status']);
  });

  it('deve recusar uma busca longa demais', () => {
    const result = listClientsQuerySchema.safeParse({ search: 'a'.repeat(255) });

    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'A busca deve ter no máximo 254 caracteres.',
    ]);
  });
});

describe('changeClientStatusBodySchema', () => {
  it.each(['ACTIVE', 'INACTIVE'])('deve aceitar o status %s', (status) => {
    expect(changeClientStatusBodySchema.parse({ status })).toEqual({ status });
  });

  it('deve ignorar os outros campos, porque os dados do CLIENT não são editáveis (RN12)', () => {
    const result = changeClientStatusBodySchema.parse({ status: 'ACTIVE', name: 'Outro nome' });

    expect(result).toEqual({ status: 'ACTIVE' });
  });

  it.each(['PENDING', 'inactive', undefined])('deve recusar o status %p', (status) => {
    const result = changeClientStatusBodySchema.safeParse({ status });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['status']);
  });
});
