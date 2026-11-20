import { InvalidReportDescriptionError } from '../errors/invalid-report-description.error';
import { REPORT_DESCRIPTION_MAX_LENGTH, ReportDescription } from './report-description';

describe('ReportDescription', () => {
  it('deve guardar a descrição sem os espaços das pontas', () => {
    const sut = ReportDescription.create('  Buraco grande na faixa da direita.\n');

    expect(sut?.value).toBe('Buraco grande na faixa da direita.');
  });

  it.each(['', '   ', '\n\t'])('deve devolver null para o texto vazio %p', (raw) => {
    expect(ReportDescription.create(raw)).toBeNull();
  });

  it('deve aceitar até 500 caracteres', () => {
    const raw = 'a'.repeat(REPORT_DESCRIPTION_MAX_LENGTH);

    expect(ReportDescription.create(raw)?.value).toBe(raw);
  });

  it('deve recusar mais de 500 caracteres', () => {
    expect(() => ReportDescription.create('a'.repeat(501))).toThrow(
      new InvalidReportDescriptionError(REPORT_DESCRIPTION_MAX_LENGTH),
    );
  });

  it('deve contar um emoji como um caractere, como o VARCHAR do MySQL', () => {
    const raw = '🕳'.repeat(REPORT_DESCRIPTION_MAX_LENGTH);

    expect(raw.length).toBe(REPORT_DESCRIPTION_MAX_LENGTH * 2);
    expect(ReportDescription.create(raw)?.value).toBe(raw);
    expect(() => ReportDescription.create(`${raw}🕳`)).toThrow(InvalidReportDescriptionError);
  });

  it('deve recusar um texto enorme', () => {
    expect(() => ReportDescription.create('a'.repeat(2_000_000))).toThrow(
      'A descrição deve ter no máximo 500 caracteres.',
    );
  });

  it('deve ser igual a outra descrição com o mesmo texto', () => {
    const sut = ReportDescription.create('Buraco');
    const other = ReportDescription.create(' Buraco ') ?? undefined;

    expect(sut?.equals(other)).toBe(true);
  });
});
