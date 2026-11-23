import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Env } from '@config/env.schema';

import { ReportsConfig } from './application/reports.config';
import { DeleteReportUseCase } from './application/use-cases/delete-report.use-case';
import { EditReportUseCase } from './application/use-cases/edit-report.use-case';
import { GetReportPhotoUseCase } from './application/use-cases/get-report-photo.use-case';
import { GetReportUseCase } from './application/use-cases/get-report.use-case';
import { ListMyReportsUseCase } from './application/use-cases/list-my-reports.use-case';
import { ListNearbyReportsUseCase } from './application/use-cases/list-nearby-reports.use-case';
import { OpenReportUseCase } from './application/use-cases/open-report.use-case';
import { VoteOnReportUseCase } from './application/use-cases/vote-on-report.use-case';
import { ReportPhotoRepository } from './domain/repositories/report-photo.repository';
import { ReportRepository } from './domain/repositories/report.repository';
import { ReportPhotoOrmEntity } from './infra/database/entities/report-photo.orm-entity';
import { ReportVoteOrmEntity } from './infra/database/entities/report-vote.orm-entity';
import { ReportOrmEntity } from './infra/database/entities/report.orm-entity';
import { TypeOrmReportPhotoRepository } from './infra/database/repositories/typeorm-report-photo.repository';
import { TypeOrmReportRepository } from './infra/database/repositories/typeorm-report.repository';
import { ReportsController } from './presentation/controllers/reports.controller';

/**
 * Reportes de buracos (docs/sprints/sprint-4-reportes.md). Fala com o módulo users só pelo
 * `AuthenticatedUser` do guard, que traz o papel e o `emailVerified`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ReportOrmEntity, ReportPhotoOrmEntity, ReportVoteOrmEntity])],
  controllers: [ReportsController],
  providers: [
    OpenReportUseCase,
    ListMyReportsUseCase,
    ListNearbyReportsUseCase,
    GetReportUseCase,
    GetReportPhotoUseCase,
    EditReportUseCase,
    DeleteReportUseCase,
    VoteOnReportUseCase,
    { provide: ReportRepository, useClass: TypeOrmReportRepository },
    { provide: ReportPhotoRepository, useClass: TypeOrmReportPhotoRepository },
    {
      provide: ReportsConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ReportsConfig => ({
        areaBounds: config.get('REPORT_AREA_BOUNDS', { infer: true }),
        maxAccuracyMeters: config.get('REPORT_MAX_ACCURACY_METERS', { infer: true }),
        imageLimits: {
          photoMaxBytes: config.get('REPORT_PHOTO_MAX_BYTES', { infer: true }),
          thumbnailMaxBytes: config.get('REPORT_THUMBNAIL_MAX_BYTES', { infer: true }),
        },
        dailyLimit: config.get('REPORT_DAILY_LIMIT', { infer: true }),
        confirmationsRequired: config.get('REPORT_CONFIRMATIONS_REQUIRED', { infer: true }),
        rejectionsRequired: config.get('REPORT_REJECTIONS_REQUIRED', { infer: true }),
        voteMaxDistanceMeters: config.get('REPORT_VOTE_MAX_DISTANCE_METERS', { infer: true }),
      }),
    },
  ],
})
export class ReportsModule {}
