import type { Request } from 'express';
import type {
  APIInterface,
  APIOptions,
  RecipeInterface,
  TypeInput,
} from 'supertokens-node/recipe/emailpassword/types';

type SignInPostInput = Parameters<NonNullable<APIInterface['signInPOST']>>[0];

/** Resposta do login enquanto o e-mail está bloqueado por tentativas (RN17). */
export const LOGIN_LOCKED_MESSAGE = 'Muitas tentativas. Tente novamente em alguns minutos.';

/** Tentativa de login já respondida, como o override a entrega para o registro (RN19). */
export interface SignInAttempt {
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  succeeded: boolean;
}

/** Regras da aplicação que o SuperTokens precisa consultar. Vêm do módulo `users`. */
export interface SuperTokensHooks {
  /**
   * Chamado antes de a senha ser conferida. Retornar true recusa o login sem conferi-la: o
   * e-mail está bloqueado por tentativas (RN17).
   */
  isLoginLocked(email: string): Promise<boolean>;
  /** Chamado depois de o login ser respondido, com sucesso ou não, para registrá-lo (RN19). */
  recordLoginAttempt(attempt: SignInAttempt): Promise<void>;
  /**
   * Chamado depois de a senha ser conferida. Retornar false recusa o login (RN09).
   * Também é o ponto de entrada da segunda etapa, quando o MFA existir.
   */
  authorizeSignIn(userId: string): Promise<boolean>;
  /** Retorna a mensagem da violação da política de senha (RN08), ou null quando ela é válida. */
  checkPasswordPolicy(password: string): Promise<string | null>;
}

/**
 * Só o sign-in, o refresh e o sign-out ficam ativos (RN16). Uma rota desativada não é
 * atendida pelo middleware e cai no 404 do Nest.
 *
 * - sign-up: o CLIENT se cadastra pelo `POST /api/clients` e o ADMIN é convidado (RN05, RN06);
 * - `signup/email/exists`: permitiria descobrir quais e-mails têm conta;
 * - reset de senha: a recuperação é feita pelas rotas de `/api/password-resets`, com o token
 *   em `user_tokens` (RN20). No reset nativo, um link novo não invalida os anteriores.
 *
 * O sign-in ganha o bloqueio por tentativas (RN17): antes de a senha ser conferida, o e-mail
 * bloqueado recebe um `GENERAL_ERROR`, igual para e-mail com ou sem conta. Depois, a tentativa
 * é registrada (RN19). O login recusado pelo bloqueio não é registrado, para não entrar na
 * conta. O e-mail fora do formato (`FIELD_ERROR`) é recusado pelo SuperTokens antes de chegar
 * aqui, e também não gera registro.
 *
 * O override fica na API `signInPOST`, e não na função `signIn`, porque só a API tem a
 * requisição (IP e user agent) e é chamada uma única vez por login, com ou sem conta.
 */
export function overrideEmailPasswordApis(
  hooks: Pick<SuperTokensHooks, 'isLoginLocked' | 'recordLoginAttempt'>,
): (original: APIInterface) => APIInterface {
  return (original) => {
    // O SuperTokens resolve a implementação original pelo `this`, então ela segue ligada a ele.
    const signInPOST = original.signInPOST?.bind(original);

    return {
      ...original,
      signInPOST:
        signInPOST &&
        (async (input) => {
          const email = readEmail(input);

          if (email === undefined) {
            return signInPOST(input);
          }

          if (await hooks.isLoginLocked(email)) {
            return { status: 'GENERAL_ERROR', message: LOGIN_LOCKED_MESSAGE };
          }

          const result = await signInPOST(input);
          await hooks.recordLoginAttempt({
            email,
            ipAddress: readClientIp(input.options),
            userAgent: input.options.req.getHeaderValue('user-agent') ?? null,
            // Qualquer resposta que não abre a sessão é uma falha, inclusive a recusa da RN09.
            succeeded: result.status === 'OK',
          });

          return result;
        }),
      signUpPOST: undefined,
      emailExistsGET: undefined,
      generatePasswordResetTokenPOST: undefined,
      passwordResetPOST: undefined,
    };
  };
}

/** O SuperTokens já conferiu que o campo `email` é um texto antes de chamar a API. */
function readEmail(input: SignInPostInput): string | undefined {
  const value = input.formFields.find((field) => field.id === 'email')?.value;

  return typeof value === 'string' ? value : undefined;
}

/**
 * IP do cliente, lido da requisição do Express (`framework: 'express'`). O `ip` já considera
 * o `trust proxy`, configurado no `configureApp`.
 */
function readClientIp(options: APIOptions): string | null {
  return (options.req.original as Request).ip ?? null;
}

/**
 * Depois de o SuperTokens conferir a senha, consulta o MySQL e recusa quem não pode entrar
 * (INACTIVE, PENDING, excluído ou sem cadastro na aplicação). A resposta é a mesma da senha
 * incorreta, para não revelar se o e-mail existe (RN09).
 *
 * O override fica na função `signIn`, e não na API `signInPOST`, porque a sessão só é criada
 * depois dela: um login recusado aqui não chega a gerar tokens.
 */
export function overrideEmailPasswordFunctions(
  hooks: Pick<SuperTokensHooks, 'authorizeSignIn'>,
): (original: RecipeInterface) => RecipeInterface {
  return (original) => ({
    ...original,
    async signIn(input) {
      const result = await original.signIn(input);

      if (result.status !== 'OK') {
        return result;
      }

      if (!(await hooks.authorizeSignIn(result.user.id))) {
        return { status: 'WRONG_CREDENTIALS_ERROR' };
      }

      return result;
    },
  });
}

/**
 * Aplica a política de senha (RN08) no campo `password`. O SuperTokens usa esse validador
 * nas rotas de cadastro e de reset (desativadas) e no `updateEmailOrPassword` com
 * `applyPasswordPolicy`. O sign-in não o usa: uma senha antiga pode não seguir a política atual.
 */
export function buildPasswordField(
  hooks: Pick<SuperTokensHooks, 'checkPasswordPolicy'>,
): NonNullable<NonNullable<TypeInput['signUpFeature']>['formFields']>[number] {
  return {
    id: 'password',
    validate: async (value: unknown) => {
      if (typeof value !== 'string') {
        return 'A senha é obrigatória.';
      }

      return (await hooks.checkPasswordPolicy(value)) ?? undefined;
    },
  };
}
