// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Regras de fronteira entre camadas (ver docs/ARCHITECTURE.md).
 * Cada camada só pode depender das camadas mais internas.
 */
const ORM_IMPORTS = ['typeorm', '@nestjs/typeorm'];

const layerBoundaries = [
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ORM_IMPORTS.map((name) => ({
            name,
            message: 'O domínio não pode depender do ORM.',
          })),
          patterns: [
            {
              group: ['**/application/**', '**/infra/**', '**/presentation/**'],
              message: 'O domínio não pode depender de application, infra ou presentation.',
            },
            {
              group: ['@nestjs/*'],
              message: 'O domínio deve ser TypeScript puro, sem dependência do NestJS.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ORM_IMPORTS.map((name) => ({
            name,
            message: 'A aplicação não pode depender do ORM; use os contratos do domínio.',
          })),
          patterns: [
            {
              group: ['**/infra/**', '**/presentation/**'],
              message: 'A aplicação não pode depender de infra ou presentation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/presentation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ORM_IMPORTS.map((name) => ({
            name,
            message: 'A apresentação não pode depender do ORM.',
          })),
          patterns: [
            {
              group: ['**/infra/**'],
              message: 'A apresentação deve chamar casos de uso, não a infra diretamente.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**'],
              message: 'A infra não pode depender da camada de apresentação.',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // Promises sem await/tratamento escondem erros em runtime.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Tipagem explícita nas fronteiras públicas (controllers, use cases, repositórios).
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Casos de uso implementam UseCase.execute(): Promise<T>, mesmo sem await.
      '@typescript-eslint/require-await': 'off',

      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        // Propriedades de objetos podem seguir formatos externos (headers, colunas, JSON).
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        { selector: 'import', format: null },
      ],

      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
      'prefer-const': 'error',
    },
  },
  ...layerBoundaries,
);
