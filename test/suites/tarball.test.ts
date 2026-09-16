import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIME_DEPENDENCIES = ['typeorm', '@casl/ability'];

/**
 * Builds and packs the package, installs the tarball into a scratch project and imports it the way
 * consumers do. Needs no database, so it runs in the default sqlite integration run.
 */
describe('published tarball', () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'casl-typeorm-tarball-'));
    execFileSync('pnpm', ['build'], { cwd: repoRoot, stdio: 'ignore' });
    const packed = JSON.parse(
      execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], { cwd: repoRoot, encoding: 'utf8' }),
    ) as Array<{ filename: string }>;
    const tarball = path.join(scratch, packed[0]!.filename);

    writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ name: 'scratch', private: true }));
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=peer', tarball], {
      cwd: scratch,
      stdio: 'ignore',
    });
    // Peer dependencies come from the repository's own node_modules instead of the registry.
    for (const dependency of RUNTIME_DEPENDENCIES) {
      const target = path.join(scratch, 'node_modules', dependency);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(path.join(repoRoot, 'node_modules', dependency), target, 'dir');
    }
  }, 120_000);

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('exposes the public API to ESM and CommonJS consumers', () => {
    const esm = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import * as m from '@cookiemonsterdev/casl-typeorm'; console.log(Object.keys(m).sort().join(','))",
      ],
      { cwd: scratch, encoding: 'utf8' },
    ).trim();
    const cjs = execFileSync(
      process.execPath,
      ['-e', "const m = require('@cookiemonsterdev/casl-typeorm'); console.log(Object.keys(m).sort().join(','))"],
      { cwd: scratch, encoding: 'utf8' },
    ).trim();

    expect(esm.split(',')).toEqual(
      expect.arrayContaining(['accessibleBy', 'accessibleRecords', 'createTypeOrmAbility', 'typeormQueryMatcher']),
    );
    expect(cjs).toBe(esm);
  });

  it('only imports declared runtime dependencies, node: modules or relative files', () => {
    const dist = path.join(scratch, 'node_modules', '@cookiemonsterdev', 'casl-typeorm', 'dist');
    const specifiers = new Set<string>();
    for (const file of readdirSync(dist).filter((name) => name.endsWith('.js'))) {
      const source = readFileSync(path.join(dist, file), 'utf8');
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) specifiers.add(match[1]!);
    }
    const external = [...specifiers].filter(
      (specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:'),
    );
    for (const specifier of external) {
      expect(
        RUNTIME_DEPENDENCIES.some((dependency) => specifier === dependency || specifier.startsWith(`${dependency}/`)),
      ).toBe(true);
    }
  });
});
