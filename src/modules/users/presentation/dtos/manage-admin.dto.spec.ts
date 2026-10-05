import {
  changeAdminStatusBodySchema,
  listAdminsQuerySchema,
  updateAdminBodySchema,
} from './manage-admin.dto';

describe('listAdminsQuerySchema', () => {
  it('deve aplicar os padrões da paginação, sem filtro de status', () => {
    expect(listAdminsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('deve converter a query string e aceitar o filtro de status', () => {
    const result = listAdminsQuerySchema.parse({ page: '2', pageSize: '50', status: 'PENDING' });

    expect(result).toEqual({ page: 2, pageSize: 50, status: 'PENDING' });
  });

  it('deve recusar um status desconhecido', () => {
    const result = listAdminsQuerySchema.safeParse({ status: 'DELETED' });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['status']);
  });
});

describe('updateAdminBodySchema', () => {
  it('deve aceitar só o nome, sem espaços nas pontas', () => {
    const result = updateAdminBodySchema.parse({
      name: '  Ana Lima  ',
      email: 'outro@example.com',
      role: 'SUPER_ADMIN',
    });

    expect(result).toEqual({ name: 'Ana Lima' });
  });

  it('deve exigir o nome', () => {
    const result = updateAdminBodySchema.safeParse({ name: ' ' });

    expect(result.error?.issues.map(({ message }) => message)).toEqual(['O nome é obrigatório.']);
  });
});

describe('changeAdminStatusBodySchema', () => {
  it.each(['ACTIVE', 'INACTIVE'])('deve aceitar o status %s', (status) => {
    expect(changeAdminStatusBodySchema.parse({ status })).toEqual({ status });
  });

  it.each(['PENDING', 'active', undefined])('deve recusar o status %p', (status) => {
    const result = changeAdminStatusBodySchema.safeParse({ status });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['status']);
  });
});
