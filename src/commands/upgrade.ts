import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { fetchRegistry } from '../template/registry';
import { writeFile, readFileSafe } from '../utils/fs';
import * as logger from '../utils/logger';

export interface UpgradeOptions {
  dir?: string;
  kuiklyVersion?: string;
  kotlinVersion?: string;
  dryRun?: boolean;
}

/**
 * Upgrade Kuikly SDK and Kotlin versions in an existing project.
 */
export async function upgrade(options: UpgradeOptions): Promise<CommandResult> {
  const projectDir = options.dir || process.cwd();

  // Check project
  const buildVarPath = path.join(projectDir, 'buildSrc/src/main/java/KotlinBuildVar.kt');
  if (!fs.existsSync(buildVarPath)) {
    return {
      success: false,
      command: 'upgrade',
      error: {
        code: 'NOT_IN_PROJECT',
        message: 'Could not find buildSrc/src/main/java/KotlinBuildVar.kt',
        details: 'Run this command from a Kuikly project root.',
      },
    };
  }

  // Fetch latest versions
  const registry = await fetchRegistry();
  const targetKuikly = options.kuiklyVersion || registry.kuiklyVersions.latest;
  const targetKotlin = options.kotlinVersion || registry.kotlinVersions.latest;

  // Read current version
  let buildVar = fs.readFileSync(buildVarPath, 'utf-8');
  const currentKuikly = buildVar.match(/KUIKLY_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const currentKotlin = buildVar.match(/KOTLIN_VERSION\s*=\s*"([^"]+)"/)?.[1];

  logger.section('Version Upgrade');
  logger.kv('Kuikly SDK', `${currentKuikly} → ${targetKuikly}`);
  logger.kv('Kotlin', `${currentKotlin} → ${targetKotlin}`);

  if (options.dryRun) {
    logger.info('Dry run — no files modified.');
    return {
      success: true,
      command: 'upgrade',
      data: {
        dryRun: true,
        currentKuikly,
        targetKuikly,
        currentKotlin,
        targetKotlin,
      },
    };
  }

  // Update KotlinBuildVar.kt
  buildVar = buildVar.replace(
    /KUIKLY_VERSION\s*=\s*"[^"]+"/,
    `KUIKLY_VERSION = "${targetKuikly}"`
  );
  buildVar = buildVar.replace(
    /KOTLIN_VERSION\s*=\s*"[^"]+"/,
    `KOTLIN_VERSION = "${targetKotlin}"`
  );
  writeFile(buildVarPath, buildVar);

  const updatedFiles = [buildVarPath];

  // Update root build.gradle.kts kotlin version references
  const rootBuildGradle = path.join(projectDir, 'build.gradle.kts');
  if (fs.existsSync(rootBuildGradle)) {
    let content = fs.readFileSync(rootBuildGradle, 'utf-8');
    if (currentKotlin && targetKotlin !== currentKotlin) {
      content = content.replace(
        new RegExp(`version\\("${currentKotlin.replace(/\./g, '\\.')}"\\)`, 'g'),
        `version("${targetKotlin}")`
      );
      writeFile(rootBuildGradle, content);
      updatedFiles.push(rootBuildGradle);
    }
  }

  // Update Podfile kuikly version
  const podfilePath = path.join(projectDir, 'iosApp', 'Podfile');
  if (fs.existsSync(podfilePath)) {
    let podContent = fs.readFileSync(podfilePath, 'utf-8');
    if (currentKuikly) {
      podContent = podContent.replace(
        new RegExp(`OpenKuiklyIOSRender.*'${currentKuikly.replace(/\./g, '\\.')}'`),
        `OpenKuiklyIOSRender', '${targetKuikly}'`
      );
      writeFile(podfilePath, podContent);
      updatedFiles.push(podfilePath);
    }
  }

  logger.success('Upgrade completed!');

  return {
    success: true,
    command: 'upgrade',
    data: {
      message: 'Project upgraded successfully',
      kuiklyVersion: targetKuikly,
      kotlinVersion: targetKotlin,
    },
    files: updatedFiles.map((f) => path.relative(projectDir, f)),
    nextSteps: [
      'Run: ./gradlew clean to clear caches',
      'Sync project in Android Studio',
      'cd iosApp && pod install --repo-update (if using iOS)',
    ],
  };
}
