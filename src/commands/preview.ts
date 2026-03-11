import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { execSync_, execAsync, execStreamCapture, commandExists } from '../utils/exec';
import { parseBuildOutput } from '../utils/build-error-parser';
import * as logger from '../utils/logger';

export interface PreviewOptions {
  dir?: string;
  page?: string;
  device?: string;
  shared?: string;
  skipBuild?: boolean;
  /** Output directory for screenshots */
  output?: string;
  /** Timeout in seconds to wait for app launch before screenshotting */
  launchTimeout?: number;
}

/**
 * Build, install, launch, and screenshot the app for visual verification.
 * Returns the screenshot file path for AI Agent / human review.
 */
export async function preview(
  platform: string,
  options: PreviewOptions
): Promise<CommandResult> {
  const projectDir = options.dir || process.cwd();

  switch (platform) {
    case 'android':
      return previewAndroid(projectDir, options);
    case 'ios':
      return previewIos(projectDir, options);
    default:
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'INVALID_PLATFORM',
          message: `Preview supports: android, ios. Got: "${platform}"`,
        },
      };
  }
}

// ═══════════════════════════════════════════════════════════
// Android Preview
// ═══════════════════════════════════════════════════════════

async function previewAndroid(projectDir: string, options: PreviewOptions): Promise<CommandResult> {
  const totalSteps = options.skipBuild ? 4 : 6;
  let step = 0;

  // ─── Step 1: Check adb ──────────────────────────────────
  logger.step(++step, totalSteps, 'Checking Android tools...');

  if (!commandExists('adb')) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'MISSING_DEPS',
        message: 'adb not found. Install Android SDK platform-tools.',
        suggestions: [
          'Install Android Studio, or',
          'brew install --cask android-platform-tools, or',
          'Set ANDROID_HOME and add $ANDROID_HOME/platform-tools to PATH',
        ],
      },
    };
  }

  // ─── Step 2: Check device / emulator ────────────────────
  logger.step(++step, totalSteps, 'Checking connected devices...');
  const deviceResult = await ensureAndroidDevice(options.device);
  if (!deviceResult.success) {
    return deviceResult as CommandResult;
  }
  const deviceSerial = deviceResult.serial;
  logger.info(`Using device: ${deviceSerial}`);

  // ─── Step 3 & 4: Build & Install ───────────────────────
  if (!options.skipBuild) {
    logger.step(++step, totalSteps, 'Building Android app...');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const buildResult = await execStreamCapture(
      `${gradlew} :androidApp:installDebug`,
      projectDir,
    );

    if (buildResult.exitCode !== 0) {
      const parsed = parseBuildOutput(buildResult.combined);
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'BUILD_FAILED',
          message: parsed.summary,
          details: parsed.rawFailure,
          diagnostics: parsed.diagnostics,
          suggestions: parsed.suggestions,
        },
      };
    }
    logger.step(++step, totalSteps, 'App installed on device.');
  }

  // ─── Step 5: Launch Activity ────────────────────────────
  logger.step(++step, totalSteps, 'Launching app...');
  const appId = getAndroidAppId(projectDir);
  if (!appId) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'CONFIGURATION_ERROR',
        message: 'Cannot determine applicationId from androidApp/build.gradle.kts',
      },
    };
  }

  // Force-stop the app first to ensure fresh launch with correct page
  await execAsync(`adb -s ${deviceSerial} shell am force-stop ${appId}`);

  // Build the launch intent
  const page = options.page || 'HelloWorld';
  // KuiklyRenderActivity expects the page name as intent extra "pageName"
  const launchCmd = `adb -s ${deviceSerial} shell am start -n ${appId}/.KuiklyRenderActivity --es pageName "${page}"`;
  await execAsync(launchCmd);

  // Wait for the app to render
  const launchTimeout = (options.launchTimeout || 5) * 1000;
  logger.info(`Waiting ${launchTimeout / 1000}s for app to render...`);
  await sleep(launchTimeout);

  // ─── Step 6: Screenshot ─────────────────────────────────
  logger.step(++step, totalSteps, 'Taking screenshot...');
  const screenshotResult = await takeAndroidScreenshot(deviceSerial, projectDir, options);
  if (!screenshotResult.success) {
    return screenshotResult;
  }

  const screenshotPath = screenshotResult.path!;
  logger.success(`Screenshot saved: ${screenshotPath}`);

  return {
    success: true,
    command: 'preview',
    data: {
      message: `Preview captured for page "${page}"`,
      platform: 'android',
      device: deviceSerial,
      page,
      screenshotPath,
      appId,
    },
    nextSteps: [
      `View screenshot: open ${screenshotPath}`,
      'Re-run with --skip-build for faster iteration after code changes',
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// iOS Preview
// ═══════════════════════════════════════════════════════════

async function previewIos(projectDir: string, options: PreviewOptions): Promise<CommandResult> {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        message: 'iOS preview requires macOS',
      },
    };
  }

  const totalSteps = options.skipBuild ? 4 : 8;
  let step = 0;

  // ─── Step 1: Check tools ────────────────────────────────
  logger.step(++step, totalSteps, 'Checking iOS tools...');

  if (!commandExists('xcrun')) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'MISSING_DEPS',
        message: 'xcrun not found. Install Xcode command line tools.',
        suggestions: ['xcode-select --install'],
      },
    };
  }

  // ─── Step 2: Boot Simulator ─────────────────────────────
  logger.step(++step, totalSteps, 'Booting iOS Simulator...');
  const device = options.device || await getDefaultIosSimulator();
  logger.info(`Using simulator: ${device}`);
  await execAsync(`xcrun simctl boot "${device}" 2>/dev/null || true`);
  // Open Simulator.app so the device window is visible
  await execAsync('open -a Simulator 2>/dev/null || true');

  // Detect iosApp directory name (default: iosApp)
  const iosDir = path.join(projectDir, 'iosApp');
  const iosAppName = 'iosApp';

  // Detect shared module name from settings.gradle.kts
  const sharedModuleName = options.shared || detectSharedModuleName(projectDir);

  // ─── Step 3 & 4: Build & Install ───────────────────────
  if (!options.skipBuild) {
    // ─── Step 3a: Generate dummy framework for CocoaPods ───
    // The shared KMP framework is built by Gradle during xcodebuild (via script phase).
    // But CocoaPods needs the framework to exist at `pod install` time to generate
    // correct linker flags (-framework "shared"). Without this, the shared module's
    // symbols won't be linked into the app binary, causing runtime crashes.
    const sharedFrameworkPath = path.join(projectDir, sharedModuleName, 'build', 'cocoapods', 'framework', `${sharedModuleName}.framework`);
    if (!fs.existsSync(sharedFrameworkPath)) {
      logger.step(++step, totalSteps, 'Generating dummy framework for CocoaPods...');
      const gradlew = path.join(projectDir, 'gradlew');
      const dummyResult = await execAsync(`"${gradlew}" -p "${projectDir}" :${sharedModuleName}:generateDummyFramework`);
      if (dummyResult.exitCode !== 0) {
        logger.warn('generateDummyFramework failed. Build may fail due to missing linker flags.');
      }

      // Re-run pod install so CocoaPods picks up the framework
      if (commandExists('pod')) {
        logger.info('Re-running pod install with dummy framework...');
        await execAsync('pod install', iosDir);
      }
    } else {
      step++; // Keep step numbering consistent
    }

    logger.step(++step, totalSteps, 'Building iOS app...');

    const workspaceFiles = fs.existsSync(iosDir)
      ? fs.readdirSync(iosDir).filter(f => f.endsWith('.xcworkspace'))
      : [];

    if (workspaceFiles.length === 0) {
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'NO_WORKSPACE',
          message: 'No .xcworkspace found in iosApp/',
          suggestions: [
            'cd iosApp && xcodegen generate && pod install',
            'Or run: kuikly create <project> first to set up the project',
          ],
        },
      };
    }

    const workspace = workspaceFiles[0];
    const scheme = workspace.replace('.xcworkspace', '');
    const buildResult = await execStreamCapture(
      `xcodebuild -workspace ${workspace} -scheme ${scheme} -destination "platform=iOS Simulator,name=${device}" -derivedDataPath build/ build`,
      iosDir,
    );

    if (buildResult.exitCode !== 0) {
      const parsed = parseBuildOutput(buildResult.combined);
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'BUILD_FAILED',
          message: parsed.summary || 'iOS build failed',
          details: buildResult.stderr.slice(-2000),
          diagnostics: parsed.diagnostics,
          suggestions: parsed.suggestions,
        },
      };
    }

    logger.step(++step, totalSteps, 'Installing app on simulator...');
    const appPath = path.join(iosDir, `build/Build/Products/Debug-iphonesimulator/${iosAppName}.app`);
    if (!fs.existsSync(appPath)) {
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'APP_NOT_FOUND',
          message: `Built app not found at: ${appPath}`,
          suggestions: ['Check xcodebuild output for errors'],
        },
      };
    }

    // Read actual bundle ID from built app's Info.plist
    const bundleId = getIosBundleId(appPath);
    if (!bundleId) {
      return {
        success: false,
        command: 'preview',
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Cannot determine CFBundleIdentifier from built app',
        },
      };
    }

    logger.info(`Bundle ID: ${bundleId}`);

    // Uninstall old → install fresh → launch
    await execAsync(`xcrun simctl uninstall booted ${bundleId} 2>/dev/null || true`);
    await execAsync(`xcrun simctl install booted "${appPath}"`);
    await execAsync(`xcrun simctl terminate booted ${bundleId} 2>/dev/null || true`);
    await execAsync(`xcrun simctl launch booted ${bundleId}`);
  } else {
    // Skip-build mode: just relaunch existing app
    const appPath = path.join(iosDir, `build/Build/Products/Debug-iphonesimulator/${iosAppName}.app`);
    if (fs.existsSync(appPath)) {
      const bundleId = getIosBundleId(appPath);
      if (bundleId) {
        await execAsync(`xcrun simctl terminate booted ${bundleId} 2>/dev/null || true`);
        await execAsync(`xcrun simctl launch booted ${bundleId}`);
      }
    }
  }

  // Wait for render
  const launchTimeout = (options.launchTimeout || 5) * 1000;
  logger.info(`Waiting ${launchTimeout / 1000}s for app to render...`);
  await sleep(launchTimeout);

  // ─── Screenshot ─────────────────────────────────────────
  logger.step(++step, totalSteps, 'Taking screenshot...');
  const screenshotResult = await takeIosScreenshot(device, projectDir, options);
  if (!screenshotResult.success) {
    return screenshotResult;
  }

  const screenshotPath = screenshotResult.path!;
  const page = options.page || 'default';
  logger.success(`Screenshot saved: ${screenshotPath}`);

  return {
    success: true,
    command: 'preview',
    data: {
      message: `Preview captured for page "${page}"`,
      platform: 'ios',
      device,
      page,
      screenshotPath,
    },
    nextSteps: [
      `View screenshot: open ${screenshotPath}`,
      'Re-run with --skip-build for faster iteration after code changes',
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

type DeviceCheckResult =
  | { success: true; serial: string }
  | { success: false; serial?: undefined } & CommandResult;

/**
 * Ensure an Android device/emulator is connected.
 * If no device specified and none connected, try to boot the default emulator.
 */
async function ensureAndroidDevice(preferredDevice?: string): Promise<DeviceCheckResult> {
  const devicesOutput = execSync_('adb devices', { ignoreError: true });
  const lines = devicesOutput.split('\n').filter(l => l.includes('\tdevice'));

  if (lines.length > 0) {
    if (preferredDevice) {
      const found = lines.find(l => l.startsWith(preferredDevice));
      if (found) {
        return { success: true, serial: preferredDevice };
      }
    }
    // Use first connected device
    const serial = lines[0].split('\t')[0];
    return { success: true, serial };
  }

  // No device connected — try to start an emulator
  logger.info('No connected device found. Attempting to start an emulator...');

  const emulatorPath = getEmulatorPath();
  if (!emulatorPath) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'NO_DEVICE',
        message: 'No Android device connected and no emulator found.',
        suggestions: [
          'Connect a device via USB with USB debugging enabled, or',
          'Create an AVD in Android Studio and start it, or',
          'Set ANDROID_HOME to point to your Android SDK',
        ],
      },
    };
  }

  // List available AVDs
  const avdList = execSync_(`${emulatorPath} -list-avds`, { ignoreError: true });
  const avds = avdList.split('\n').filter(Boolean);

  if (avds.length === 0) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'NO_AVD',
        message: 'No Android Virtual Devices found.',
        suggestions: [
          'Create an AVD: Android Studio → Tools → Device Manager → Create Device',
        ],
      },
    };
  }

  // Boot first available AVD in background
  const avdName = avds[0];
  logger.info(`Starting emulator: ${avdName}...`);
  // Start emulator in background (fire and forget)
  execAsync(`${emulatorPath} -avd "${avdName}" -no-snapshot-load`).catch(() => {
    // Emulator process exits when emulator closes — that's expected
  });

  // Wait for device to appear
  logger.info('Waiting for emulator to boot (up to 120s)...');
  const serial = await waitForDevice(120);

  if (!serial) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'EMULATOR_TIMEOUT',
        message: 'Emulator failed to boot within 120 seconds.',
        suggestions: [
          'Try starting the emulator manually from Android Studio',
          'Check if hardware acceleration (HAXM/KVM) is enabled',
        ],
      },
    };
  }

  // Wait for boot animation to complete
  logger.info('Waiting for system boot to complete...');
  await waitForBootComplete(serial, 60);

  return { success: true, serial };
}

