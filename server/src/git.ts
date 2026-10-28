import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_LFS_SKIP_SMUDGE: '1',
};

export async function git(args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: options.cwd,
    timeout: options.timeout ?? 30_000,
    maxBuffer: 64 * 1024 * 1024,
    env: GIT_ENV,
  });
  return stdout;
}
