import { DuplicateIdempotencyKeyError } from '../../domain/errors/duplicate-idempotency-key.error';
import { EmailVerificationRequiredError } from '../../domain/errors/email-verification-required.error';
import { InaccurateLocationError } from '../../domain/errors/inaccurate-location.error';
import { InvalidReportImageError } from '../../domain/errors/invalid-report-image.error';
import { LocationOutsideAreaError } from '../../domain/errors/location-outside-area.error';
import { ReportDailyLimitError } from '../../domain/errors/report-daily-limit.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import {
  buildPhoto,
  CENTER,
  JpegFixture,
  openTestReport,
  OtherFormatFixture,
  readFixture,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '../../testing/report-fixtures';
import { ReportsConfig } from '../reports.config';
import { OpenReportInput, OpenReportUseCase, REPORT_DAILY_WINDOW_MS } from './open-report.use-case';

const AUTHOR = 'client-1';
const KEY = '8f0e2c4a-6b1d-4c7e-9a52-3d6f1e0b7a91';

describe('OpenReportUseCase', () => {
  let database: InMemoryReportsDatabase;
  let repository: InMemoryReportRepository;
  let sut: OpenReportUseCase;

  function createSut(config: ReportsConfig = TEST_REPORTS_CONFIG): OpenReportUseCase {
    return new OpenReportUseCase(repository, config);
  }

  beforeEach(() => {
    database = new InMemoryReportsDatabase();
    repository = new InMemoryReportRepository(database);
    sut = createSut();
  });

  function buildInput(overrides: Partial<OpenReportInput> = {}): OpenReportInput {
    return {
      authorId: AUTHOR,
      emailVerified: true,
      description: '  Buraco grande perto do semáforo.  ',
      location: { ...CENTER, accuracyMeters: 8.5 },
      photo: {
        content: readFixture(JpegFixture.PHOTO),
        thumbnail: readFixture(JpegFixture.THUMBNAIL),
      },
      ...overrides,
    };
  }

  /** Grava reportes do autor, como se tivessem sido abertos antes. */
  async function seedReports(count: number, createdAt = new Date()): Promise<void> {
    for (let index = 0; index < count; index++) {
      const report = withReportChanges(openTestReport({ authorId: AUTHOR }), { createdAt });
      await repository.create(report, buildPhoto());
    }
  }

  it('deve abrir o reporte PENDING, com as contagens zeradas, no formato do plano', async () => {
    const result = await sut.execute(buildInput());

    expect(result).toEqual({
      id: expect.any(String) as string,
      status: ReportStatus.PENDING,
      description: 'Buraco grande perto do semáforo.',
      location: { ...CENTER, accuracyMeters: 9 },
      photo: { id: expect.any(String) as string, width: 160, height: 120 },
      votes: { confirmations: 0, rejections: 0, confirmationsRequired: 10, rejectionsRequired: 10 },
      isMine: true,
      canEdit: true,
      canDelete: true,
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
      statusChangedAt: null,
    });
    expect(database.reports.get(result.id)).toMatchObject({ authorId: AUTHOR });
    expect(database.photos.get(result.id)?.id).toBe(result.photo.id);
  });

  it('deve gravar a foto sem os metadados', async () => {
    const content = readFixture(JpegFixture.WITH_METADATA);

    const result = await sut.execute(
      buildInput({ photo: { content, thumbnail: readFixture(JpegFixture.THUMBNAIL) } }),
    );

    const stored = database.photos.get(result.id);
    expect(stored?.content.sizeBytes).toBeLessThan(content.length);
    expect(Buffer.from(stored?.content.bytes ?? []).toString('latin1')).not.toContain('GPS');
  });

  it.each([undefined, null, '', '   '])(
    'deve abrir o reporte sem descrição quando ela é %p',
    async (description) => {
      const result = await sut.execute(buildInput({ description }));

      expect(result.description).toBeNull();
    },
  );

  it('deve guardar a Idempotency-Key no reporte', async () => {
    const result = await sut.execute(buildInput({ idempotencyKey: KEY }));

    expect(database.reports.get(result.id)?.idempotencyKey).toBe(KEY);
  });

  describe('recusas', () => {
    it('deve recusar o Client com o e-mail não verificado, sem gravar', async () => {
      await expect(sut.execute(buildInput({ emailVerified: false }))).rejects.toThrow(
        EmailVerificationRequiredError,
      );
      expect(database.reports.size).toBe(0);
    });

    it('deve recusar a localização fora de Campo Mourão', async () => {
      const input = buildInput({
        location: { latitude: -25.4284, longitude: -49.2733, accuracyMeters: 5 },
      });

      await expect(sut.execute(input)).rejects.toThrow(LocationOutsideAreaError);
    });

    it('deve recusar a localização imprecisa', async () => {
      const input = buildInput({ location: { ...CENTER, accuracyMeters: 50.5 } });

      await expect(sut.execute(input)).rejects.toThrow(InaccurateLocationError);
    });

    it('deve usar a precisão da configuração', async () => {
      const config = { ...TEST_REPORTS_CONFIG, maxAccuracyMeters: 5 };

      await expect(createSut(config).execute(buildInput())).rejects.toThrow(
        InaccurateLocationError,
      );
    });

    it('deve recusar a imagem que não é JPEG, mesmo sem passar pela validação da rota', async () => {
      const input = buildInput({
        photo: {
          content: readFixture(OtherFormatFixture.PNG),
          thumbnail: readFixture(JpegFixture.THUMBNAIL),
        },
      });

      await expect(sut.execute(input)).rejects.toThrow(InvalidReportImageError);
    });
  });

  describe('limite por dia (RN30)', () => {
    it('deve recusar o 11º reporte em 24 horas, com o limite na mensagem', async () => {
      await seedReports(10);

      await expect(sut.execute(buildInput())).rejects.toThrow(
        'Você chegou ao limite de 10 reportes por dia.',
      );
    });

    it('deve contar os reportes excluídos', async () => {
      await seedReports(9);
      const deleted = openTestReport({ authorId: AUTHOR });
      deleted.delete(AUTHOR);
      await repository.create(deleted, buildPhoto());

      await expect(sut.execute(buildInput())).rejects.toThrow(ReportDailyLimitError);
    });

    it('não deve contar os reportes de mais de 24 horas nem os de outro autor', async () => {
      await seedReports(10, new Date(Date.now() - REPORT_DAILY_WINDOW_MS - 1000));
      await repository.create(openTestReport({ authorId: 'client-2' }), buildPhoto());

      await expect(sut.execute(buildInput())).resolves.toMatchObject({ isMine: true });
    });

    it('deve usar o limite da configuração', async () => {
      await seedReports(2);

      await expect(
        createSut({ ...TEST_REPORTS_CONFIG, dailyLimit: 2 }).execute(buildInput()),
      ).rejects.toThrow('Você chegou ao limite de 2 reportes por dia.');
    });
  });

  describe('envio repetido (RN31)', () => {
    it('deve devolver o mesmo reporte para a mesma Idempotency-Key, sem criar outro', async () => {
      const first = await sut.execute(buildInput({ idempotencyKey: KEY }));

      const second = await sut.execute(buildInput({ idempotencyKey: KEY }));

      expect(second.id).toBe(first.id);
      expect(database.reports.size).toBe(1);
    });

    it('não deve contar o pedido repetido no limite por dia', async () => {
      const limited = createSut({ ...TEST_REPORTS_CONFIG, dailyLimit: 1 });
      const first = await limited.execute(buildInput({ idempotencyKey: KEY }));

      await expect(limited.execute(buildInput({ idempotencyKey: KEY }))).resolves.toMatchObject({
        id: first.id,
      });
    });

    it('não deve misturar a chave de autores diferentes', async () => {
      const first = await sut.execute(buildInput({ idempotencyKey: KEY }));

      const other = await sut.execute(buildInput({ authorId: 'client-2', idempotencyKey: KEY }));

      expect(other.id).not.toBe(first.id);
      expect(other.isMine).toBe(true);
      expect(database.reports.size).toBe(2);
    });

    it('deve responder 404 quando o reporte da chave foi excluído, sem abrir outro', async () => {
      const first = await sut.execute(buildInput({ idempotencyKey: KEY }));
      database.reports.get(first.id)?.delete(AUTHOR);

      await expect(sut.execute(buildInput({ idempotencyKey: KEY }))).rejects.toThrow(
        ReportNotFoundError,
      );
      expect(database.reports.size).toBe(1);
    });

    it('deve devolver o reporte do pedido simultâneo que gravou a mesma chave antes', async () => {
      const winner = await sut.execute(buildInput({ idempotencyKey: KEY }));
      // O segundo pedido buscou a chave antes de o primeiro gravar: não achou nada.
      jest.spyOn(repository, 'findByIdempotencyKey').mockResolvedValueOnce(null);

      const result = await sut.execute(buildInput({ idempotencyKey: KEY }));

      expect(result.id).toBe(winner.id);
      expect(database.reports.size).toBe(1);
    });

    it('deve repassar a colisão quando o reporte da chave não aparece na nova busca', async () => {
      jest.spyOn(repository, 'create').mockRejectedValue(new DuplicateIdempotencyKeyError());

      await expect(sut.execute(buildInput({ idempotencyKey: KEY }))).rejects.toThrow(
        DuplicateIdempotencyKeyError,
      );
    });

    it('deve repassar os outros erros da gravação, com ou sem a chave', async () => {
      const failure = new Error('falha no banco');
      jest.spyOn(repository, 'create').mockRejectedValue(failure);

      await expect(sut.execute(buildInput({ idempotencyKey: KEY }))).rejects.toBe(failure);
      await expect(sut.execute(buildInput())).rejects.toBe(failure);
    });
  });
});
