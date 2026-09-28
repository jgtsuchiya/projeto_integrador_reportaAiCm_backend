import { buildSuperTokensConfig, SUPERTOKENS_API_BASE_PATH } from './supertokens.config';

describe('buildSuperTokensConfig', () => {
  const env = {
    SUPERTOKENS_CONNECTION_URI: 'http://localhost:3567',
    SUPERTOKENS_API_KEY: 'reportaai-dev-supertokens-api-key',
    API_DOMAIN: 'http://localhost:3000',
    WEB_APP_URL: 'http://localhost:5173',
  };
  const hooks = {
    authorizeSignIn: jest.fn(),
    checkPasswordPolicy: jest.fn(),
  };

  it('deve conectar ao Core com a URI e a chave de API do ambiente', () => {
    const config = buildSuperTokensConfig(env, hooks);

    expect(config.framework).toBe('express');
    expect(config.supertokens).toEqual({
      connectionURI: env.SUPERTOKENS_CONNECTION_URI,
      apiKey: env.SUPERTOKENS_API_KEY,
    });
  });

  it('deve expor as rotas nativas em /api/auth, com os domínios da API e do painel web', () => {
    const config = buildSuperTokensConfig(env, hooks);

    expect(SUPERTOKENS_API_BASE_PATH).toBe('/api/auth');
    expect(config.appInfo).toMatchObject({
      apiDomain: env.API_DOMAIN,
      websiteDomain: env.WEB_APP_URL,
      apiBasePath: SUPERTOKENS_API_BASE_PATH,
    });
  });

  it('deve registrar as receitas EmailPassword, Session e UserRoles', () => {
    const config = buildSuperTokensConfig(env, hooks);

    expect(config.recipeList).toHaveLength(3);
  });
});
