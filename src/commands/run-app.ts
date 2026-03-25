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
    case 'ohos':
      return runOhos(projectDir, options);
    default:
      return {
        success: false,
        command: 'run',
        error: {
          code: 'INVALID_PLATFORM',
          message: `Run is supported for: android, ios, ohos. Got: "${platform}"`,
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

async function runOhos(projectDir: string, options: RunOptions): Promise<CommandResult> {
  const ohosDir = path.join(projectDir, 'ohosApp');
  if (!fs.existsSync(ohosDir)) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'NO_OHOS_APP',
        message: 'ohosApp directory not found',
        details: 'Run this command from the project root that contains an ohosApp module.',
      },
    };
  }

  // Step 1: Build KMP shared .so
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const shared = options.shared || 'shared';
  const settingsFile = path.join(projectDir, 'settings.ohos.gradle.kts');
  const linkTask = 'linkDebugSharedOhosArm64';
  const linkCmd = fs.existsSync(settingsFile)
    ? `${gradlew} -c settings.ohos.gradle.kts :${shared}:${linkTask}`
    : `${gradlew} :${shared}:${linkTask}`;

  logger.info('Building shared KMP module for HarmonyOS...');
  const linkResult = await execStream(linkCmd, projectDir);
  if (linkResult !== 0) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'BUILD_FAILED',
        message: 'Failed to build shared module for ohos',
      },
    };
  }

  // Step 2: Copy .so and header to ohosApp
  const variant = `${shared}DebugShared`;
  const srcDir = path.join(projectDir, shared, 'build', 'bin', 'ohosArm64', variant);
  const libDir = path.join(ohosDir, 'entry', 'libs', 'arm64-v8a');
  const headerDir = path.join(ohosDir, 'entry', 'src', 'main', 'cpp', 'thirdparty', 'biz_entry');

  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(headerDir, { recursive: true });

  const soSrc = path.join(srcDir, `lib${shared}.so`);
  const headerSrc = path.join(srcDir, `lib${shared}_api.h`);
  if (fs.existsSync(soSrc)) {
    fs.copyFileSync(soSrc, path.join(libDir, `lib${shared}.so`));
  }
  if (fs.existsSync(headerSrc)) {
    fs.copyFileSync(headerSrc, path.join(headerDir, `lib${shared}_api.h`));
  }
  logger.info('Copied .so and header to ohosApp.');

  // Step 3: Build ohosApp with hvigorw
  if (!commandExists('hvigorw')) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'HVIGOR_NOT_FOUND',
        message: 'hvigorw not found. Install DevEco Studio or add hvigor/bin to PATH.',
      },
    };
  }

  logger.info('Building HarmonyOS app with hvigorw...');
  const hvigorResult = await execStream('hvigorw assembleHap --mode module -p module=entry@default -p product=default --no-daemon', ohosDir);
  if (hvigorResult !== 0) {
    return {
      success: false,
      command: 'run',
      error: {
        code: 'BUILD_FAILED',
        message: 'HarmonyOS app build failed',
        details: 'Check hvigorw output for details.',
      },
    };
  }

  // Step 4: Install and launch via hdc
  if (!commandExists('hdc')) {
    logger.warn('hdc not found. Build succeeded — install the .hap manually via DevEco Studio.');
    return {
      success: true,
      command: 'run',
      data: {
        message: 'HarmonyOS app built. Install manually (hdc not found).',
        platform: 'ohos',
      },
    };
  }

  const hapPath = path.join(ohosDir, 'entry', 'build', 'default', 'outputs', 'default', 'entry-default-signed.hap');
  const unsignedHap = path.join(ohosDir, 'entry', 'build', 'default', 'outputs', 'default', 'entry-default-unsigned.hap');
  const hapToInstall = fs.existsSync(hapPath) ? hapPath : fs.existsSync(unsignedHap) ? unsignedHap : '';

  if (!hapToInstall) {
    logger.warn('Built .hap not found at expected path. Open ohosApp in DevEco Studio to install.');
    return {
      success: true,
      command: 'run',
      data: {
        message: 'HarmonyOS app built but .hap not found for auto-install.',
        platform: 'ohos',
      },
    };
  }

  logger.info('Installing HarmonyOS app via hdc...');
  await execStream(`hdc install "${hapToInstall}"`, ohosDir);

  return {
    success: true,
    command: 'run',
    data: { message: 'HarmonyOS app installed', platform: 'ohos' },
  };
}
