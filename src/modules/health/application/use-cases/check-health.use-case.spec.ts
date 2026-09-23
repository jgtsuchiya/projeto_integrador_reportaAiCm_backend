import { CheckHealthUseCase } from './check-health.use-case';

describe('CheckHealthUseCase', () => {
  let sut: CheckHealthUseCase;

  beforeEach(() => {
    sut = new CheckHealthUseCase();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deve retornar status ok', async () => {
    const result = await sut.execute();

    expect(result.status).toBe('ok');
  });

  it('deve retornar o timestamp atual em formato ISO 8601', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

    const result = await sut.execute();

    expect(result.timestamp).toBe('2026-01-15T12:00:00.000Z');
  });
});
