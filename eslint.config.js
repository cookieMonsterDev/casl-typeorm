import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'scripts/**'],
  },
  js.configs.recommended,
  {
    files: ['{src,test}/**/*.ts', 'vite.config.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Tests and fixtures are type-checked by test/tsconfig.json, which the root tsconfig excludes.
        project: ['./tsconfig.json', './test/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // Config files run under Node without type information.
    files: ['*.js', '*.mjs', '*.cjs'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['**/*.test.ts', 'test/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-commented-out-tests': 'error',
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectTypeOf', 'expectSame*'] }],
      'vitest/no-standalone-expect': [
        'error',
        { additionalTestBlockFunctions: ['testIfDb', 'testIfSql', 'testIfMongo'] },
      ],
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Helpers build gated `it` variants (e.g. `it.skipIf(...)`); they are not tests themselves.
    files: ['test/helpers/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'vitest/expect-expect': 'off',
      'vitest/valid-title': 'off',
      'vitest/valid-describe-callback': 'off',
    },
  },
  prettierConfig,
);
