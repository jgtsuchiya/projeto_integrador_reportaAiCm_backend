import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { AbstractLogger, DataSource, In, LogLevel, LogMessage, QueryRunner } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { OpenReportUseCase } from '@modules/reports/application/use-cases/open-report.use-case';
import { VoteOnReportUseCase } from '@modules/reports/application/use-cases/vote-on-report.use-case';
import { ReportPhoto } from '@modules/reports/domain/entities/report-photo.entity';
import { Report } from '@modules/reports/domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '@modules/reports/domain/errors/duplicate-idempotency-key.error';
import { DuplicateVoteError } from '@modules/reports/domain/errors/duplicate-vote.error';
import { ReportHasVotesError } from '@modules/reports/domain/errors/report-has-votes.error';
import { ReportNotDeletableError } from '@modules/reports/domain/errors/report-not-deletable.error';
import { ReportNotInValidationError } from '@modules/reports/domain/errors/report-not-in-validation.error';
import { ReportPhotoSize } from '@modules/reports/domain/repositories/report-photo.repository';
import { GeoPoint } from '@modules/reports/domain/value-objects/geo-point';
import { ReportDescription } from '@modules/reports/domain/value-objects/report-description';
import { ReportStatus } from '@modules/reports/domain/value-objects/report-status';
import { ReportVoteType } from '@modules/reports/domain/value-objects/report-vote-type';
import { ReportPhotoOrmEntity } from '@modules/reports/infra/database/entities/report-photo.orm-entity';
import { ReportVoteOrmEntity } from '@modules/reports/infra/database/entities/report-vote.orm-entity';
import { ReportOrmEntity } from '@modules/reports/infra/database/entities/report.orm-entity';
import { TypeOrmReportPhotoRepository } from '@modules/reports/infra/database/repositories/typeorm-report-photo.repository';
import { TypeOrmReportRepository } from '@modules/reports/infra/database/repositories/typeorm-report.repository';
import {
  buildPhoto,
  CENTER,
  JpegFixture,
  openTestReport,
  pointNorthOf,
  readFixture,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '@modules/reports/testing/report-fixtures';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

const CLIENT_ROLE_ID = 3;

/** Guarda as queries com os parâmetros, para conferir o SQL das consultas. */
class QueryRecorder extends AbstractLogger {
  readonly queries: Array<{ query: string; parameters: unknown[] }> = [];

  override logQuery(query: string, parameters?: unknown[]): void {
    this.queries.push({ query, parameters: parameters ?? [] });
  }

  protected writeLog(_level: LogLevel, _message: LogMessage | LogMessage[]): void {
    // Só as queries interessam, e elas chegam pelo logQuery.
  }
}

describe('Repositórios de reportes (integração)', () => {
  const env = envSchema.parse(process.env);
  const recorder = new QueryRecorder();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let reports: TypeOrmReportRepository;
  let photos: TypeOrmReportPhotoRepository;

  beforeAll(async () => {
    // Proteção: os testes de integração alteram o schema; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    dataSource = new DataSource({
      ...buildDataSourceOptions(env),
      entities: [
        RoleOrmEntity,
        UserOrmEntity,
        ReportOrmEntity,
        ReportPhotoOrmEntity,
        ReportVoteOrmEntity,
      ],
      migrations: [
        join(__dirname, '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
      ],
      logging: ['query'],
      logger: recorder,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  // Cada teste roda numa transação desfeita no final, para não deixar dados no banco.
  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();
    reports = new TypeOrmReportRepository(queryRunner.manager.getRepository(ReportOrmEntity));
    photos = new TypeOrmReportPhotoRepository(
      queryRunner.manager.getRepository(ReportPhotoOrmEntity),
    );
    recorder.queries.length = 0;
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  /** Cadastra um Client direto no banco: os reportes referenciam o usuário (FK). */
  async function insertClient(manager = queryRunner.manager): Promise<string> {
    const id = randomUUID();
    await manager.getRepository(UserOrmEntity).insert({
      id,
      roleId: CLIENT_ROLE_ID,
      name: 'Maria da Silva',
      email: `reports.${id}@reportaai.invalid`,
      status: 'ACTIVE',
    });

    return id;
  }

  async function createReport(
    authorId: string,
    options: {
      meters?: number;
      photo?: ReportPhoto;
      changes?: Parameters<typeof withReportChanges>[1];
    } = {},
  ): Promise<Report> {
    const photo = options.photo ?? buildPhoto();
    const report = withReportChanges(
      openTestReport({ authorId, photo, location: pointNorthOf(CENTER, options.meters ?? 0) }),
      options.changes ?? {},
    );
    await reports.create(report, photo);

    return report;
  }

  /** A regra da entidade, como o `VoteOnReportUseCase` a entrega ao repositório. */
  function voteWith(voterId: string, type: ReportVoteType = ReportVoteType.CONFIRM) {
    return (report: Report) => report.registerVote(voterId, type, TEST_REPORTS_CONFIG);
  }

  /** Queries das imagens: as que leem as colunas `content` ou `thumbnail`. */
  function queriesReadingImages(): string[] {
    return recorder.queries
      .map(({ query }) => query)
      .filter((query) => query.startsWith('SELECT') && /`(content|thumbnail)`/.test(query));
  }

  describe('gravação e leitura (T1)', () => {
    it('deve gravar o reporte com a foto e ler de volta a localização e os bytes das imagens', async () => {
      const authorId = await insertClient();
      const photo = buildPhoto(JpegFixture.WITH_METADATA);
      const report = await createReport(authorId, { photo });

      const stored = await reports.findById(report.id);
      const content = await photos.findContent(report.id, ReportPhotoSize.FULL);
      const thumbnail = await photos.findContent(report.id, ReportPhotoSize.THUMBNAIL);

      expect(stored?.location.latitude).toBe(report.location.latitude);
      expect(stored?.location.longitude).toBe(report.location.longitude);
      expect(stored?.location.accuracyMeters).toBe(9);
      expect(stored?.photo).toEqual({ id: photo.id, width: 160, height: 120 });
      expect(content).toEqual({
        photoId: photo.id,
        mimeType: 'image/jpeg',
        bytes: photo.content.bytes,
      });
      expect(thumbnail?.bytes).toEqual(photo.thumbnail.bytes);
    });

    it('deve gravar a latitude e a longitude sem trocar a ordem dos eixos', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);

      const [row] = (await queryRunner.query(
        `SELECT ST_Latitude(location) AS latitude, ST_Longitude(location) AS longitude,
                ST_AsText(location, 'axis-order=long-lat') AS wkt, ST_SRID(location) AS srid
           FROM reports WHERE id = ?`,
        [report.id],
      )) as Array<{ latitude: number; longitude: number; wkt: string; srid: string }>;

      expect(row).toEqual({
        latitude: report.location.latitude,
        longitude: report.location.longitude,
        wkt: `POINT(${report.location.longitude} ${report.location.latitude})`,
        // O driver devolve o inteiro sem sinal do ST_SRID como texto.
        srid: '4326',
      });
    });

    it('deve reconstruir os dados do reporte como foram gravados', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId, { changes: { idempotencyKey: randomUUID() } });

      const stored = await reports.findById(report.id);

      expect(stored).toMatchObject({
        id: report.id,
        authorId,
        status: ReportStatus.PENDING,
        confirmationsCount: 0,
        rejectionsCount: 0,
        idempotencyKey: report.idempotencyKey,
        statusChangedAt: null,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        deletedAt: null,
      });
      expect(stored?.description?.value).toBe('Buraco na faixa da direita.');
    });

    it('deve devolver null para o reporte e a foto que não existem', async () => {
      await expect(reports.findById(randomUUID())).resolves.toBeNull();
      await expect(photos.findContent(randomUUID(), ReportPhotoSize.FULL)).resolves.toBeNull();
    });
  });

  describe('Idempotency-Key (RN31)', () => {
    it('deve recusar a mesma chave do mesmo autor e aceitar a de outro autor', async () => {
      const authorId = await insertClient();
      const otherId = await insertClient();
      const key = randomUUID();
      await createReport(authorId, { changes: { idempotencyKey: key } });

      await expect(createReport(authorId, { changes: { idempotencyKey: key } })).rejects.toThrow(
        DuplicateIdempotencyKeyError,
      );
      await expect(
        createReport(otherId, { changes: { idempotencyKey: key } }),
      ).resolves.toBeInstanceOf(Report);
    });

    it('deve encontrar o reporte pela chave do autor, inclusive o excluído', async () => {
      const authorId = await insertClient();
      const key = randomUUID();
      const report = await createReport(authorId, { changes: { idempotencyKey: key } });
      report.delete(authorId);
      await reports.softDelete(report);

      const found = await reports.findByIdempotencyKey(authorId, key);

      expect(found?.id).toBe(report.id);
      expect(found?.isDeleted).toBe(true);
      await expect(reports.findByIdempotencyKey(await insertClient(), key)).resolves.toBeNull();
    });
  });

  describe('save e softDelete', () => {
    it('deve gravar a descrição sem mudar a localização nem a foto', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);
      const photoId = report.photo.id;
      report.edit(authorId, ReportDescription.create('Descrição nova'));

      await reports.save(report);

      const stored = await reports.findById(report.id);
      expect(stored?.description?.value).toBe('Descrição nova');
      expect(stored?.updatedAt).toEqual(report.updatedAt);
      expect(stored?.photo.id).toBe(photoId);
      expect(stored?.location.equals(report.location)).toBe(true);
    });

    it('deve trocar a foto, apagando a anterior', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);
      const photo = buildPhoto(JpegFixture.PROGRESSIVE);
      report.replacePhoto(authorId, photo);

      await reports.save(report, photo);

      const stored = await reports.findById(report.id);
      const content = await photos.findContent(report.id, ReportPhotoSize.FULL);
      const [{ total }] = (await queryRunner.query(
        'SELECT COUNT(*) AS total FROM report_photos WHERE report_id = ?',
        [report.id],
      )) as Array<{ total: string }>;
      expect(stored?.photo).toEqual({ id: photo.id, width: 200, height: 150 });
      expect(content?.bytes).toEqual(readFixture(JpegFixture.PROGRESSIVE));
      expect(Number(total)).toBe(1);
    });

    it('deve recusar a edição de um reporte lido antes de um voto, sem desfazer a contagem', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);
      await reports.vote(report.id, voteWith(await insertClient()));
      // A edição leu o reporte sem votos, antes do voto.
      report.edit(authorId, ReportDescription.create('Descrição nova'));

      await expect(reports.save(report)).rejects.toThrow(ReportHasVotesError);

      const stored = await reports.findById(report.id);
      expect(stored?.confirmationsCount).toBe(1);
      expect(stored?.description?.value).toBe('Buraco na faixa da direita.');
    });

    it('deve recusar a exclusão de um reporte lido antes de o voto confirmá-lo', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId, { changes: { confirmationsCount: 9 } });
      await reports.vote(report.id, voteWith(await insertClient()));
      report.delete(authorId);

      await expect(reports.softDelete(report)).rejects.toThrow(ReportNotDeletableError);

      await expect(reports.findById(report.id)).resolves.toMatchObject({
        status: ReportStatus.CONFIRMED,
        isDeleted: false,
      });
    });

    it('deve gravar a exclusão lógica: o reporte some das buscas e continua contando', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);
      report.delete(authorId);

      await reports.softDelete(report);

      await expect(reports.findById(report.id)).resolves.toBeNull();
      await expect(
        reports.findByAuthor(authorId, { page: 1, pageSize: 20 }, {}),
      ).resolves.toMatchObject({ total: 0, items: [] });
      await expect(
        reports.countCreatedSince(authorId, new Date(Date.now() - 60_000)),
      ).resolves.toBe(1);
    });
  });

  describe('vote (T10)', () => {
    it('deve gravar o voto e as contagens, com a linha do reporte travada', async () => {
      const authorId = await insertClient();
      const voterId = await insertClient();
      const report = await createReport(authorId);
      recorder.queries.length = 0;

      const updated = await reports.vote(report.id, voteWith(voterId, ReportVoteType.DENY));

      expect(updated).toMatchObject({ id: report.id, confirmationsCount: 0, rejectionsCount: 1 });
      const stored = await reports.findById(report.id);
      expect(stored).toMatchObject({ rejectionsCount: 1, status: ReportStatus.PENDING });
      expect(stored?.updatedAt).toEqual(updated?.updatedAt);
      const votes = await queryRunner.manager
        .getRepository(ReportVoteOrmEntity)
        .findBy({ reportId: report.id });
      expect(votes).toEqual([
        {
          id: expect.any(String) as string,
          reportId: report.id,
          userId: voterId,
          vote: 'DENY',
          createdAt: updated?.updatedAt,
        },
      ]);
      const locking = recorder.queries.find(({ query }) => query.endsWith('FOR UPDATE'));
      expect(locking?.query).toContain('`reports`');
    });

    it('deve gravar o status e a data da mudança com o voto que chega ao limite', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId, { changes: { confirmationsCount: 9 } });

      const updated = await reports.vote(report.id, voteWith(await insertClient()));

      const stored = await reports.findById(report.id);
      expect(stored).toMatchObject({ status: ReportStatus.CONFIRMED, confirmationsCount: 10 });
      expect(stored?.statusChangedAt).toEqual(updated?.statusChangedAt);
      expect(stored?.statusChangedAt).toBeInstanceOf(Date);
    });

    it('deve recusar o voto repetido sem mudar as contagens', async () => {
      const authorId = await insertClient();
      const voterId = await insertClient();
      const report = await createReport(authorId);
      await reports.vote(report.id, voteWith(voterId));

      await expect(reports.vote(report.id, voteWith(voterId, ReportVoteType.DENY))).rejects.toThrow(
        DuplicateVoteError,
      );

      await expect(reports.findById(report.id)).resolves.toMatchObject({
        confirmationsCount: 1,
        rejectionsCount: 0,
      });
    });

    it('deve desfazer tudo quando a regra da entidade recusa o voto', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId, {
        changes: { status: ReportStatus.CONFIRMED, confirmationsCount: 10 },
      });

      await expect(reports.vote(report.id, voteWith(await insertClient()))).rejects.toThrow(
        ReportNotInValidationError,
      );
      await expect(
        queryRunner.manager.getRepository(ReportVoteOrmEntity).countBy({ reportId: report.id }),
      ).resolves.toBe(0);
    });

    it('deve devolver null para o reporte excluído e o inexistente, sem chamar a regra', async () => {
      const authorId = await insertClient();
      const report = await createReport(authorId);
      report.delete(authorId);
      await reports.softDelete(report);
      const apply = jest.fn(voteWith(await insertClient()));

      await expect(reports.vote(report.id, apply)).resolves.toBeNull();
      await expect(reports.vote(randomUUID(), apply)).resolves.toBeNull();
      expect(apply).not.toHaveBeenCalled();
    });

    it('deve encontrar os votos do usuário só nos reportes informados', async () => {
      const authorId = await insertClient();
      const voterId = await insertClient();
      const confirmed = await createReport(authorId);
      const denied = await createReport(authorId);
      const other = await createReport(authorId);
      await reports.vote(confirmed.id, voteWith(voterId));
      await reports.vote(denied.id, voteWith(voterId, ReportVoteType.DENY));
      await reports.vote(other.id, voteWith(await insertClient()));

      const votes = await reports.findVotes(voterId, [confirmed.id, denied.id, other.id]);

      expect(votes).toEqual(
        new Map([
          [confirmed.id, ReportVoteType.CONFIRM],
          [denied.id, ReportVoteType.DENY],
        ]),
      );
      await expect(reports.findVotes(voterId, [])).resolves.toEqual(new Map());
    });
  });

  describe('findByAuthor', () => {
    it('deve listar só os reportes do autor, do mais novo ao mais antigo, com o filtro e a paginação', async () => {
      const authorId = await insertClient();
      const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);
      const oldest = await createReport(authorId, { changes: { createdAt: minutesAgo(30) } });
      const rejected = await createReport(authorId, {
        changes: { createdAt: minutesAgo(20), status: ReportStatus.REJECTED },
      });
      const newest = await createReport(authorId, { changes: { createdAt: minutesAgo(10) } });
      await createReport(await insertClient());

      const all = await reports.findByAuthor(authorId, { page: 1, pageSize: 20 }, {});
      const second = await reports.findByAuthor(authorId, { page: 2, pageSize: 1 }, {});
      const pending = await reports.findByAuthor(
        authorId,
        { page: 1, pageSize: 20 },
        { status: ReportStatus.PENDING },
      );

      expect(all.items.map(({ id }) => id)).toEqual([newest.id, rejected.id, oldest.id]);
      expect(all.total).toBe(3);
      expect(second).toMatchObject({ page: 2, pageSize: 1, total: 3 });
      expect(second.items.map(({ id }) => id)).toEqual([rejected.id]);
      expect(pending.items.map(({ id }) => id)).toEqual([newest.id, oldest.id]);
    });

    it('não deve ler as colunas das imagens', async () => {
      const authorId = await insertClient();
      await createReport(authorId);
      recorder.queries.length = 0;

      await reports.findByAuthor(authorId, { page: 1, pageSize: 20 }, {});
      await reports.findById(randomUUID());

      expect(recorder.queries.length).toBeGreaterThan(0);
      expect(queriesReadingImages()).toEqual([]);
    });
  });

  describe('findNearby (T3)', () => {
    it('deve trazer, de três pontos a 10 m, 400 m e 2 km, os dois no raio de 500 m, com a distância certa', async () => {
      const authorId = await insertClient();
      const far = await createReport(authorId, { meters: 2000 });
      const middle = await createReport(authorId, { meters: 400 });
      const near = await createReport(authorId, { meters: 10 });

      const result = await reports.findNearby(GeoPoint.create(CENTER), 500, 50);

      expect(result.map(({ report }) => report.id)).toEqual([near.id, middle.id]);
      expect(Math.abs(result[0].distanceMeters - 10)).toBeLessThanOrEqual(1);
      expect(Math.abs(result[1].distanceMeters - 400)).toBeLessThanOrEqual(1);
      expect(result.map(({ report }) => report.id)).not.toContain(far.id);
    });

    it('deve trazer só os reportes PENDING e CONFIRMED que não foram excluídos', async () => {
      const authorId = await insertClient();
      const pending = await createReport(authorId, { meters: 10 });
      const confirmed = await createReport(authorId, {
        meters: 20,
        changes: { status: ReportStatus.CONFIRMED },
      });
      await createReport(authorId, { meters: 30, changes: { status: ReportStatus.REJECTED } });
      const deleted = await createReport(authorId, { meters: 40 });
      deleted.delete(authorId);
      await reports.softDelete(deleted);

      const result = await reports.findNearby(GeoPoint.create(CENTER), 1000, 50);

      expect(result.map(({ report }) => report.id)).toEqual([pending.id, confirmed.id]);
    });

    it('deve respeitar o limite, trazendo os mais perto', async () => {
      const authorId = await insertClient();
      const nearest = await createReport(authorId, { meters: 5 });
      await createReport(authorId, { meters: 15 });

      const result = await reports.findNearby(GeoPoint.create(CENTER), 1000, 1);

      expect(result.map(({ report }) => report.id)).toEqual([nearest.id]);
    });

    it('não deve ler as colunas das imagens', async () => {
      const authorId = await insertClient();
      await createReport(authorId, { meters: 10 });
      recorder.queries.length = 0;

      await reports.findNearby(GeoPoint.create(CENTER), 500, 50);

      expect(recorder.queries.some(({ query }) => query.includes('MBRContains'))).toBe(true);
      expect(queriesReadingImages()).toEqual([]);
    });

    it('deve buscar sem o retângulo perto de um polo, sem errar', async () => {
      await expect(
        reports.findNearby(GeoPoint.create({ latitude: 89.99, longitude: 0 }), 5000, 50),
      ).resolves.toEqual([]);
      await expect(
        reports.findNearby(GeoPoint.create({ latitude: 0, longitude: 179.999 }), 5000, 50),
      ).resolves.toEqual([]);
    });
  });

  describe('plano da busca por proximidade', () => {
    /** Grade de reportes em volta de Campo Mourão, gravada direto no banco. */
    async function insertGrid(authorId: string, size: number): Promise<void> {
      const runner = dataSource.createQueryRunner();

      try {
        await runner.query('SET SESSION cte_max_recursion_depth = ?', [size]);
        await runner.query(
          `INSERT INTO reports (id, author_id, location, accuracy_meters)
             WITH RECURSIVE seq (n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ? - 1)
             SELECT UUID(), ?, ST_GeomFromText(
                      CONCAT('POINT(', -52.6 + (n % 100) * 0.0045, ' ', -24.25 + FLOOR(n / 100) * 0.008, ')'),
                      4326, 'axis-order=long-lat'), 9
               FROM seq`,
          [size, authorId],
        );
        await runner.query(
          `INSERT INTO report_photos (id, report_id, mime_type, width, height, size_bytes, content, thumbnail)
             SELECT UUID(), id, 'image/jpeg', 1, 1, 0, '', '' FROM reports WHERE author_id = ?`,
          [authorId],
        );
      } finally {
        await runner.release();
      }
    }

    // Fora da transação do teste: o ANALYZE TABLE confirma a transação aberta. Com poucas linhas,
    // o otimizador prefere ler a tabela inteira, que é mais barato. O índice vale com milhares de
    // reportes e as estatísticas em dia, que é o cenário montado aqui.
    it('deve usar o índice espacial com milhares de reportes', async () => {
      const authorId = await insertClient(dataSource.manager);
      const repository = new TypeOrmReportRepository(dataSource.getRepository(ReportOrmEntity));

      try {
        await insertGrid(authorId, 5000);
        await dataSource.query('ANALYZE TABLE reports, report_photos');
        recorder.queries.length = 0;

        const result = await repository.findNearby(GeoPoint.create(CENTER), 500, 50);

        const nearbyQuery = recorder.queries.find(({ query }) => query.includes('MBRContains'));
        const plan = await dataSource.query<Array<{ table: string; type: string; key: string }>>(
          `EXPLAIN FORMAT=TRADITIONAL ${nearbyQuery?.query ?? ''}`,
          nearbyQuery?.parameters,
        );
        expect(result.length).toBeGreaterThan(0);
        expect(plan.find(({ table }) => table === 'report')).toMatchObject({
          type: 'range',
          key: 'sidx_reports_location',
        });
      } finally {
        await dataSource.getRepository(ReportOrmEntity).delete({ authorId });
        await dataSource.getRepository(UserOrmEntity).delete({ id: authorId });
      }
    });
  });

  describe('countCreatedSince', () => {
    it('deve contar os reportes do autor desde a data, inclusive os excluídos', async () => {
      const authorId = await insertClient();
      await createReport(authorId, {
        changes: { createdAt: new Date(Date.now() - 25 * 3600_000) },
      });
      await createReport(authorId);
      const deleted = await createReport(authorId);
      deleted.delete(authorId);
      await reports.softDelete(deleted);
      await createReport(await insertClient());

      await expect(
        reports.countCreatedSince(authorId, new Date(Date.now() - 24 * 3600_000)),
      ).resolves.toBe(2);
    });
  });

  describe('pedidos simultâneos com a mesma Idempotency-Key', () => {
    // Fora da transação do teste: cada pedido precisa da própria conexão, como na API.
    it('deve gravar um reporte só e devolver o mesmo para os dois pedidos', async () => {
      const authorId = await insertClient(dataSource.manager);
      const sut = new OpenReportUseCase(
        new TypeOrmReportRepository(dataSource.getRepository(ReportOrmEntity)),
        TEST_REPORTS_CONFIG,
      );
      const input = {
        authorId,
        emailVerified: true,
        location: { ...CENTER, accuracyMeters: 5 },
        photo: {
          content: readFixture(JpegFixture.PHOTO),
          thumbnail: readFixture(JpegFixture.THUMBNAIL),
        },
        idempotencyKey: randomUUID(),
      };

      try {
        const results = await Promise.all([
          sut.execute(input),
          sut.execute(input),
          sut.execute(input),
        ]);

        expect(new Set(results.map(({ id }) => id)).size).toBe(1);
        await expect(dataSource.getRepository(ReportOrmEntity).countBy({ authorId })).resolves.toBe(
          1,
        );
      } finally {
        await dataSource.getRepository(ReportOrmEntity).delete({ authorId });
        await dataSource.getRepository(UserOrmEntity).delete({ id: authorId });
      }
    });
  });

  describe('votos simultâneos (RN40)', () => {
    // Fora da transação do teste: cada voto precisa da própria conexão, como na API.
    it('deve terminar 12 votos simultâneos com o limite em 10 com 10 confirmações, CONFIRMED e 2 recusas', async () => {
      const authorId = await insertClient(dataSource.manager);
      const voterIds = await Promise.all(
        Array.from({ length: 12 }, () => insertClient(dataSource.manager)),
      );
      const repository = new TypeOrmReportRepository(dataSource.getRepository(ReportOrmEntity));
      const sut = new VoteOnReportUseCase(repository, TEST_REPORTS_CONFIG);
      const report = openTestReport({ authorId });
      const photo = buildPhoto();

      try {
        await repository.create(report, photo);

        const results = await Promise.allSettled(
          voterIds.map((voterId) =>
            sut.execute({
              reportId: report.id,
              voterId,
              emailVerified: true,
              vote: ReportVoteType.CONFIRM,
              location: { ...pointNorthOf(CENTER, 40), accuracyMeters: 10 },
            }),
          ),
        );

        const fulfilled = results.filter((result) => result.status === 'fulfilled');
        const rejected = results.filter((result) => result.status === 'rejected');
        expect(fulfilled).toHaveLength(10);
        expect(rejected.map(({ reason }) => reason as unknown)).toEqual([
          expect.any(ReportNotInValidationError),
          expect.any(ReportNotInValidationError),
        ]);
        // Cada voto aceito viu uma contagem diferente: nenhum se perdeu.
        expect(
          fulfilled.map(({ value }) => value.votes.confirmations).sort((a, b) => a - b),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        // O status mudou uma vez só, no 10º voto.
        const transitions = fulfilled.filter(({ value }) => value.status !== ReportStatus.PENDING);
        expect(transitions.map(({ value }) => value.votes.confirmations)).toEqual([10]);
        await expect(repository.findById(report.id)).resolves.toMatchObject({
          status: ReportStatus.CONFIRMED,
          confirmationsCount: 10,
          rejectionsCount: 0,
        });
        await expect(
          dataSource.getRepository(ReportVoteOrmEntity).countBy({ reportId: report.id }),
        ).resolves.toBe(10);
      } finally {
        // Os votos e a foto saem junto com o reporte (ON DELETE CASCADE).
        await dataSource.getRepository(ReportOrmEntity).delete({ authorId });
        await dataSource.getRepository(UserOrmEntity).delete({ id: In([authorId, ...voterIds]) });
      }
    });
  });
});
