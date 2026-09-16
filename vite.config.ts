import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // Matches `engines.node`; every supported Node line can `require()` this ESM build.
    target: 'node20',
    sourcemap: true,
    minify: false,
    lib: { entry: { index: 'src/index.ts' }, formats: ['es'] },
    rollupOptions: {
      external: [/^node:/, 'typeorm', '@casl/ability', '@casl/ability/extra'],
      output: {
        // 1:1 with src, so the emitted .js tree matches the tsc-emitted .d.ts tree
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'test/helpers/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/suites/**/*.test.ts'],
          environment: 'node',
          // Starts the database selected by `DB` with Docker Compose (sqlite needs no Docker).
          globalSetup: ['./test/helpers/global-setup.ts'],
          setupFiles: ['./test/helpers/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
          // Every suite shares one database, so files run sequentially to keep the seed stable.
          fileParallelism: false,
          retry: Number(process.env.TEST_RETRIES ?? 0),
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
