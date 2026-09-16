import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveComposeFile } from './db';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = resolveComposeFile();

function compose(args: string[]): void {
  execFileSync('docker', ['compose', '-f', composeFile!, ...args], { cwd: repoRoot, stdio: 'inherit' });
}

export async function setup(): Promise<void> {
  if (!composeFile || process.env.DB_EXTERNAL === '1') return;
  compose(['up', '--wait', '--wait-timeout', '300']);
}

export async function teardown(): Promise<void> {
  if (!composeFile || process.env.DB_EXTERNAL === '1' || process.env.DO_NOT_STOP === '1') return;
  compose(['down', '--remove-orphans', '--volumes']);
}
