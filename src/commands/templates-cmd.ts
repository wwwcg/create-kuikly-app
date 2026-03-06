import { CommandResult } from '../types';
import { fetchRegistry, listTemplates } from '../template/registry';
import * as logger from '../utils/logger';

/**
 * List available project templates.
 */
export async function listAvailableTemplates(): Promise<CommandResult> {
  const registry = await fetchRegistry();
  const templates = listTemplates(registry);

  if (!logger.isJsonMode()) {
    logger.section('Available Templates');
    for (const t of templates) {
      const isDefault = t.default ? ' (default)' : '';
      console.log(`  • ${t.name}${isDefault} — ${t.description}`);
      console.log(`    Version: ${t.version}`);
    }

    logger.section('Version Info');
    logger.kv('Latest Kuikly SDK', registry.kuiklyVersions.latest);
    logger.kv('Supported Kuikly', registry.kuiklyVersions.supported.join(', '));
    logger.kv('Latest Kotlin', registry.kotlinVersions.latest);
    logger.kv('Supported Kotlin', registry.kotlinVersions.supported.join(', '));
    console.log('');
  }

  return {
    success: true,
    command: 'templates',
    data: {
      templates,
      kuiklyVersions: registry.kuiklyVersions,
      kotlinVersions: registry.kotlinVersions,
    },
  };
}
