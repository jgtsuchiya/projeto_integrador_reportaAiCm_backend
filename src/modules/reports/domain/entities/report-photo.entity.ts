import { Entity } from '@shared/domain/entity';

import {
  photoRules,
  ReportImage,
  ReportImageLimits,
  thumbnailRules,
} from '../value-objects/report-image';

/** Dados da foto que acompanham o reporte nas respostas, sem as imagens. */
export interface ReportPhotoInfo {
  id: string;
  width: number;
  height: number;
}

interface CreateReportPhotoInput {
  /** A foto, com o maior lado de até 2048 px. */
  content: Uint8Array;
  /** A miniatura, com o maior lado de até 480 px. */
  thumbnail: Uint8Array;
}

interface ReportPhotoProps {
  content: ReportImage;
  thumbnail: ReportImage;
  createdAt: Date;
}

/**
 * Foto do reporte (RN29): a imagem e a miniatura geradas pelo app, conferidas e sem os
 * metadados. A foto não muda: a troca cria outra, com outro id, que o app usa como chave do cache.
 */
export class ReportPhoto extends Entity {
  private constructor(private readonly props: ReportPhotoProps) {
    super();
  }

  static create(input: CreateReportPhotoInput, limits: ReportImageLimits): ReportPhoto {
    return new ReportPhoto({
      content: ReportImage.create(input.content, photoRules(limits)),
      thumbnail: ReportImage.create(input.thumbnail, thumbnailRules(limits)),
      createdAt: new Date(),
    });
  }

  get content(): ReportImage {
    return this.props.content;
  }

  get thumbnail(): ReportImage {
    return this.props.thumbnail;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get mimeType(): string {
    return this.props.content.mimeType;
  }

  /** Largura da foto. A miniatura tem a mesma proporção. */
  get width(): number {
    return this.props.content.width;
  }

  get height(): number {
    return this.props.content.height;
  }

  /** Tamanho da foto, depois da remoção dos metadados. */
  get sizeBytes(): number {
    return this.props.content.sizeBytes;
  }

  get info(): ReportPhotoInfo {
    return { id: this.id, width: this.width, height: this.height };
  }
}
