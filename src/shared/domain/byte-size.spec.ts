import { formatByteSize } from './byte-size';

describe('formatByteSize', () => {
  it.each([
    [2 * 1024 * 1024, '2 MB'],
    [100 * 1024, '100 KB'],
    [1536 * 1024, '1,5 MB'],
    [2949124, '2,8 MB'],
    [1024, '1 KB'],
    [512, '512 bytes'],
    [1, '1 byte'],
    [0, '0 bytes'],
  ])('deve formatar %i bytes como %p', (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected);
  });

  it('deve cortar a casa decimal, sem arredondar para cima', () => {
    expect(formatByteSize(2 * 1024 * 1024 - 1)).toBe('1,9 MB');
  });
});
