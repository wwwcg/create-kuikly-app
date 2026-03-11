import { Command } from 'commander';
import { createProject } from './commands/create';
import { createPage } from './commands/create-page';
import { createComponent } from './commands/create-component';
import { build } from './commands/build';
import { runApp } from './commands/run-app';
import { preview } from './commands/preview';
import { doctor } from './commands/doctor';
import { listAvailableTemplates } from './commands/templates-cmd';
import { publish } from './commands/publish';
import { upgrade } from './commands/upgrade';
import { setJsonMode } from './utils/logger';
import * as logger from './utils/logger';
import { CommandResult } from './types';

const VERSION = '0.1.0';

export function createCli(): Command {
  const program = new Command();

  program
    .name('kuikly')
    .description('CLI tool for Kuikly cross-platform framework. AI Agent friendly.')
    .version(VERSION)
    .option('--json', 'Output results as JSON (for AI Agent consumption)')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.json) {
        setJsonMode(true);
      }
    });

  // ═══════════════════════════════════════════════════════
  // create — Create a new Kuikly project
  // ═══════════════════════════════════════════════════════
  program
    .command('create')
    .argument('<project-name>', 'Name of the project to create')
    .description('Create a new Kuikly cross-platform project')
    .option('-p, --package <name>', 'Java/Kotlin package name (e.g. com.example.myapp)')
    .option('-t, --template <name>', 'Project template: kuikly (default) or compose')
    .option('-d, --dsl <type>', 'DSL type: kuikly or compose', 'kuikly')
    .option('--kotlin-version <ver>', 'Kotlin version (e.g. 2.1.21)')
    .option('--kuikly-version <ver>', 'Kuikly SDK version (e.g. 2.7.0)')
    .option('--shared-module <name>', 'Shared module name', 'shared')
    .option('--h5', 'Include H5 web app module', false)
    .option('--miniapp', 'Include mini program app module', false)
    .option('--skip-setup', 'Skip post-creation setup (Gradle wrapper, pod install)', false)
    .option('--force', 'Force creation even if directory exists', false)
    .action(async (projectName: string, options) => {
      const result = await createProject(projectName, options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // create-page — Add a new page to existing project
  // ═══════════════════════════════════════════════════════
  program
    .command('create-page')
    .argument('<page-name>', 'Page name in PascalCase (e.g. UserProfile)')
    .description('Create a new Kuikly page in the current project')
    .option('-p, --package <name>', 'Package name (auto-detected if omitted)')
    .option('-d, --dsl <type>', 'DSL type (auto-detected if omitted)')
    .option('-m, --module <name>', 'Shared module name', 'shared')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .action(async (pageName: string, options) => {
      const result = await createPage(pageName, options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // create-component — Add a reusable component
  // ═══════════════════════════════════════════════════════
  program
    .command('create-component')
    .argument('<component-name>', 'Component name in PascalCase (e.g. ChatBubble)')
    .description('Create a new Kuikly reusable component')
    .option('-p, --package <name>', 'Package name (auto-detected)')
    .option('-d, --dsl <type>', 'DSL type (auto-detected)')
    .option('-m, --module <name>', 'Shared module name', 'shared')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .action(async (componentName: string, options) => {
      const result = await createComponent(componentName, options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // build — Build for a specific platform
  // ═══════════════════════════════════════════════════════
  program
    .command('build')
    .argument('<platform>', 'Target platform: android, ios, ohos, h5')
    .description('Build the project for a specific platform')
    .option('--release', 'Build in release mode', false)
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('-s, --shared <name>', 'Shared module name', 'shared')
    .action(async (platform: string, options) => {
      const result = await build(platform, options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // run — Build and run on device/simulator
  // ═══════════════════════════════════════════════════════
  program
    .command('run')
    .argument('<platform>', 'Target platform: android, ios')
    .description('Build and run the app on a connected device or simulator')
    .option('--device <name>', 'Device/simulator name (iOS: "iPhone 15")')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('-s, --shared <name>', 'Shared module name', 'shared')
    .action(async (platform: string, options) => {
      const result = await runApp(platform, options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // preview — Build, install, launch, and screenshot
  // ═══════════════════════════════════════════════════════
  program
    .command('preview')
    .argument('<platform>', 'Target platform: android, ios')
    .description('Build, launch, and take a screenshot for visual verification (AI Agent friendly)')
    .option('--page <name>', 'Page to navigate to (default: router)', 'router')
    .option('--device <name>', 'Device/simulator name or serial')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('-s, --shared <name>', 'Shared module name', 'shared')
    .option('--skip-build', 'Skip build step (app must already be installed)', false)
    .option('-o, --output <dir>', 'Output directory for screenshots')
    .option('--timeout <seconds>', 'Seconds to wait for app to render before screenshotting', '5')
    .action(async (platform: string, options) => {
      const result = await preview(platform, {
        ...options,
        launchTimeout: parseInt(options.timeout, 10),
      });
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // screenshot — Quick screenshot of currently running app
  // ═══════════════════════════════════════════════════════
  program
    .command('screenshot')
    .argument('[platform]', 'Target platform: android, ios', 'android')
    .description('Take a screenshot of the currently running app (no build)')
    .option('--device <name>', 'Device/simulator name or serial')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('-o, --output <dir>', 'Output directory for screenshots')
    .action(async (platform: string, options) => {
      // screenshot is just preview with --skip-build and short timeout
      const result = await preview(platform, {
        ...options,
        skipBuild: true,
        launchTimeout: 1,
      });
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // publish — Publish shared module to Maven
  // ═══════════════════════════════════════════════════════
  program
    .command('publish')
    .description('Publish shared module to Maven repository')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('-s, --shared <name>', 'Shared module name', 'shared')
    .option('--maven-url <url>', 'Maven repository URL')
    .option('--maven-user <user>', 'Maven username')
    .option('--maven-password <pass>', 'Maven password')
    .option('-v, --version <ver>', 'Publish version')
    .action(async (options) => {
      const result = await publish(options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // upgrade — Upgrade SDK versions
  // ═══════════════════════════════════════════════════════
  program
    .command('upgrade')
    .description('Upgrade Kuikly SDK and Kotlin versions in the current project')
    .option('--dir <path>', 'Project root directory', process.cwd())
    .option('--kuikly-version <ver>', 'Target Kuikly SDK version (default: latest)')
    .option('--kotlin-version <ver>', 'Target Kotlin version (default: latest)')
    .option('--dry-run', 'Show what would be changed without modifying files', false)
    .action(async (options) => {
      const result = await upgrade(options);
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // doctor — Check environment
  // ═══════════════════════════════════════════════════════
  program
    .command('doctor')
    .description('Check your development environment for Kuikly prerequisites')
    .action(async () => {
      const result = await doctor();
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // templates — List available templates
  // ═══════════════════════════════════════════════════════
  program
    .command('templates')
    .description('List available project templates and version info')
    .action(async () => {
      const result = await listAvailableTemplates();
      outputResult(result);
      process.exit(result.success ? 0 : 1);
    });

  // ═══════════════════════════════════════════════════════
  // Default action: if called as `create-kuikly-app MyApp`
  // (no subcommand), treat the first arg as a project name
  // ═══════════════════════════════════════════════════════
  program
    .argument('[project-name]', 'Project name (shorthand for "kuikly create <name>")')
    .action(async (projectName: string | undefined, options) => {
      if (projectName && !program.commands.some(c => c.name() === projectName)) {
        // Direct invocation: npx create-kuikly-app MyApp
        const result = await createProject(projectName, options);
        outputResult(result);
        process.exit(result.success ? 0 : 1);
      }
    });

  return program;
}

function outputResult(result: CommandResult): void {
  if (logger.isJsonMode()) {
    logger.result(result);
  } else if (!result.success) {
    logger.result(result);
  }
  // For success in non-JSON mode, the command handlers already printed output
}
