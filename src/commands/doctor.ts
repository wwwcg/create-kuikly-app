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

  // ─── Git ─────────────────────────────────────────────
  checks.push(checkGit());

  // Summary
  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  logger.doctorResults(checks);

  if (hasError) {
    logger.error('Some required tools are missing. Please install them before creating a project.');
  } else if (hasWarning) {
    logger.warn('Some optional tools are missing. Core functionality will work.');
  } else {
    logger.success('All checks passed! Your environment is ready for Kuikly development.');
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
  const version = getCommandVersion('xcodebuild');
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
