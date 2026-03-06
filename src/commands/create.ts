import * as path from 'path';
import * as fs from 'fs';
import { ProjectConfig, TemplateContext, CommandResult } from '../types';
import { processTemplateDir, buildContext } from '../template/engine';
import { fetchRegistry, resolveTemplatePath } from '../template/registry';
import { getVersionInfo, getKuiklyDependencyVersion, isK2 } from '../utils/version';
import { commandExists, execAsync, getCommandVersion } from '../utils/exec';
import { exists, isEmptyDir, makeExecutable, writeFile, collectFiles } from '../utils/fs';
import * as logger from '../utils/logger';

export interface CreateOptions {
  /** Package name */
  package?: string;
  /** Template name */
  template?: string;
  /** Kotlin version */
  kotlinVersion?: string;
  /** Kuikly SDK version */
  kuiklyVersion?: string;
  /** DSL type */
  dsl?: string;
  /** Shared module name */
  sharedModule?: string;
  /** Include H5 web app */
  h5?: boolean;
  /** Include mini program app */
  miniapp?: boolean;
  /** Skip post-creation setup */
  skipSetup?: boolean;
  /** Force creation even if directory exists */
  force?: boolean;
}

/**
 * Main create command handler.
 */
export async function createProject(
  projectName: string,
  options: CreateOptions
): Promise<CommandResult> {
  const startTime = Date.now();

  // ─── 1. Validate project name ────────────────────────
  if (!projectName || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(projectName)) {
    return {
      success: false,
      command: 'create',
      error: {
        code: 'INVALID_PROJECT_NAME',
        message: `Invalid project name: "${projectName}"`,
        details: 'Project name must start with a letter, and contain only letters, digits, hyphens, or underscores.',
      },
    };
  }

  // ─── 2. Resolve output directory ─────────────────────
  const outputDir = path.resolve(process.cwd(), projectName);
  if (exists(outputDir) && !isEmptyDir(outputDir) && !options.force) {
    return {
      success: false,
      command: 'create',
      error: {
        code: 'DIR_NOT_EMPTY',
        message: `Directory "${projectName}" already exists and is not empty.`,
        details: 'Use --force to overwrite, or choose a different name.',
      },
    };
  }

  // ─── 3. Fetch template registry ──────────────────────
  logger.step(1, 6, 'Fetching template registry...');
  let registry;
  try {
    registry = await fetchRegistry();
  } catch (err) {
    return {
      success: false,
      command: 'create',
      error: {
        code: 'REGISTRY_ERROR',
        message: 'Failed to fetch template registry',
        details: String(err),
      },
    };
  }

  // ─── 4. Resolve parameters ───────────────────────────
  logger.step(2, 6, 'Resolving project configuration...');

  const dsl = (options.dsl === 'compose' ? 'compose' : 'kuikly') as 'kuikly' | 'compose';
  const templateName = options.template || dsl;
  const kotlinVersion = options.kotlinVersion || registry.kotlinVersions.latest;
  const kuiklyVersion = options.kuiklyVersion || registry.kuiklyVersions.latest;
  const packageName = options.package || `com.example.${projectName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const sharedModuleName = options.sharedModule || 'shared';

  const versionInfo = getVersionInfo(kotlinVersion);

  const config: ProjectConfig = {
    projectName,
    packageName,
    dsl,
    kotlinVersion,
    kuiklyVersion,
    sharedModuleName,
    androidAppName: 'androidApp',
    iosAppName: 'iosApp',
    ohosAppName: 'ohosApp',
    h5AppName: 'h5App',
    miniAppName: 'miniApp',
    artifactName: sharedModuleName,
    includeH5: options.h5 || false,
    includeMiniApp: options.miniapp || false,
    outputDir,
  };

  const context: TemplateContext = buildContext({
    ...config,
    kspVersion: versionInfo.kspVersion,
    agpVersion: versionInfo.agpVersion,
    composeVersion: versionInfo.composeVersion,
    gradleVersion: versionInfo.gradleVersion,
  });

  // Log config
  logger.section('Project Configuration');
  logger.kv('Name', projectName);
  logger.kv('Package', packageName);
  logger.kv('DSL', dsl);
  logger.kv('Kotlin', kotlinVersion);
  logger.kv('Kuikly SDK', kuiklyVersion);
  logger.kv('Template', templateName);

  // ─── 5. Resolve template path ────────────────────────
  logger.step(3, 6, 'Resolving template...');
  let templateDir: string;
  try {
    templateDir = await resolveTemplatePath(registry, templateName);
  } catch (err) {
    return {
      success: false,
      command: 'create',
      error: {
        code: 'TEMPLATE_NOT_FOUND',
        message: `Template "${templateName}" not found`,
        details: String(err),
      },
    };
  }

  // ─── 6. Generate project files ───────────────────────
  logger.step(4, 6, 'Generating project files...');
  let generatedFiles: string[];
  try {
    generatedFiles = processTemplateDir(templateDir, outputDir, context);
  } catch (err) {
    return {
      success: false,
      command: 'create',
      error: {
        code: 'GENERATION_ERROR',
        message: 'Failed to generate project files',
        details: String(err),
      },
    };
  }

  // ─── 7. Generate Gradle wrapper scripts ──────────────
  logger.step(5, 6, 'Setting up Gradle wrapper...');
  generateGradleWrapperScripts(outputDir);

  // ─── 8. Post-creation setup ──────────────────────────
  logger.step(6, 6, 'Post-creation setup...');
  const nextSteps: string[] = [];

  if (!options.skipSetup) {
    await runPostCreateSetup(outputDir, config, nextSteps);
  }

  // Always add helpful next steps
  nextSteps.push(`cd ${projectName}`);
  if (process.platform === 'darwin') {
    nextSteps.push('# Android: Open project in Android Studio, then Run');
    nextSteps.push(`# iOS: cd ${config.iosAppName} && pod install && open ${config.iosAppName}.xcworkspace`);
  } else {
    nextSteps.push('# Android: Open project in Android Studio, then Run');
  }
  nextSteps.push('# HarmonyOS: Open ohosApp in DevEco Studio');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Success summary
  logger.success(`Project "${projectName}" created successfully in ${elapsed}s!`);
  logger.section('Generated Modules');
  logger.tree(config.sharedModuleName, 'KMP shared module');
  logger.tree(config.androidAppName, 'Android app');
  logger.tree(config.iosAppName, 'iOS app');
  logger.tree(config.ohosAppName, 'HarmonyOS app');
  if (config.includeH5) logger.tree(config.h5AppName, 'H5 web app');
  if (config.includeMiniApp) logger.treeEnd(config.miniAppName, 'Mini program');
  else logger.treeEnd('buildSrc', 'Version management');

  return {
    success: true,
    command: 'create',
    data: {
      message: `Project "${projectName}" created successfully`,
      projectDir: outputDir,
      config,
      elapsed: `${elapsed}s`,
    },
    files: generatedFiles,
    nextSteps,
  };
}

