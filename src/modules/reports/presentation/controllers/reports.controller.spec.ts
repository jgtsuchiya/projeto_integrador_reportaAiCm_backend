import { Test } from '@nestjs/testing';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';
import { encodeBase64 } from '@shared/application/encoding/base64';

import type { ReportOutput } from '../../application/dtos/report.output';
import { ReportsConfig } from '../../application/reports.config';
import { DeleteReportUseCase } from '../../application/use-cases/delete-report.use-case';
import { EditReportUseCase } from '../../application/use-cases/edit-report.use-case';
import { GetReportPhotoUseCase } from '../../application/use-cases/get-report-photo.use-case';
import { GetReportUseCase } from '../../application/use-cases/get-report.use-case';
import { ListMyReportsUseCase } from '../../application/use-cases/list-my-reports.use-case';
import { ListNearbyReportsUseCase } from '../../application/use-cases/list-nearby-reports.use-case';
import { OpenReportUseCase } from '../../application/use-cases/open-report.use-case';
import { VoteOnReportUseCase } from '../../application/use-cases/vote-on-report.use-case';
import { TEST_REPORTS_CONFIG } from '../../testing/report-fixtures';
import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  let sut: ReportsController;
  let openReportUseCase: jest.Mocked<OpenReportUseCase>;
  let listMyReportsUseCase: jest.Mocked<ListMyReportsUseCase>;
  let listNearbyReportsUseCase: jest.Mocked<ListNearbyReportsUseCase>;
  let getReportUseCase: jest.Mocked<GetReportUseCase>;
  let getReportPhotoUseCase: jest.Mocked<GetReportPhotoUseCase>;
  let editReportUseCase: jest.Mocked<EditReportUseCase>;
  let deleteReportUseCase: jest.Mocked<DeleteReportUseCase>;
  let voteOnReportUseCase: jest.Mocked<VoteOnReportUseCase>;

  const REPORT_ID = '8f0e2c4a-6b1d-4c7e-9a52-3d6f1e0b7a91';
  const user: AuthenticatedUser = {
    id: 'client-1',
    role: 'CLIENT',
    sessionHandle: 'session-1',
    emailVerified: true,
  };
  const report = { id: REPORT_ID } as ReportOutput;
  const photoBytes = { content: new Uint8Array([1]), thumbnail: new Uint8Array([2]) };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: OpenReportUseCase, useValue: { execute: jest.fn() } },
        { provide: ListMyReportsUseCase, useValue: { execute: jest.fn() } },
        { provide: ListNearbyReportsUseCase, useValue: { execute: jest.fn() } },
        { provide: GetReportUseCase, useValue: { execute: jest.fn() } },
        { provide: GetReportPhotoUseCase, useValue: { execute: jest.fn() } },
        { provide: EditReportUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteReportUseCase, useValue: { execute: jest.fn() } },
        { provide: VoteOnReportUseCase, useValue: { execute: jest.fn() } },
        // Os pipes do corpo recebem os limites das imagens pela configuração.
        { provide: ReportsConfig, useValue: TEST_REPORTS_CONFIG },
      ],
    }).compile();

    sut = moduleRef.get(ReportsController);
    openReportUseCase = moduleRef.get(OpenReportUseCase);
    listMyReportsUseCase = moduleRef.get(ListMyReportsUseCase);
    listNearbyReportsUseCase = moduleRef.get(ListNearbyReportsUseCase);
    getReportUseCase = moduleRef.get(GetReportUseCase);
    getReportPhotoUseCase = moduleRef.get(GetReportPhotoUseCase);
    editReportUseCase = moduleRef.get(EditReportUseCase);
    deleteReportUseCase = moduleRef.get(DeleteReportUseCase);
    voteOnReportUseCase = moduleRef.get(VoteOnReportUseCase);
  });

  it('deve abrir o reporte com o autor, o e-mail verificado e a chave do usuário da sessão', async () => {
    openReportUseCase.execute.mockResolvedValue(report);
    const body = {
      description: 'Buraco',
      location: { latitude: -24, longitude: -52, accuracyMeters: 5 },
      photo: photoBytes,
    };

    await expect(sut.open(body, 'chave-1', user)).resolves.toBe(report);
    expect(openReportUseCase.execute).toHaveBeenCalledWith({
      ...body,
      authorId: 'client-1',
      emailVerified: true,
      idempotencyKey: 'chave-1',
    });
  });

  it('deve listar os reportes do usuário da sessão', async () => {
    const page = { items: [report], page: 1, pageSize: 20, total: 1 };
    listMyReportsUseCase.execute.mockResolvedValue(page);

    await expect(sut.listMine({ page: 1, pageSize: 20 }, user)).resolves.toBe(page);
    expect(listMyReportsUseCase.execute).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      userId: 'client-1',
    });
  });

  it('deve listar os reportes perto do ponto', async () => {
    listNearbyReportsUseCase.execute.mockResolvedValue({ items: [] });
    const query = { latitude: -24, longitude: -52, radiusMeters: 30 };

    await expect(sut.listNearby(query, user)).resolves.toEqual({ items: [] });
    expect(listNearbyReportsUseCase.execute).toHaveBeenCalledWith({ ...query, userId: 'client-1' });
  });

  it('deve buscar o reporte para o usuário da sessão', async () => {
    getReportUseCase.execute.mockResolvedValue(report);

    await expect(sut.findOne(REPORT_ID, user)).resolves.toBe(report);
    expect(getReportUseCase.execute).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      userId: 'client-1',
    });
  });

  it('deve responder a imagem da foto em base64', async () => {
    const content = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    getReportPhotoUseCase.execute.mockResolvedValue({
      id: 'photo-1',
      mimeType: 'image/jpeg',
      content,
    });

    const result = await sut.findPhoto(REPORT_ID, { size: 'thumbnail' }, user);

    expect(result).toEqual({
      id: 'photo-1',
      mimeType: 'image/jpeg',
      content: encodeBase64(content),
    });
    expect(getReportPhotoUseCase.execute).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      userId: 'client-1',
      size: 'thumbnail',
    });
  });

  it('deve editar o reporte para o usuário da sessão', async () => {
    editReportUseCase.execute.mockResolvedValue(report);

    await expect(sut.edit(REPORT_ID, { description: '' }, user)).resolves.toBe(report);
    expect(editReportUseCase.execute).toHaveBeenCalledWith({
      description: '',
      reportId: REPORT_ID,
      userId: 'client-1',
    });
  });

  it('deve excluir o reporte para o usuário da sessão', async () => {
    deleteReportUseCase.execute.mockResolvedValue();

    await expect(sut.remove(REPORT_ID, user)).resolves.toBeUndefined();
    expect(deleteReportUseCase.execute).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      userId: 'client-1',
    });
  });

  it('deve votar com o usuário da sessão e o e-mail verificado dele', async () => {
    voteOnReportUseCase.execute.mockResolvedValue(report);
    const body = {
      vote: 'DENY' as const,
      location: { latitude: -24, longitude: -52, accuracyMeters: 12 },
    };

    await expect(sut.vote(REPORT_ID, body, { ...user, emailVerified: false })).resolves.toBe(
      report,
    );
    expect(voteOnReportUseCase.execute).toHaveBeenCalledWith({
      ...body,
      reportId: REPORT_ID,
      voterId: 'client-1',
      emailVerified: false,
    });
  });
});
