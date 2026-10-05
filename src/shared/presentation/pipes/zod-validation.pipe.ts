import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

// Mensagens padrão do Zod em português. Os schemas podem sobrescrever com mensagens próprias.
z.config(z.locales.ptBR());

export const VALIDATION_ERROR_MESSAGE = 'Dados inválidos.';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Valida body, params e query com o schema Zod informado no decorator da rota.
 * Registrado como pipe global, então basta passar o schema:
 *
 * ```ts
 * create(@Body({ schema: createClientSchema }) body: CreateClientBody)
 * findOne(@Param('id', { schema: z.uuid() }) id: string)
 * list(@Query({ schema: pageRequestSchema }) query: PageRequest)
 * ```
 *
 * Devolve o valor já transformado pelo schema (coerções, defaults, `trim` etc.).
 * Parâmetros sem schema passam sem alteração.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { schema } = metadata;
    if (!(schema instanceof z.ZodType)) {
      return value;
    }

    const result = await schema.safeParseAsync(value);
    if (!result.success) {
      throw new BadRequestException({
        message: VALIDATION_ERROR_MESSAGE,
        details: result.error.issues.map((issue) => toDetail(issue, metadata)),
      });
    }

    return result.data;
  }
}

/**
 * O campo é o caminho do erro dentro do valor validado, prefixado pelo nome do
 * parâmetro quando o decorator recebe um (`@Param('id')` → `id`). Um erro na
 * raiz de um `@Body()` inteiro vira `body`.
 */
function toDetail(issue: z.core.$ZodIssue, metadata: ArgumentMetadata): ValidationErrorDetail {
  const path = [metadata.data, ...issue.path.map(String)].filter(Boolean);

  return {
    field: path.length > 0 ? path.join('.') : metadata.type,
    message: issue.message,
  };
}
