import type { LoggerService } from '@nestjs/common';

/**
 * Guarda tudo o que a API escreveria no log, para os testes conferirem que um segredo (a senha
 * ou o token de um link) não aparece nele: `createNestApplication({ logger })`.
 */
export class MemoryLogger implements LoggerService {
  readonly lines: string[] = [];

  log = (...args: unknown[]): void => this.write(args);
  error = (...args: unknown[]): void => this.write(args);
  warn = (...args: unknown[]): void => this.write(args);
  debug = (...args: unknown[]): void => this.write(args);
  verbose = (...args: unknown[]): void => this.write(args);
  fatal = (...args: unknown[]): void => this.write(args);

  private write(args: unknown[]): void {
    this.lines.push(
      args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
    );
  }
}
