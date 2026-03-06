import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively create directories.
 */
export function mkdirp(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Write file content, creating parent directories as needed.
 */
export function writeFile(filePath: string, content: string): void {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Write binary file content, creating parent directories as needed.
 */
export function writeBinaryFile(filePath: string, content: Buffer): void {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

/**
 * Read a file and return its contents, or null if not found.
 */
export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check if a path exists.
 */
export function exists(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * Check if a path is an empty directory.
 */
export function isEmptyDir(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return true;
  return fs.readdirSync(dirPath).length === 0;
}

/**
 * Walk a directory recursively and return all file paths (relative to root).
 */
export function walkDir(dir: string, root?: string): string[] {
  root = root || dir;
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, root));
    } else {
      results.push(path.relative(root, fullPath));
    }
  }
  return results;
}

/**
 * Copy a file, creating parent directories as needed.
 */
export function copyFile(src: string, dest: string): void {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Make a file executable (Unix only).
 */
export function makeExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

/**
 * Collect all generated file paths relative to a root dir.
 */
export function collectFiles(rootDir: string): string[] {
  return walkDir(rootDir).sort();
}
