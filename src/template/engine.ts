import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { TemplateContext } from '../types';
import { mkdirp, writeFile, writeBinaryFile } from '../utils/fs';
import * as logger from '../utils/logger';

// Register Handlebars helpers
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
Handlebars.registerHelper('or', (a: unknown, b: unknown) => a || b);
Handlebars.registerHelper('and', (a: unknown, b: unknown) => a && b);
Handlebars.registerHelper('not', (a: unknown) => !a);

/**
 * Binary file extensions that should be copied verbatim, not template-processed.
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.jar', '.zip', '.gz', '.tar',
  '.ttf', '.otf', '.woff', '.woff2',
  '.so', '.dylib', '.dll',
]);

/**
 * Template file extension — files ending with this are processed through Handlebars.
 */
const TEMPLATE_EXT = '.hbs';

/**
 * Render a single template string with the given context.
 */
export function renderString(template: string, context: TemplateContext): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(context);
}

/**
 * Process a file path, replacing __variableName__ patterns with context values.
 */
export function resolvePathVariables(filePath: string, context: TemplateContext): string {
  return filePath.replace(/__(\w+)__/g, (_, varName) => {
    const value = (context as unknown as Record<string, unknown>)[varName];
    if (typeof value === 'string') {
      return value;
    }
    return _;
  });
}

/**
 * Process a complete template directory and write output files.
 *
 * Template conventions:
 * - Files ending in `.hbs` are processed through Handlebars, with `.hbs` stripped.
 * - Directory names with `__varName__` are replaced with context values.
 * - The special directory name `__packagePath__` is replaced with the package path.
 * - Binary files (images, jars, etc.) are copied verbatim.
 *
 * @param templateDir   Path to the template directory (containing raw template files)
 * @param outputDir     Path to write the generated project
 * @param context       Template variables
 * @returns             List of generated file paths (relative to outputDir)
 */
export function processTemplateDir(
  templateDir: string,
  outputDir: string,
  context: TemplateContext
): string[] {
  const generatedFiles: string[] = [];

  function walk(dir: string, relativeBase: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(dir, entry.name);

      // Resolve __variable__ patterns in the name
      let resolvedName = resolvePathVariables(entry.name, context);

      if (entry.isDirectory()) {
        const newRelBase = path.join(relativeBase, resolvedName);
        walk(srcPath, newRelBase);
      } else {
        // Determine if this is a template file
        const isTemplate = resolvedName.endsWith(TEMPLATE_EXT);
        if (isTemplate) {
          resolvedName = resolvedName.slice(0, -TEMPLATE_EXT.length);
        }

        const outputPath = path.join(outputDir, relativeBase, resolvedName);
        const ext = path.extname(resolvedName).toLowerCase();

        if (BINARY_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          // Binary file — copy verbatim
          writeBinaryFile(outputPath, fs.readFileSync(srcPath));
        } else if (isTemplate) {
          // Template file — process through Handlebars
          const templateContent = fs.readFileSync(srcPath, 'utf-8');
          try {
            const rendered = renderString(templateContent, context);
            writeFile(outputPath, rendered);
          } catch (err) {
            logger.warn(`Failed to render template: ${srcPath}`);
            // Still write the raw content
            writeFile(outputPath, templateContent);
          }
        } else {
          // Regular text file — copy as-is
          const content = fs.readFileSync(srcPath, 'utf-8');
          writeFile(outputPath, content);
        }

        generatedFiles.push(path.join(relativeBase, resolvedName));
      }
    }
  }

  walk(templateDir, '');
  return generatedFiles;
}

/**
 * Build a TemplateContext from a ProjectConfig and version info.
 */
export function buildContext(config: {
  projectName: string;
  packageName: string;
  dsl: 'kuikly' | 'compose';
  kotlinVersion: string;
  kuiklyVersion: string;
  sharedModuleName: string;
  androidAppName: string;
  iosAppName: string;
  ohosAppName: string;
  h5AppName: string;
  miniAppName: string;
  artifactName: string;
  includeH5: boolean;
  includeMiniApp: boolean;
  outputDir: string;
  kspVersion: string;
  agpVersion: string;
  composeVersion: string;
  gradleVersion: string;
}): TemplateContext {
  return {
    ...config,
    packagePath: config.packageName.replace(/\./g, '/'),
    isCompose: config.dsl === 'compose',
    isK2: parseInt(config.kotlinVersion.split('.')[0], 10) >= 2,
    kuiklyDependencyVersion: `${config.kuiklyVersion}-${config.kotlinVersion}`,
  };
}