function getEmulatorPath(): string | null {
  // Try emulator from PATH
  if (commandExists('emulator')) {
    return 'emulator';
  }

  // Try ANDROID_HOME
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (androidHome) {
    const emulatorBin = path.join(androidHome, 'emulator', 'emulator');
    if (fs.existsSync(emulatorBin)) {
      return emulatorBin;
    }
  }

  return null;
}

async function waitForDevice(timeoutSeconds: number): Promise<string | null> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const output = execSync_('adb devices', { ignoreError: true });
    const lines = output.split('\n').filter(l => l.includes('\tdevice'));
    if (lines.length > 0) {
      return lines[0].split('\t')[0];
    }
    await sleep(2000);
  }

  return null;
}

async function waitForBootComplete(serial: string, timeoutSeconds: number): Promise<void> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const result = execSync_(`adb -s ${serial} shell getprop sys.boot_completed`, { ignoreError: true });
    if (result.trim() === '1') {
      // Extra small delay for rendering
      await sleep(2000);
      return;
    }
    await sleep(2000);
  }
}

function getAndroidAppId(projectDir: string): string | null {
  const buildGradle = path.join(projectDir, 'androidApp', 'build.gradle.kts');
  if (!fs.existsSync(buildGradle)) return null;

  const content = fs.readFileSync(buildGradle, 'utf-8');
  const match = content.match(/applicationId\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

type ScreenshotResult =
  | { success: true; path: string; command: string; data: Record<string, unknown> }
  | { success: false; path?: undefined } & CommandResult;

async function takeAndroidScreenshot(
  serial: string,
  projectDir: string,
  options: PreviewOptions
): Promise<ScreenshotResult> {
  const outputDir = options.output || path.join(projectDir, '.kuikly', 'screenshots');
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const page = options.page || 'default';
  const filename = `android_${page}_${timestamp}.png`;
  const localPath = path.join(outputDir, filename);
  const devicePath = `/sdcard/kuikly_screenshot_${timestamp}.png`;

  // Capture screenshot on device
  const capResult = await execAsync(`adb -s ${serial} shell screencap -p ${devicePath}`);
  if (capResult.exitCode !== 0) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'SCREENSHOT_FAILED',
        message: 'Failed to capture screenshot on device',
        details: capResult.stderr,
      },
    };
  }

  // Pull to local
  const pullResult = await execAsync(`adb -s ${serial} pull ${devicePath} "${localPath}"`);

  // Clean up device file
  await execAsync(`adb -s ${serial} shell rm ${devicePath}`);

  if (pullResult.exitCode !== 0) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'SCREENSHOT_FAILED',
        message: 'Failed to pull screenshot from device',
        details: pullResult.stderr,
      },
    };
  }

  return {
    success: true,
    path: localPath,
    command: 'preview',
    data: { screenshotPath: localPath },
  };
}

