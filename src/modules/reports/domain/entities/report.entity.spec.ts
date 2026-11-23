import {
  buildPhoto,
  CAMPO_MOURAO_AREA,
  JpegFixture,
  openTestReport,
  withReportChanges,
} from '../../testing/report-fixtures';
import { InaccurateLocationError } from '../errors/inaccurate-location.error';
import { LocationOutsideAreaError } from '../errors/location-outside-area.error';
import { OwnReportVoteError } from '../errors/own-report-vote.error';
import { ReportAuthorOnlyError } from '../errors/report-author-only.error';
import { ReportHasVotesError } from '../errors/report-has-votes.error';
import { ReportNotDeletableError } from '../errors/report-not-deletable.error';
import { ReportNotEditableError } from '../errors/report-not-editable.error';
import { ReportNotFoundError } from '../errors/report-not-found.error';
import { ReportNotInValidationError } from '../errors/report-not-in-validation.error';
import { GeoLocation } from '../value-objects/geo-location';
import { ReportDescription } from '../value-objects/report-description';
import { ReportStatus } from '../value-objects/report-status';
import { ReportVoteType, VoteThresholds } from '../value-objects/report-vote-type';
import { ReportVote } from './report-vote.entity';
import { Report } from './report.entity';

const AUTHOR = 'author-1';
const OTHER = 'client-2';
/** Os padrões de `REPORT_CONFIRMATIONS_REQUIRED` e `REPORT_REJECTIONS_REQUIRED`. */
const THRESHOLDS: VoteThresholds = { confirmationsRequired: 10, rejectionsRequired: 10 };

/** Votos de `count` eleitores diferentes, do tipo informado. */
function castVotes(report: Report, type: ReportVoteType, count: number, first = 1): void {
  for (let voter = first; voter < first + count; voter++) {
    report.registerVote(`voter-${voter}`, type, THRESHOLDS);
  }
}

