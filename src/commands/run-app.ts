import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { execStream, execAsync, commandExists } from '../utils/exec';
import * as logger from '../utils/logger';

export interface RunOptions {
  dir?: string;
  device?: string;
  shared?: string;
}

/**
 * Build and run the app on a connected device or emulator.
 */
export async function runApp(
  platform: string,
  options: RunOptions
): Promise<CommandResult> {
  const projectDir = options.dir || process.cwd();

  switch (platform) {
    case 'android':
      return runAndroid(projectDir, options);
    case 'ios':
      return runIos(projectDir, options);
    default:
      return {
        success: false,
        command: 'run',
        error: {
          code: 'INVALID_PLATFORM',
          message: `Run is supported for: android, ios. Got: "${platform}"`,
        },
      };
  }
}

async function runAndroid(projectDir: string, options: RunOptions): Promise<CommandResult> {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  logger.info('Building and installing Android app...');
  const buildCode = await execStream(
    `${gradlew} :androidApp:installDebug`,
    projectDir
  );

  if (buildCode !== 0) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'BUILD_FAILED',
        message: 'Android build failed',
      },
    };
  }

  // Get package name from build.gradle.kts
  const buildGradle = path.join(projectDir, 'androidApp', 'build.gradle.kts');
  let appId = '';
  if (fs.existsSync(buildGradle)) {
    const content = fs.readFileSync(buildGradle, 'utf-8');
    const match = content.match(/applicationId\s*=\s*"([^"]+)"/);
    if (match) appId = match[1];
  }

  if (appId && commandExists('adb')) {
    logger.info('Launching app on device...');
    await execStream(
      `adb shell am start -n ${appId}/.KuiklyRenderActivity`,
      projectDir
    );
  }

  return {
    success: true,
    command: 'run',
    data: { message: 'Android app launched', platform: 'android' },
  };
}

async function runIos(projectDir: string, options: RunOptions): Promise<CommandResult> {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        message: 'iOS build requires macOS',
      },
    };
  }

  const iosDir = path.join(projectDir, 'iosApp');
  const workspacePath = fs.readdirSync(iosDir).find((f) => f.endsWith('.xcworkspace'));

  if (!workspacePath) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'NO_WORKSPACE',
        message: 'No .xcworkspace found in iosApp/',
        details: 'Run: cd iosApp && xcodegen generate && pod install',
      },
    };
  }

  const device = options.device || 'iPhone 15';

  logger.info(`Building and running on iOS Simulator (${device})...`);

  const buildCode = await execStream(
    `xcodebuild -workspace ${workspacePath} -scheme iosApp -destination "platform=iOS Simulator,name=${device}" -derivedDataPath build/ build`,
    iosDir
  );

  if (buildCode !== 0) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'BUILD_FAILED',
        message: 'iOS build failed',
      },
    };
  }

  // Boot simulator and install
  await execStream(`xcrun simctl boot "${device}" 2>/dev/null || true`, iosDir);

  const appPath = `build/Build/Products/Debug-iphonesimulator/iosApp.app`;
  if (fs.existsSync(path.join(iosDir, appPath))) {
    await execStream(`xcrun simctl install booted "${appPath}"`, iosDir);
    await execStream(`xcrun simctl launch booted $(defaults read "${path.join(iosDir, appPath, 'Info.plist')}" CFBundleIdentifier)`, iosDir);
  }

  return {
    success: true,
    command: 'run',
    data: { message: 'iOS app launched in simulator', platform: 'ios', device },
  };
}
