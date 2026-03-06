import { execSync, exec as execCb, ExecSyncOptions } from 'child_process';
import * as logger from './logger';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command synchronously and return the output.
 * Throws on non-zero exit code unless `ignoreError` is true.
 */
export function execSync_(
  command: string,
  options?: ExecSyncOptions & { ignoreError?: boolean }
): string {
  const { ignoreError, ...execOptions } = options || {};
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      ...execOptions,
    });
    return (result?.toString() || '').trim();
  } catch (err: any) {
    if (ignoreError) {
      return err.stdout?.toString().trim() || '';
    }
    throw err;
  }
}

/**
 * Execute a command asynchronously.
 */
export function execAsync(
  command: string,
  cwd?: string
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execCb(command, { cwd, encoding: 'utf-8' }, (error, stdout, stderr) => {
      resolve({
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        exitCode: error ? error.code || 1 : 0,
      });
    });
  });
}

/**
 * Check if a command exists on the system.
 */
export function commandExists(cmd: string): boolean {
  try {
    const checkCmd = process.platform === 'win32'
      ? `where ${cmd}`
      : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version of a command, or null if not found.
 */
export function getCommandVersion(cmd: string, versionFlag = '--version'): string | null {
  try {
    const output = execSync_(`${cmd} ${versionFlag}`, { ignoreError: true });
    // Extract version-like pattern
    const match = output.match(/(\d+\.\d+[\.\d]*)/);
    return match ? match[1] : output.split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Run a command and stream output to console (for long-running tasks).
 */
export function execStream(
  command: string,
  cwd?: string,
  silent = false
): Promise<number> {
  return new Promise((resolve) => {
    const child = execCb(command, { cwd, encoding: 'utf-8' });

    if (!silent && !logger.isJsonMode()) {
      child.stdout?.on('data', (data) => process.stdout.write(data));
      child.stderr?.on('data', (data) => process.stderr.write(data));
    }

    child.on('close', (code) => resolve(code || 0));
    child.on('error', () => resolve(1));
  });
}