/**
 * Generate gradlew / gradlew.bat wrapper scripts.
 */
function generateGradleWrapperScripts(outputDir: string): void {
  // gradlew (Unix)
  const gradlewContent = `#!/bin/sh

#
# Copyright © 2015-2021 the original authors.
#
# Auto-generated by create-kuikly-app.
#

# Attempt to set APP_HOME
APP_HOME=$( cd -- "$( dirname -- "\${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# Add default JVM options here.
DEFAULT_JVM_OPTS='"-Xmx64m" "-Xms64m"'

# Use the maximum available, or set MAX_FD != -1 to use that value.
MAX_FD=maximum

# Resolve JAVA_HOME
if [ -n "$JAVA_HOME" ] ; then
    JAVACMD="$JAVA_HOME/bin/java"
else
    JAVACMD=java
fi

# Increase the maximum file descriptors if we can.
if ! "$cygwin" && ! "$darwin" && ! "$nonstop" ; then
    case $MAX_FD in
      max*)
        MAX_FD=$( ulimit -H -n ) ||
            warn "Could not query maximum file descriptor limit"
      ;;
    esac
    case $MAX_FD in
      '' | soft) :;;
      *)
        ulimit -n "$MAX_FD" ||
            warn "Could not set maximum file descriptor limit to $MAX_FD"
      ;;
    esac
fi

CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar

exec "$JAVACMD" \\
    $DEFAULT_JVM_OPTS \\
    $JAVA_OPTS \\
    $GRADLE_OPTS \\
    "-Dorg.gradle.appname=$APP_BASE_NAME" \\
    -classpath "$CLASSPATH" \\
    org.gradle.wrapper.GradleWrapperMain \\
    "$@"
`;

  // gradlew.bat (Windows)
  const gradlewBatContent = `@rem
@rem Copyright 2015 the original author or authors.
@rem Auto-generated by create-kuikly-app.
@rem

@if "%DEBUG%"=="" @echo off

set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"
set DIRNAME=%~dp0
set APP_HOME=%DIRNAME%

set CLASSPATH=%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar

@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if %ERRORLEVEL% equ 0 goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
set EXIT_CODE=%ERRORLEVEL%

:mainEnd
exit /b %EXIT_CODE%
`;

  writeFile(path.join(outputDir, 'gradlew'), gradlewContent);
  writeFile(path.join(outputDir, 'gradlew.bat'), gradlewBatContent);
  makeExecutable(path.join(outputDir, 'gradlew'));
}

