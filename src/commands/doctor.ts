import { CommandResult, DoctorCheck } from '../types';
import { commandExists, getCommandVersion, execSync_ } from '../utils/exec';
import * as logger from '../utils/logger';

/**
 * Check development environment for Kuikly prerequisites.
 */
export async function doctor(): Promise<CommandResult> {
  const checks: DoctorCheck[] = [];

  // ─── Node.js ─────────────────────────────────────────
  checks.push(checkNode());

  // ─── Java / JDK ──────────────────────────────────────
  checks.push(checkJava());

  // ─── Gradle ──────────────────────────────────────────
  checks.push(checkGradle());

  // ─── Android SDK ─────────────────────────────────────
  checks.push(checkAndroidSdk());

  // ─── Kotlin ──────────────────────────────────────────
  checks.push(checkKotlin());

  // ─── Platform-specific (macOS) ───────────────────────
  if (process.platform === 'darwin') {
    checks.push(checkXcode());
    checks.push(checkXcodegen());
    checks.push(checkCocoaPods());
  }

  // ─── HarmonyOS / OpenHarmony ─────────────────────────
  checks.push(checkOhosSdk());
  checks.push(checkHvigor());
  checks.push(checkOhpm());
  checks.push(checkHdc());

  // ─── Git ─────────────────────────────────────────────
  checks.push(checkGit());

  // Summary
  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  // In JSON mode, result() handles all output — skip duplicate printing
  if (!logger.isJsonMode()) {
    logger.doctorResults(checks);

    if (hasError) {
      logger.error('Some required tools are missing. Please install them before creating a project.');
    } else if (hasWarning) {
      logger.warn('Some optional tools are missing. Core functionality will work.');
    } else {
      logger.success('All checks passed! Your environment is ready for Kuikly development.');
    }
  }

  return {
    success: !hasError,
    command: 'doctor',
    data: {
      checks,
      summary: hasError ? 'missing_required' : hasWarning ? 'missing_optional' : 'all_ok',
      message: hasError
        ? 'Some required tools are missing'
        : hasWarning
        ? 'Some optional tools are missing'
        : 'All checks passed',
    },
    error: hasError
      ? {
          code: 'MISSING_DEPS',
          message: 'Some required tools are missing. Please install them before creating a project.',
        }
      : undefined,
  };
}

function checkNode(): DoctorCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  return {
    name: 'Node.js',
    status: major >= 16 ? 'ok' : 'error',
    version,
    message: major >= 16 ? 'Installed' : 'Version 16+ required',
    fix: major < 16 ? 'Install Node.js 16+ from https://nodejs.org' : undefined,
  };
}

