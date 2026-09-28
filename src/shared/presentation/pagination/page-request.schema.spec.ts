import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/domain/pagination';

import { pageRequestSchema } from './page-request.schema';

describe('pageRequestSchema', () => {
  it('deve aplicar os valores padrão quando a query não informa a página', () => {
    const result = pageRequestSchema.parse({});

    expect(result).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('deve converter os valores da query string para número', () => {
    const result = pageRequestSchema.parse({ page: '3', pageSize: '50' });

    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it('deve aceitar o tamanho máximo de página', () => {
    const result = pageRequestSchema.parse({ pageSize: String(MAX_PAGE_SIZE) });

    expect(result.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it.each([
    ['pageSize acima do máximo', { pageSize: String(MAX_PAGE_SIZE + 1) }],
    ['pageSize zero', { pageSize: '0' }],
    ['page zero', { page: '0' }],
    ['page negativa', { page: '-1' }],
    ['page fracionária', { page: '1.5' }],
    ['page não numérica', { page: 'abc' }],
  ])('deve rejeitar %s', (_case, query) => {
    const result = pageRequestSchema.safeParse(query);

    expect(result.success).toBe(false);
  });
});
