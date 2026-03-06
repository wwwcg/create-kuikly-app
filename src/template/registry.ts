import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { TemplateRegistry, TemplateInfo } from '../types';
import * as logger from '../utils/logger';

/**
 * Default registry URL — override with KUIKLY_REGISTRY_URL env var.
 */
const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/nicosResOrg/create-kuikly-app/main/templates/registry.json';

/**
 * Local cache directory for downloaded templates.
 */
function getCacheDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.kuikly', 'cache');
}

/**
 * Bundled registry (ships with the npm package).
 */
function getBundledRegistryPath(): string {
  return path.join(__dirname, '..', '..', 'templates', 'registry.json');
}

/**
 * Bundled template directory path.
 */
export function getBundledTemplatePath(templateName: string): string {
  return path.join(__dirname, '..', '..', 'templates', templateName, 'files');
}

/**
 * Fetch the template registry.
 * Tries remote first, falls back to bundled.
 */
export async function fetchRegistry(): Promise<TemplateRegistry> {
  const registryUrl = process.env.KUIKLY_REGISTRY_URL || DEFAULT_REGISTRY_URL;

  // Try remote first
  try {
    logger.info('Fetching latest template registry...');
    const response = await fetch(registryUrl, { timeout: 5000 });
    if (response.ok) {
      const registry = (await response.json()) as TemplateRegistry;
      // Cache locally
      const cacheDir = getCacheDir();
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, 'registry.json'),
        JSON.stringify(registry, null, 2)
      );
      return registry;
    }
  } catch {
    logger.warn('Could not fetch remote registry, using bundled version.');
  }

  // Try local cache
  const cachedPath = path.join(getCacheDir(), 'registry.json');
  if (fs.existsSync(cachedPath)) {
    try {
      return JSON.parse(fs.readFileSync(cachedPath, 'utf-8')) as TemplateRegistry;
    } catch { /* ignore */ }
  }

  // Fall back to bundled
  return loadBundledRegistry();
}

/**
 * Load the bundled registry from the npm package.
 */
export function loadBundledRegistry(): TemplateRegistry {
  const bundledPath = getBundledRegistryPath();
  if (fs.existsSync(bundledPath)) {
    return JSON.parse(fs.readFileSync(bundledPath, 'utf-8')) as TemplateRegistry;
  }
  // Hardcoded fallback
  return {
    version: '1.0.0',
    baseUrl: DEFAULT_REGISTRY_URL.replace('/registry.json', ''),
    kuiklyVersions: {
      latest: '2.7.0',
      supported: ['2.7.0'],
    },
    kotlinVersions: {
      latest: '2.1.21',
      supported: ['1.9.22', '2.1.21'],
    },
    templates: [
      {
        name: 'kuikly',
        displayName: 'Kuikly DSL',
        description: 'Standard Kuikly DSL project with full platform support',
        version: '1.0.0',
        default: true,
      },
      {
        name: 'compose',
        displayName: 'Compose DSL',
        description: 'Kuikly Compose DSL project with Jetpack Compose-style API',
        version: '1.0.0',
      },
    ],
  };
}

/**
 * Download a remote template to local cache.
 * Returns the local path to the template files.
 */
export async function downloadTemplate(
  registry: TemplateRegistry,
  templateName: string
): Promise<string | null> {
  const templateInfo = registry.templates.find((t) => t.name === templateName);
  if (!templateInfo) return null;

  const baseUrl = registry.baseUrl || DEFAULT_REGISTRY_URL.replace('/registry.json', '');
  const templateUrl = templateInfo.url || `${baseUrl}/${templateName}`;

  // For now, we primarily use bundled templates.
  // Remote downloading of template archives is a future enhancement.
  // The infrastructure is ready — just needs tar extraction logic.

  const bundledPath = getBundledTemplatePath(templateName);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return null;
}

/**
 * Resolve the template directory path.
 * Checks local cache first, then bundled templates.
 */
export async function resolveTemplatePath(
  registry: TemplateRegistry,
  templateName: string
): Promise<string> {
  // Check bundled templates first (most reliable)
  const bundledPath = getBundledTemplatePath(templateName);
  if (fs.existsSync(bundledPath)) {
    logger.info(`Using bundled template: ${templateName}`);
    return bundledPath;
  }

  // Try downloading
  const downloadedPath = await downloadTemplate(registry, templateName);
  if (downloadedPath) {
    return downloadedPath;
  }

  throw new Error(
    `Template "${templateName}" not found. Available templates: ${registry.templates.map((t) => t.name).join(', ')}`
  );
}

/**
 * List available templates from the registry.
 */
export function listTemplates(registry: TemplateRegistry): TemplateInfo[] {
  return registry.templates;
}