/**
 * Run post-creation setup commands.
 */
async function runPostCreateSetup(
  outputDir: string,
  config: ProjectConfig,
  nextSteps: string[]
): Promise<void> {
  // 1. Try to download Gradle wrapper jar
  if (commandExists('gradle')) {
    logger.info('Found Gradle — downloading wrapper JAR...');
    const result = await execAsync(
      `gradle wrapper --gradle-version 8.5 --distribution-type bin`,
      outputDir
    );
    if (result.exitCode !== 0) {
      logger.warn('Could not generate Gradle wrapper. Please run: gradle wrapper --gradle-version 8.5');
      nextSteps.unshift('gradle wrapper --gradle-version 8.5');
    }
  } else {
    logger.warn('Gradle not found. You need to download the gradle-wrapper.jar manually.');
    nextSteps.unshift(
      'Download gradle-wrapper.jar from https://services.gradle.org/distributions/ or install Gradle and run: gradle wrapper --gradle-version 8.5'
    );
  }

  // 2. iOS: run xcodegen + pod install (macOS only)
  if (process.platform === 'darwin') {
    const iosDir = path.join(outputDir, config.iosAppName);
    
    if (commandExists('xcodegen')) {
      logger.info('Found xcodegen — generating Xcode project...');
      const xcodegenResult = await execAsync('xcodegen generate', iosDir);
      if (xcodegenResult.exitCode !== 0) {
        logger.warn('xcodegen failed. Run manually: cd iosApp && xcodegen generate');
        nextSteps.unshift(`cd ${config.iosAppName} && xcodegen generate`);
      }
    } else {
      logger.warn('xcodegen not found. Install with: brew install xcodegen');
      nextSteps.unshift(`brew install xcodegen && cd ${config.iosAppName} && xcodegen generate`);
    }

    if (commandExists('pod')) {
      logger.info('Found CocoaPods — installing pods...');
      const podResult = await execAsync('pod install --repo-update', iosDir);
      if (podResult.exitCode !== 0) {
        logger.warn('pod install failed. Run manually after Gradle sync.');
      }
    } else {
      logger.warn('CocoaPods not found. Install with: sudo gem install cocoapods');
    }
  }
}
