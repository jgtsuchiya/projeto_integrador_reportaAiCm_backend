import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';
import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';
import { Role } from '@modules/users/domain/value-objects/role';
import { encodeBase64 } from '@shared/application/encoding/base64';
import type { Page } from '@shared/domain/pagination';
import { RequestHeader } from '@shared/presentation/decorators/request-header.decorator';

import type { ReportOutput } from '../../application/dtos/report.output';
import { DeleteReportUseCase } from '../../application/use-cases/delete-report.use-case';
import { EditReportUseCase } from '../../application/use-cases/edit-report.use-case';
import { GetReportPhotoUseCase } from '../../application/use-cases/get-report-photo.use-case';
import { GetReportUseCase } from '../../application/use-cases/get-report.use-case';
import { ListMyReportsUseCase } from '../../application/use-cases/list-my-reports.use-case';
import {
  ListNearbyReportsUseCase,
  NearbyReportsOutput,
} from '../../application/use-cases/list-nearby-reports.use-case';
import { OpenReportUseCase } from '../../application/use-cases/open-report.use-case';
import {
  type EditReportBody,
  idempotencyKeySchema,
  type ListMyReportsQuery,
  listMyReportsQuerySchema,
  type NearbyReportsQuery,
  nearbyReportsQuerySchema,
  type OpenReportBody,
  type ReportPhotoQuery,
  reportPhotoQuerySchema,
  type ReportPhotoResponse,
} from '../dtos/report.dto';
import { EditReportBodyPipe, OpenReportBodyPipe } from '../pipes/report-body.pipe';

/**
 * Reportes de buracos, só para o CLIENT: ADMIN e SUPER_ADMIN recebem 403. A listagem para a
 * prefeitura entra com o painel. O app envia e recebe a foto em base64, e os casos de uso
 * trabalham com os bytes.
 *
 * `mine` e `nearby` são declaradas antes de `:id`, para não serem lidas como um id.
 */
@Roles(Role.CLIENT)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly openReportUseCase: OpenReportUseCase,
    private readonly listMyReportsUseCase: ListMyReportsUseCase,
    private readonly listNearbyReportsUseCase: ListNearbyReportsUseCase,
    private readonly getReportUseCase: GetReportUseCase,
    private readonly getReportPhotoUseCase: GetReportPhotoUseCase,
    private readonly editReportUseCase: EditReportUseCase,
    private readonly deleteReportUseCase: DeleteReportUseCase,
  ) {}

  /**
   * Abre o reporte (RN26 a RN32). Com uma `Idempotency-Key` que o autor já usou, responde o
   * reporte já criado, sem criar outro.
   */
  @Post()
  open(
    @Body(OpenReportBodyPipe) body: OpenReportBody,
    @RequestHeader('Idempotency-Key', { schema: idempotencyKeySchema })
    idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReportOutput> {
    return this.openReportUseCase.execute({
      ...body,
      authorId: user.id,
      emailVerified: user.emailVerified,
      idempotencyKey,
    });
  }

  /** Os reportes do usuário, em qualquer status, do mais novo ao mais antigo. */
  @Get('mine')
  listMine(
    @Query({ schema: listMyReportsQuerySchema }) query: ListMyReportsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Page<ReportOutput>> {
    return this.listMyReportsUseCase.execute({ ...query, userId: user.id });
  }

  /** Os reportes PENDING e CONFIRMED perto de um ponto, do mais perto ao mais longe, até 50. */
  @Get('nearby')
  listNearby(
    @Query({ schema: nearbyReportsQuerySchema }) query: NearbyReportsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NearbyReportsOutput> {
    return this.listNearbyReportsUseCase.execute({ ...query, userId: user.id });
  }

  @Get(':id')
  findOne(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReportOutput> {
    return this.getReportUseCase.execute({ reportId: id, userId: user.id });
  }

  /** A foto inteira (padrão) ou a miniatura, com o conteúdo em base64. */
  @Get(':id/photo')
  async findPhoto(
    @Param('id', { schema: z.uuid() }) id: string,
    @Query({ schema: reportPhotoQuerySchema }) query: ReportPhotoQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReportPhotoResponse> {
    const photo = await this.getReportPhotoUseCase.execute({
      reportId: id,
      userId: user.id,
      size: query.size,
    });

    return { id: photo.id, mimeType: photo.mimeType, content: encodeBase64(photo.content) };
  }

  /** O autor troca a descrição e a foto, enquanto o reporte está em validação e sem votos (RN33). */
  @Patch(':id')
  edit(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body(EditReportBodyPipe) body: EditReportBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReportOutput> {
    return this.editReportUseCase.execute({ ...body, reportId: id, userId: user.id });
  }

  /** Exclusão lógica pelo autor, enquanto o reporte está em validação (RN34). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.deleteReportUseCase.execute({ reportId: id, userId: user.id });
  }
}
