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
    // Use 2>&1 to capture stderr (e.g. `java -version` writes to stderr)
    const output = execSync_(`${cmd} ${versionFlag} 2>&1`, { ignoreError: true });
    // If output contains "not found" or is empty, the command doesn't exist
    if (!output || /not found|No such file/i.test(output)) {
      return null;
    }
    // Extract version-like pattern
    const match = output.match(/(\d+\.\d+[\.\d]*)/);
    return match ? match[1] : null;
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

/**
 * Result from execStreamCapture — includes exit code and captured output.
 */
export interface StreamCaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Combined stdout + stderr in order received */
  combined: string;
}

/**
 * Run a command, stream output to console (unless silent), and capture all output.
 * Used when we need both real-time streaming AND the full output for parsing.
 */
export function execStreamCapture(
  command: string,
  cwd?: string,
  silent = false
): Promise<StreamCaptureResult> {
  return new Promise((resolve) => {
    const child = execCb(command, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large builds
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const combinedChunks: string[] = [];

    child.stdout?.on('data', (data: string) => {
      stdoutChunks.push(data);
      combinedChunks.push(data);
      if (!silent && !logger.isJsonMode()) {
        process.stdout.write(data);
      }
    });

    child.stderr?.on('data', (data: string) => {
      stderrChunks.push(data);
      combinedChunks.push(data);
      if (!silent && !logger.isJsonMode()) {
        process.stderr.write(data);
      }
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code || 0,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        combined: combinedChunks.join(''),
      });
    });

    child.on('error', () => {
      resolve({
        exitCode: 1,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        combined: combinedChunks.join(''),
      });
    });
  });
}

/**
 * Resolve the Android SDK root directory by checking (in order):
 * 1. ANDROID_HOME / ANDROID_SDK_ROOT environment variables
 * 2. local.properties sdk.dir in the given project directory
 * 3. Common default installation paths per platform
 *
 * Returns the path if found, or null.
 */
export function resolveAndroidSdk(projectDir?: string): string | null {
  const fs = require('fs');
  const path = require('path');

  // 1. Environment variables
  const envSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (envSdk && fs.existsSync(envSdk)) return envSdk;

  // 2. local.properties in project
  if (projectDir) {
    const localProps = path.join(projectDir, 'local.properties');
    if (fs.existsSync(localProps)) {
      const content = fs.readFileSync(localProps, 'utf-8');
      const match = content.match(/sdk\.dir\s*=\s*(.+)/);
      if (match) {
        const sdkDir = match[1].trim().replace(/\\\\/g, '/');
        if (fs.existsSync(sdkDir)) return sdkDir;
      }
    }
  }

  // 3. Common default paths
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Library', 'Android', 'sdk'),       // macOS (Android Studio)
    path.join(home, 'Android', 'Sdk'),                   // Linux (Android Studio)
    path.join(home, 'AppData', 'Local', 'Android', 'Sdk'), // Windows
    '/opt/android-sdk',                                   // CI / custom
    '/usr/local/share/android-sdk',                       // Homebrew
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}