async function takeIosScreenshot(
  device: string,
  projectDir: string,
  options: PreviewOptions
): Promise<ScreenshotResult> {
  const outputDir = options.output || path.join(projectDir, '.kuikly', 'screenshots');
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const page = options.page || 'default';
  const filename = `ios_${page}_${timestamp}.png`;
  const localPath = path.join(outputDir, filename);

  // Use xcrun simctl to capture screenshot
  const capResult = await execAsync(`xcrun simctl io booted screenshot "${localPath}"`);

  if (capResult.exitCode !== 0) {
    return {
      success: false,
      command: 'preview',
      error: {
        code: 'SCREENSHOT_FAILED',
        message: 'Failed to capture iOS simulator screenshot',
        details: capResult.stderr,
      },
    };
  }

  return {
    success: true,
    path: localPath,
    command: 'preview',
    data: { screenshotPath: localPath },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read CFBundleIdentifier from a built .app's Info.plist.
 */
function getIosBundleId(appPath: string): string | null {
  try {
    const plistPath = path.join(appPath, 'Info.plist');
    if (!fs.existsSync(plistPath)) return null;
    const result = execSync_(`defaults read "${plistPath}" CFBundleIdentifier`, { ignoreError: true });
    return result?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Detect shared module name from settings.gradle.kts.
 * Defaults to "shared" if not found.
 */
function detectSharedModuleName(projectDir: string): string {
  const settingsFile = path.join(projectDir, 'settings.gradle.kts');
  if (!fs.existsSync(settingsFile)) return 'shared';
  try {
    const content = fs.readFileSync(settingsFile, 'utf-8');
    // Look for include(":shared") or include(":myModule")
    const match = content.match(/include\(":(\w+)"\)/g);
    if (match) {
      // Find the first module that isn't androidApp/iosApp/ohosApp
      for (const m of match) {
        const name = m.match(/include\(":(\w+)"\)/)?.[1];
        if (name && !name.endsWith('App')) {
          return name;
        }
      }
    }
  } catch {
    // Fall through
  }
  return 'shared';
}

/**
 * Auto-detect the best available iOS simulator.
 * Prefers iPhone with highest number, falls back to any available.
 */
async function getDefaultIosSimulator(): Promise<string> {
  try {
    const result = await execAsync('xcrun simctl list devices available -j');
    const data = JSON.parse(result.stdout || '{}');
    const devices: Array<{ name: string; state: string }> = [];
    for (const [runtime, devList] of Object.entries(data.devices || {})) {
      if (typeof runtime === 'string' && runtime.includes('iOS')) {
        devices.push(...(devList as Array<{ name: string; state: string }>));
      }
    }
    // Prefer booted device
    const booted = devices.find(d => d.state === 'Booted');
    if (booted) return booted.name;
    // Prefer iPhone (not iPad), pick highest model number
    const iphones = devices.filter(d => d.name.startsWith('iPhone'));
    if (iphones.length > 0) {
      // Sort by name descending to get newest model
      iphones.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      return iphones[0].name;
    }
    if (devices.length > 0) return devices[0].name;
  } catch {
    // Fall through
  }
  return 'iPhone 16';
}
