import { HttpException, HttpStatus } from '@nestjs/common';
import express from 'express';
import request from 'supertest';

import {
  createJsonBodyParser,
  createUrlencodedBodyParser,
  INVALID_JSON_MESSAGE,
  toHttpException,
  UNREADABLE_BODY_MESSAGE,
} from './body-parser.middleware';

/** App do Express que devolve o corpo lido, ou o erro que o parser passou adiante. */
function createApp(...parsers: express.RequestHandler[]): express.Express {
  const app = express();
  app.use(...parsers);
  app.post('/', (req, res) => {
    res.json({ body: req.body as unknown });
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: unknown) => {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    res.status(status).json({
      isHttpException: error instanceof HttpException,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return app;
}

describe('createJsonBodyParser', () => {
  it('deve ler o JSON dentro do limite', async () => {
    const response = await request(createApp(createJsonBodyParser(1024)))
      .post('/')
      .send({ description: 'Buraco' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: { description: 'Buraco' } });
  });

  it('deve recusar o corpo acima do limite com o 413, com o limite na mensagem', async () => {
    const response = await request(createApp(createJsonBodyParser(1024)))
      .post('/')
      .send({ content: 'a'.repeat(2048) });

    expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.body).toEqual({
      isHttpException: true,
      message: 'O corpo da requisição passa do limite de 1 KB.',
    });
  });

  it('deve recusar o JSON malformado com o 400, sem repetir o corpo na mensagem', async () => {
    const response = await request(createApp(createJsonBodyParser(1024)))
      .post('/')
      .set('content-type', 'application/json')
      .send('{"photo": "/9j/4AAQ');

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    expect(response.body).toEqual({ isHttpException: true, message: INVALID_JSON_MESSAGE });
  });

  it('deve deixar o corpo já lido para o parser seguinte não ler de novo', async () => {
    const response = await request(createApp(createJsonBodyParser(4096), createJsonBodyParser(16)))
      .post('/')
      .send({ content: 'a'.repeat(100) });

    expect(response.status).toBe(200);
  });
});

describe('createUrlencodedBodyParser', () => {
  it('deve ler o formulário', async () => {
    const response = await request(createApp(createUrlencodedBodyParser(1024)))
      .post('/')
      .type('form')
      .send('name=Maria');

    expect(response.body).toEqual({ body: { name: 'Maria' } });
  });
});

describe('toHttpException', () => {
  it.each(['charset.unsupported', 'encoding.unsupported'])(
    'deve converter o erro %s no 415',
    (type) => {
      const result = toHttpException({ type, status: 415 }, 1024);

      expect(result).toBeInstanceOf(HttpException);
      expect((result as HttpException).getStatus()).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    },
  );

  it('deve converter os outros erros 4xx do parser, com uma mensagem fixa', () => {
    const result = toHttpException({ type: 'request.aborted', status: 400 }, 1024);

    expect(result).toBeInstanceOf(HttpException);
    expect((result as HttpException).getStatus()).toBe(400);
    expect((result as HttpException).message).toBe(UNREADABLE_BODY_MESSAGE);
  });

  it.each([
    ['um erro 5xx do parser', { type: 'stream.not.readable', status: 500 }],
    ['um erro que não é do parser', new Error('outro erro')],
  ])('deve devolver %s sem alteração', (_case, error) => {
    expect(toHttpException(error, 1024)).toBe(error);
  });
});