function checkJava(): DoctorCheck {
  const version = getCommandVersion('java', '-version');
  if (!version) {
    return {
      name: 'Java / JDK',
      status: 'error',
      message: 'Not found',
      fix: 'Install JDK 11+ from https://adoptium.net or use sdkman: sdk install java 17.0.9-tem',
    };
  }
  return {
    name: 'Java / JDK',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkGradle(): DoctorCheck {
  const version = getCommandVersion('gradle');
  if (!version) {
    return {
      name: 'Gradle',
      status: 'warning',
      message: 'Not found (gradlew will be used instead)',
      fix: 'Install Gradle from https://gradle.org/install/ or use sdkman: sdk install gradle',
    };
  }
  return {
    name: 'Gradle',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkAndroidSdk(): DoctorCheck {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!androidHome) {
    return {
      name: 'Android SDK',
      status: 'warning',
      message: 'ANDROID_HOME not set',
      fix: 'Install Android Studio or set ANDROID_HOME environment variable',
    };
  }
  return {
    name: 'Android SDK',
    status: 'ok',
    version: androidHome,
    message: `Found at ${androidHome}`,
  };
}

function checkKotlin(): DoctorCheck {
  const version = getCommandVersion('kotlin');
  if (!version) {
    return {
      name: 'Kotlin',
      status: 'ok',
      message: 'Will use Gradle-managed Kotlin (OK)',
    };
  }
  return {
    name: 'Kotlin',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkXcode(): DoctorCheck {
  const version = getCommandVersion('xcodebuild', '-version');
  if (!version) {
    return {
      name: 'Xcode',
      status: 'warning',
      message: 'Not found (needed for iOS builds)',
      fix: 'Install Xcode from the App Store',
    };
  }
  return {
    name: 'Xcode',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkXcodegen(): DoctorCheck {
  if (!commandExists('xcodegen')) {
    return {
      name: 'XcodeGen',
      status: 'warning',
      message: 'Not found (needed to generate Xcode project)',
      fix: 'Install with: brew install xcodegen',
    };
  }
  const version = getCommandVersion('xcodegen');
  return {
    name: 'XcodeGen',
    status: 'ok',
    version: version || 'unknown',
    message: 'Installed',
  };
}

function checkCocoaPods(): DoctorCheck {
  const version = getCommandVersion('pod');
  if (!version) {
    return {
      name: 'CocoaPods',
      status: 'warning',
      message: 'Not found (needed for iOS dependency management)',
      fix: 'Install with: sudo gem install cocoapods',
    };
  }
  return {
    name: 'CocoaPods',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkOhosSdk(): DoctorCheck {
  const devEcoHome = process.env.DEVECO_SDK_HOME;
  const hosHome = process.env.HOS_SDK_HOME;
  const ohosHome = process.env.OHOS_SDK_HOME;
  const sdkEnv = devEcoHome || hosHome || ohosHome;

  const fs = require('fs');
  const path = require('path');
  const home = process.env.HOME || process.env.USERPROFILE || '';

  const idePaths = [
    '/Applications/DevEco-Studio.app',
    `${home}/Applications/DevEco-Studio.app`,
    `${home}/deveco-studio`,
    '/opt/deveco-studio',
    `${home}/DevEco-Studio`,
  ];
  const ideFound = idePaths.find((p) => fs.existsSync(p));

  const cliToolsPresent = commandExists('hvigorw') && commandExists('ohpm');

  if (!sdkEnv && !ideFound && !cliToolsPresent) {
    return {
      name: 'OpenHarmony SDK',
      status: 'warning',
      message: 'Not found (needed for HarmonyOS builds)',
      fix: 'Install DevEco Studio or command-line tools, and set DEVECO_SDK_HOME / HOS_SDK_HOME. See https://developer.huawei.com/consumer/cn/deveco-studio/',
    };
  }

  const details: string[] = [];
  if (ideFound) details.push(`IDE: ${path.basename(ideFound)}`);
  if (sdkEnv) details.push(`SDK: ${sdkEnv}`);
  if (!ideFound && !sdkEnv && cliToolsPresent) details.push('CLI tools in PATH');

  return {
    name: 'OpenHarmony SDK',
    status: 'ok',
    version: sdkEnv || (ideFound ? path.basename(ideFound) : 'cli-tools'),
    message: details.join(', '),
  };
}

function checkHvigor(): DoctorCheck {
  const version = getCommandVersion('hvigorw');
  if (!version) {
    return {
      name: 'hvigorw',
      status: 'warning',
      message: 'Not found (HarmonyOS build tool)',
      fix: 'Install DevEco Studio or OpenHarmony command-line tools, then add hvigor/bin to PATH',
    };
  }
  return {
    name: 'hvigorw',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkOhpm(): DoctorCheck {
  const version = getCommandVersion('ohpm');
  if (!version) {
    return {
      name: 'ohpm',
      status: 'warning',
      message: 'Not found (OpenHarmony package manager)',
      fix: 'Install DevEco Studio or OpenHarmony command-line tools, then add ohpm/bin to PATH',
    };
  }
  return {
    name: 'ohpm',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkHdc(): DoctorCheck {
  const version = getCommandVersion('hdc', 'version');
  if (!version) {
    return {
      name: 'hdc',
      status: 'warning',
      message: 'Not found (HarmonyOS device connector)',
      fix: 'Install DevEco Studio or OpenHarmony command-line tools, then add SDK toolchains dir to PATH',
    };
  }
  return {
    name: 'hdc',
    status: 'ok',
    version,
    message: 'Installed',
  };
}

function checkGit(): DoctorCheck {
  const version = getCommandVersion('git');
  if (!version) {
    return {
      name: 'Git',
      status: 'warning',
      message: 'Not found',
      fix: 'Install Git from https://git-scm.com',
    };
  }
  return {
    name: 'Git',
    status: 'ok',
    version,
    message: 'Installed',
  };
}
