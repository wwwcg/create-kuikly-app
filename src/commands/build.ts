import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { execStream, execStreamCapture, execAsync, commandExists } from '../utils/exec';
import { parseBuildOutput } from '../utils/build-error-parser';
import * as logger from '../utils/logger';

export interface BuildOptions {
  dir?: string;
  release?: boolean;
  shared?: string;
}

type Platform = 'android' | 'ios' | 'ohos' | 'h5';

/**
 * Build the project for a specific platform.
 */
export async function build(
  platform: string,
  options: BuildOptions
): Promise<CommandResult> {
  const projectDir = options.dir || process.cwd();
  const validPlatforms: Platform[] = ['android', 'ios', 'ohos', 'h5'];

  if (!validPlatforms.includes(platform as Platform)) {
    return {
      success: false,
      command: 'build',
      error: {
        code: 'INVALID_PLATFORM',
        message: `Invalid platform: "${platform}"`,
        details: `Valid platforms: ${validPlatforms.join(', ')}`,
      },
    };
  }

  // Check we're in a Kuikly project
  if (!fs.existsSync(path.join(projectDir, 'build.gradle.kts')) &&
      !fs.existsSync(path.join(projectDir, 'settings.gradle.kts'))) {
    return {
      success: false,
      command: 'build',
      error: {
        code: 'NOT_IN_PROJECT',
        message: 'Not in a Kuikly project directory',
        details: 'Run this command from the project root.',
      },
    };
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const buildType = options.release ? 'Release' : 'Debug';
  const shared = options.shared || 'shared';

  let command: string;
  let outputInfo: string;

  switch (platform as Platform) {
    case 'android':
      command = `${gradlew} :androidApp:assemble${buildType}`;
      outputInfo = `androidApp/build/outputs/apk/${buildType.toLowerCase()}/`;
      break;

    case 'ios':
      // Build the shared framework for iOS
      command = `${gradlew} :${shared}:podPublishXCFramework`;
      outputInfo = `${shared}/build/cocoapods/publish/`;
      break;

    case 'ohos': {
      // Ohos uses a different settings file
      const settingsFile = path.join(projectDir, 'settings.ohos.gradle.kts');
      if (fs.existsSync(settingsFile)) {
        command = `${gradlew} -c settings.ohos.gradle.kts :${shared}:assembleOhosRelease`;
      } else {
        command = `${gradlew} :${shared}:assembleOhosRelease`;
      }
      outputInfo = `${shared}/build/outputs/ohos/`;
      break;
    }

    case 'h5':
      command = `${gradlew} :${shared}:jsBrowserProductionWebpack`;
      outputInfo = `${shared}/build/dist/js/productionExecutable/`;
      break;

    default:
      return {
        success: false,
        command: 'build',
        error: {
          code: 'UNSUPPORTED_PLATFORM',
          message: `Platform "${platform}" is not supported yet`,
        },
      };
  }

  logger.info(`Building for ${platform} (${buildType})...`);
  logger.info(`Running: ${command}`);

  const buildResult = await execStreamCapture(command, projectDir);

  if (buildResult.exitCode !== 0) {
    const parsed = parseBuildOutput(buildResult.combined);

    // Log structured errors in non-JSON mode
    if (!logger.isJsonMode() && parsed.diagnostics.length > 0) {
      logger.section('Build Diagnostics');
      for (const diag of parsed.diagnostics.filter(d => d.severity === 'error')) {
        const loc = diag.file ? `${diag.file}${diag.line ? `:${diag.line}` : ''}` : '';
        logger.error(`[${diag.category}] ${loc ? loc + ' — ' : ''}${diag.message}`);
      }
      if (parsed.suggestions.length > 0) {
        logger.section('Suggestions');
        parsed.suggestions.forEach((s, i) => {
          logger.info(`${i + 1}. ${s}`);
        });
      }
    }

    return {
      success: false,
      command: 'build',
      error: {
        code: 'BUILD_FAILED',
        message: parsed.summary,
        details: parsed.rawFailure || `Command: ${command}`,
        diagnostics: parsed.diagnostics,
        suggestions: parsed.suggestions,
      },
    };
  }

  logger.success(`Build successful! Output: ${outputInfo}`);

  return {
    success: true,
    command: 'build',
    data: {
      message: `Build successful for ${platform}`,
      platform,
      buildType,
      outputDir: outputInfo,
    },
  };
}
