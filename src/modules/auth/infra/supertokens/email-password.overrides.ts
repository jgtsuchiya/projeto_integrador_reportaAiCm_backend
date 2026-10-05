import type {
  APIInterface,
  RecipeInterface,
  TypeInput,
} from 'supertokens-node/recipe/emailpassword/types';

/** Regras da aplicação que o SuperTokens precisa consultar. Vêm do módulo `users`. */
export interface SuperTokensHooks {
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
 * - reset de senha: fora do escopo da sprint.
 */
export function overrideEmailPasswordApis(original: APIInterface): APIInterface {
  return {
    ...original,
    signUpPOST: undefined,
    emailExistsGET: undefined,
    generatePasswordResetTokenPOST: undefined,
    passwordResetPOST: undefined,
  };
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