describe('Report', () => {
  describe('open', () => {
    it('deve nascer PENDING, com as contagens zeradas e os dados da abertura', () => {
      const photo = buildPhoto();

      const sut = openTestReport({ authorId: AUTHOR, photo, idempotencyKey: 'chave-1' });

      expect(sut).toMatchObject({
        authorId: AUTHOR,
        status: ReportStatus.PENDING,
        confirmationsCount: 0,
        rejectionsCount: 0,
        idempotencyKey: 'chave-1',
        statusChangedAt: null,
        deletedAt: null,
        isDeleted: false,
        hasVotes: false,
      });
      expect(sut.description?.value).toBe('Buraco na faixa da direita.');
      expect(sut.location).toMatchObject({ latitude: -24.045812, accuracyMeters: 9 });
      expect(sut.photo).toEqual(photo.info);
      expect(sut.updatedAt).toEqual(sut.createdAt);
    });

    it('deve aceitar o reporte sem descrição', () => {
      const sut = openTestReport({ description: '   ' });

      expect(sut.description).toBeNull();
    });

    it('deve recusar a localização fora de Campo Mourão', () => {
      expect(() =>
        openTestReport({ location: { latitude: -25.4284, longitude: -49.2733 } }),
      ).toThrow(LocationOutsideAreaError);
    });

    it('deve recusar a localização imprecisa', () => {
      expect(() => openTestReport({ location: { accuracyMeters: 51 } })).toThrow(
        InaccurateLocationError,
      );
    });

    it('deve conferir a localização pela área informada', () => {
      const input = {
        authorId: AUTHOR,
        description: null,
        location: GeoLocation.create({ latitude: -24, longitude: -52.4, accuracyMeters: 5 }),
        photo: buildPhoto(),
        idempotencyKey: null,
        area: CAMPO_MOURAO_AREA,
      };
      const ensureAccepts = jest.spyOn(CAMPO_MOURAO_AREA, 'ensureAccepts');

      Report.open(input);

      expect(ensureAccepts).toHaveBeenCalledWith(input.location);
    });
  });

  describe('restore', () => {
    it('deve reconstruir o reporte com os mesmos dados, sem compartilhar a foto', () => {
      const report = openTestReport();
      const photo = report.photo;

      const sut = withReportChanges(report, { photo });
      photo.width = 1;

      expect(sut.id).toBe(report.id);
      expect(sut.photo.width).toBe(160);
    });

    it('deve devolver uma cópia da foto, que não altera o reporte', () => {
      const sut = openTestReport();

      sut.photo.id = 'outro-id';

      expect(sut.photo.id).not.toBe('outro-id');
    });
  });

  describe('visibilidade (RN35)', () => {
    it.each([
      [ReportStatus.PENDING, true],
      [ReportStatus.CONFIRMED, true],
      [ReportStatus.REJECTED, false],
    ])('deve mostrar o reporte %s aos outros cidadãos: %p', (status, visible) => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });

      expect(sut.isVisibleTo(OTHER)).toBe(visible);
      expect(sut.isVisibleTo(AUTHOR)).toBe(true);
    });

    it('não deve mostrar o reporte excluído a ninguém', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.delete(AUTHOR);

      expect(sut.isVisibleTo(AUTHOR)).toBe(false);
      expect(sut.isVisibleTo(OTHER)).toBe(false);
    });
  });

  describe('o que cada usuário pode fazer', () => {
    it('deve deixar o autor editar e excluir o reporte em validação e sem votos', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      expect(sut.isAuthor(AUTHOR)).toBe(true);
      expect(sut.canBeEditedBy(AUTHOR)).toBe(true);
      expect(sut.canBeDeletedBy(AUTHOR)).toBe(true);
    });

    it('não deve deixar os outros cidadãos editar nem excluir', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      expect(sut.isAuthor(OTHER)).toBe(false);
      expect(sut.canBeEditedBy(OTHER)).toBe(false);
      expect(sut.canBeDeletedBy(OTHER)).toBe(false);
    });

    it('deve deixar o autor excluir, mas não editar, o reporte com votos', () => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), {
        rejectionsCount: 1,
      });

      expect(sut.hasVotes).toBe(true);
      expect(sut.canBeEditedBy(AUTHOR)).toBe(false);
      expect(sut.canBeDeletedBy(AUTHOR)).toBe(true);
    });

    it.each([ReportStatus.CONFIRMED, ReportStatus.REJECTED])(
      'não deve deixar o autor editar nem excluir o reporte %s',
      (status) => {
        const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });

        expect(sut.canBeEditedBy(AUTHOR)).toBe(false);
        expect(sut.canBeDeletedBy(AUTHOR)).toBe(false);
      },
    );

    it('não deve deixar ninguém editar nem excluir o reporte excluído', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.delete(AUTHOR);

      expect(sut.canBeEditedBy(AUTHOR)).toBe(false);
      expect(sut.canBeDeletedBy(AUTHOR)).toBe(false);
    });
  });

  describe('edit', () => {
    it('deve trocar a descrição e a data da alteração', () => {
      const sut = openTestReport({ authorId: AUTHOR, description: 'Antes' });
      const before = sut.updatedAt;
      jest.useFakeTimers({ now: before.getTime() + 1000 });

      sut.edit(AUTHOR, ReportDescription.create('Depois'));
      jest.useRealTimers();

      expect(sut.description?.value).toBe('Depois');
      expect(sut.updatedAt.getTime()).toBe(before.getTime() + 1000);
    });

    it('deve apagar a descrição com null', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.edit(AUTHOR, null);

      expect(sut.description).toBeNull();
    });

    it('deve recusar a edição de quem não é o autor', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      expect(() => sut.edit(OTHER, null)).toThrow(ReportAuthorOnlyError);
    });

    it.each([ReportStatus.CONFIRMED, ReportStatus.REJECTED])(
      'deve recusar a edição do reporte %s',
      (status) => {
        const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });

        expect(() => sut.edit(AUTHOR, null)).toThrow(ReportNotEditableError);
      },
    );

    it('deve recusar a edição do reporte que já recebeu um voto', () => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), {
        confirmationsCount: 1,
      });

      expect(() => sut.edit(AUTHOR, null)).toThrow(ReportHasVotesError);
    });

    it('deve recusar a edição do reporte excluído', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      sut.delete(AUTHOR);

      expect(() => sut.edit(AUTHOR, null)).toThrow(ReportNotFoundError);
    });
  });

  describe('replacePhoto', () => {
    it('deve trocar a foto por outra, com outro id', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      const photo = buildPhoto(JpegFixture.PROGRESSIVE);

      sut.replacePhoto(AUTHOR, photo);

      expect(sut.photo).toEqual({ id: photo.id, width: 200, height: 150 });
    });

    it('deve seguir as mesmas regras da edição', () => {
      const withVotes = withReportChanges(openTestReport({ authorId: AUTHOR }), {
        confirmationsCount: 2,
      });

      expect(() => openTestReport({ authorId: AUTHOR }).replacePhoto(OTHER, buildPhoto())).toThrow(
        ReportAuthorOnlyError,
      );
      expect(() => withVotes.replacePhoto(AUTHOR, buildPhoto())).toThrow(ReportHasVotesError);
    });
  });

  describe('delete', () => {
    it('deve marcar a exclusão lógica com a data da alteração', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.delete(AUTHOR);

      expect(sut.isDeleted).toBe(true);
      expect(sut.deletedAt).toEqual(sut.updatedAt);
    });

    it('deve excluir o reporte com votos, enquanto ele está em validação', () => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), {
        confirmationsCount: 3,
      });

      sut.delete(AUTHOR);

      expect(sut.isDeleted).toBe(true);
    });

    it('deve recusar a exclusão de quem não é o autor', () => {
      expect(() => openTestReport({ authorId: AUTHOR }).delete(OTHER)).toThrow(
        ReportAuthorOnlyError,
      );
    });

    it.each([ReportStatus.CONFIRMED, ReportStatus.REJECTED])(
      'deve recusar a exclusão do reporte %s',
      (status) => {
        const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });

        expect(() => sut.delete(AUTHOR)).toThrow(ReportNotDeletableError);
      },
    );

    it('deve recusar a exclusão do reporte já excluído', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      sut.delete(AUTHOR);

      expect(() => sut.delete(AUTHOR)).toThrow(ReportNotFoundError);
    });
  });
  describe('validação comunitária', () => {
    it('deve deixar os outros cidadãos votar no reporte em validação, mas não o autor', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      expect(sut.canBeVotedBy(OTHER)).toBe(true);
      expect(sut.canBeVotedBy(AUTHOR)).toBe(false);
    });

    it.each([ReportStatus.CONFIRMED, ReportStatus.REJECTED])(
      'não deve deixar ninguém votar no reporte %s',
      (status) => {
        const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });

        expect(sut.canBeVotedBy(OTHER)).toBe(false);
      },
    );

    it('não deve deixar ninguém votar no reporte excluído', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      sut.delete(AUTHOR);

      expect(sut.canBeVotedBy(OTHER)).toBe(false);
      expect(() => sut.registerVote(OTHER, ReportVoteType.CONFIRM, THRESHOLDS)).toThrow(
        ReportNotFoundError,
      );
    });

    it('deve somar a confirmação, mudar a data da alteração e devolver o voto', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      const before = sut.updatedAt;
      jest.useFakeTimers({ now: before.getTime() + 1000 });

      const vote = sut.registerVote(OTHER, ReportVoteType.CONFIRM, THRESHOLDS);
      jest.useRealTimers();

      expect(vote).toBeInstanceOf(ReportVote);
      expect(vote).toMatchObject({
        reportId: sut.id,
        voterId: OTHER,
        type: ReportVoteType.CONFIRM,
        createdAt: sut.updatedAt,
      });
      expect(sut).toMatchObject({
        status: ReportStatus.PENDING,
        confirmationsCount: 1,
        rejectionsCount: 0,
        statusChangedAt: null,
        hasVotes: true,
      });
      expect(sut.updatedAt.getTime()).toBe(before.getTime() + 1000);
    });

    it('deve somar o voto "não está lá" só nas rejeições', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.registerVote(OTHER, ReportVoteType.DENY, THRESHOLDS);

      expect(sut).toMatchObject({ confirmationsCount: 0, rejectionsCount: 1 });
    });

    it('deve continuar em validação com 9 confirmações e virar CONFIRMED na 10ª', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      castVotes(sut, ReportVoteType.CONFIRM, 9);
      expect(sut.status).toBe(ReportStatus.PENDING);

      sut.registerVote('voter-10', ReportVoteType.CONFIRM, THRESHOLDS);

      expect(sut).toMatchObject({ status: ReportStatus.CONFIRMED, confirmationsCount: 10 });
      expect(sut.statusChangedAt).toEqual(sut.updatedAt);
      expect(sut.isVisibleTo(OTHER)).toBe(true);
    });

    it('deve recusar o voto seguinte ao CONFIRMED, sem mudar as contagens', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      castVotes(sut, ReportVoteType.CONFIRM, 10);
      const statusChangedAt = sut.statusChangedAt;

      expect(() => sut.registerVote('voter-11', ReportVoteType.DENY, THRESHOLDS)).toThrow(
        ReportNotInValidationError,
      );
      expect(sut).toMatchObject({
        status: ReportStatus.CONFIRMED,
        confirmationsCount: 10,
        rejectionsCount: 0,
        statusChangedAt,
      });
    });

    it('deve virar REJECTED com 10 votos "não está lá" e sumir para os outros cidadãos', () => {
      const sut = openTestReport({ authorId: AUTHOR });
      castVotes(sut, ReportVoteType.CONFIRM, 9);

      castVotes(sut, ReportVoteType.DENY, 10, 10);

      expect(sut).toMatchObject({
        status: ReportStatus.REJECTED,
        confirmationsCount: 9,
        rejectionsCount: 10,
      });
      expect(sut.statusChangedAt).not.toBeNull();
      expect(sut.isVisibleTo(OTHER)).toBe(false);
      expect(sut.isVisibleTo(AUTHOR)).toBe(true);
    });

    it('deve valer o limite do tipo votado: as rejeições acima do limite não confirmam', () => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), { rejectionsCount: 12 });

      sut.registerVote(OTHER, ReportVoteType.CONFIRM, THRESHOLDS);

      expect(sut.status).toBe(ReportStatus.PENDING);
      sut.registerVote('voter-2', ReportVoteType.DENY, THRESHOLDS);
      expect(sut.status).toBe(ReportStatus.REJECTED);
    });

    it('deve usar os limites informados', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.registerVote(OTHER, ReportVoteType.CONFIRM, {
        confirmationsRequired: 1,
        rejectionsRequired: 10,
      });

      expect(sut.status).toBe(ReportStatus.CONFIRMED);
    });

    it('deve recusar o voto do autor, que não conta como confirmação', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      expect(() => sut.registerVote(AUTHOR, ReportVoteType.CONFIRM, THRESHOLDS)).toThrow(
        OwnReportVoteError,
      );
      expect(sut.confirmationsCount).toBe(0);
    });

    it('deve recusar o voto do autor no próprio reporte já confirmado pelo motivo do autor', () => {
      const sut = withReportChanges(openTestReport({ authorId: AUTHOR }), {
        status: ReportStatus.CONFIRMED,
      });

      expect(() => sut.ensureCanBeVotedBy(AUTHOR)).toThrow(OwnReportVoteError);
      expect(() => sut.ensureCanBeVotedBy(OTHER)).toThrow(ReportNotInValidationError);
    });

    it('deve impedir a edição depois do primeiro voto, mas não a exclusão', () => {
      const sut = openTestReport({ authorId: AUTHOR });

      sut.registerVote(OTHER, ReportVoteType.DENY, THRESHOLDS);

      expect(sut.canBeEditedBy(AUTHOR)).toBe(false);
      expect(sut.canBeDeletedBy(AUTHOR)).toBe(true);
      expect(() => sut.edit(AUTHOR, null)).toThrow(ReportHasVotesError);
    });
  });
});
