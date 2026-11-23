import { ArgumentMetadata, BadRequestException } from '@nestjs/common';

import { encodeBase64 } from '@shared/application/encoding/base64';
import { VALIDATION_ERROR_MESSAGE } from '@shared/presentation/pipes/zod-validation.pipe';

import {
  JpegFixture,
  OtherFormatFixture,
  readFixture,
  TEST_REPORTS_CONFIG,
} from '../../testing/report-fixtures';
import { EditReportBodyPipe, OpenReportBodyPipe } from './report-body.pipe';

const METADATA: ArgumentMetadata = { type: 'body' };

describe('OpenReportBodyPipe', () => {
  const sut = new OpenReportBodyPipe(TEST_REPORTS_CONFIG);
  const body = {
    location: { latitude: -24.045812, longitude: -52.378901, accuracyMeters: 8.5 },
    photo: {
      content: encodeBase64(readFixture(JpegFixture.PHOTO)),
      thumbnail: encodeBase64(readFixture(JpegFixture.THUMBNAIL)),
    },
  };

  it('deve devolver o corpo com as imagens em bytes', async () => {
    const result = await sut.transform(body, METADATA);

    expect(result.photo.content).toEqual(readFixture(JpegFixture.PHOTO));
  });

  it('deve responder 400 no formato das outras rotas, com o campo de cada imagem', async () => {
    const invalid = {
      ...body,
      photo: { content: encodeBase64(readFixture(OtherFormatFixture.PNG)), thumbnail: '' },
    };

    const error = (await sut.transform(invalid, METADATA).catch((e: unknown) => e)) as
      BadRequestException | undefined;

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getResponse()).toEqual({
      message: VALIDATION_ERROR_MESSAGE,
      details: [
        { field: 'photo.content', message: 'A foto precisa ser uma imagem JPEG.' },
        { field: 'photo.thumbnail', message: 'A miniatura precisa ser uma imagem JPEG.' },
      ],
    });
  });

  it('deve usar os limites das imagens da configuração', async () => {
    const pipe = new OpenReportBodyPipe({
      ...TEST_REPORTS_CONFIG,
      imageLimits: { photoMaxBytes: 1024, thumbnailMaxBytes: 102400 },
    });

    await expect(pipe.transform(body, METADATA)).rejects.toMatchObject({
      response: { details: [{ field: 'photo.content', message: 'A foto passa de 1 KB.' }] },
    });
  });
});

describe('EditReportBodyPipe', () => {
  const sut = new EditReportBodyPipe(TEST_REPORTS_CONFIG);

  it('deve aceitar só a descrição', async () => {
    await expect(sut.transform({ description: 'Nova' }, METADATA)).resolves.toEqual({
      description: 'Nova',
    });
  });

  it('deve exigir a descrição ou a foto', async () => {
    await expect(sut.transform({}, METADATA)).rejects.toMatchObject({
      response: { details: [{ field: 'body', message: 'Informe a descrição ou a foto.' }] },
    });
  });
});
