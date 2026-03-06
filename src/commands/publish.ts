import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { execStream } from '../utils/exec';
import * as logger from '../utils/logger';

export interface PublishOptions {
  dir?: string;
  shared?: string;
  mavenUrl?: string;
  mavenUser?: string;
  mavenPassword?: string;
  version?: string;
}

/**
 * Publish the shared module to a Maven repository.
 */
export async function publish(options: PublishOptions): Promise<CommandResult> {
  const projectDir = options.dir || process.cwd();
  const shared = options.shared || 'shared';
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  // Check project exists
  if (!fs.existsSync(path.join(projectDir, 'build.gradle.kts'))) {
    return {
      success: false,
      command: 'publish',
      error: {
        code: 'NOT_IN_PROJECT',
        message: 'Not in a Kuikly project directory',
      },
    };
  }

  // Build environment variables
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (options.mavenUrl) env.mavenUrl = options.mavenUrl;
  if (options.mavenUser) env.mavenUserName = options.mavenUser;
  if (options.mavenPassword) env.mavenPassword = options.mavenPassword;
  if (options.version) env.kuiklyBizVersion = options.version;

  logger.info(`Publishing ${shared} module...`);

  // Publish Android artifact
  logger.info('Publishing Android artifact...');
  let exitCode = await execStream(
    `${gradlew} :${shared}:publishReleasePublicationToMavenRepository`,
    projectDir
  );

  if (exitCode !== 0) {
    return {
      success: false,
      command: 'publish',
      error: {
        code: 'PUBLISH_FAILED',
        message: 'Failed to publish Android artifact',
        details: `Exit code: ${exitCode}`,
      },
    };
  }

  // Publish iOS framework (podspec)
  logger.info('Building iOS framework...');
  exitCode = await execStream(
    `${gradlew} :${shared}:podPublishXCFramework`,
    projectDir
  );

  if (exitCode !== 0) {
    logger.warn('iOS framework build failed (may be expected on non-macOS)');
  }

  logger.success('Publishing completed!');

  return {
    success: true,
    command: 'publish',
    data: {
      message: 'Shared module published successfully',
      version: options.version || '(from project config)',
    },
    nextSteps: [
      'Verify the artifact in your Maven repository',
      'Update consuming projects to use the new version',
    ],
  };
}
