import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { writeFile } from '../utils/fs';
import * as logger from '../utils/logger';

export interface CreatePageOptions {
  /** Package name (auto-detected from build.gradle.kts) */
  package?: string;
  /** DSL type (auto-detected) */
  dsl?: string;
  /** Shared module name */
  module?: string;
  /** Target directory */
  dir?: string;
}

/**
 * Create a new Kuikly page in an existing project.
 */
export async function createPage(
  pageName: string,
  options: CreatePageOptions
): Promise<CommandResult> {
  if (!pageName || !/^[A-Z][a-zA-Z0-9]*$/.test(pageName)) {
    return {
      success: false,
      command: 'create-page',
      error: {
        code: 'INVALID_PAGE_NAME',
        message: `Invalid page name: "${pageName}"`,
        details: 'Page name must start with an uppercase letter and contain only letters/digits (PascalCase).',
      },
    };
  }

  // Auto-detect project settings
  const projectDir = options.dir || process.cwd();
  const detected = detectProjectSettings(projectDir, options.module || 'shared');
  if (!detected.packageName && !options.package) {
    return {
      success: false,
      command: 'create-page',
      error: {
        code: 'NOT_IN_PROJECT',
        message: 'Could not detect Kuikly project.',
        details: 'Run this command from a Kuikly project root or specify --package and --module.',
      },
    };
  }

  const packageName = options.package || detected.packageName;
  const dsl = options.dsl || detected.dsl || 'kuikly';
  const sharedModule = options.module || 'shared';
  const packagePath = packageName.replace(/\./g, '/');

  const targetDir = path.join(
    projectDir,
    sharedModule,
    'src/commonMain/kotlin',
    packagePath
  );

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const fileName = `${pageName}Page.kt`;
  const filePath = path.join(targetDir, fileName);

  if (fs.existsSync(filePath)) {
    return {
      success: false,
      command: 'create-page',
      error: {
        code: 'FILE_EXISTS',
        message: `Page file already exists: ${fileName}`,
        details: `Path: ${filePath}`,
      },
    };
  }

  const content = dsl === 'compose'
    ? generateComposePageContent(packageName, pageName)
    : generateKuiklyPageContent(packageName, pageName);

  writeFile(filePath, content);
  logger.success(`Page "${pageName}" created: ${path.relative(projectDir, filePath)}`);

  return {
    success: true,
    command: 'create-page',
    data: {
      message: `Page "${pageName}" created successfully`,
      pageName,
      filePath: path.relative(projectDir, filePath),
    },
    files: [path.relative(projectDir, filePath)],
    nextSteps: [
      `Edit ${path.relative(projectDir, filePath)} to build your page`,
      `Navigate to it via bridgeModule.openPage("${pageName}")`,
    ],
  };
}

function generateKuiklyPageContent(packageName: string, pageName: string): string {
  return `package ${packageName}

import com.tencent.kuikly.core.annotations.Page
import com.tencent.kuikly.core.base.Color
import com.tencent.kuikly.core.base.ViewBuilder
import com.tencent.kuikly.core.views.Text
import ${packageName}.base.BasePager

@Page("${pageName}", supportInLocal = true)
internal class ${pageName}Page : BasePager() {

    override fun body(): ViewBuilder {
        return {
            attr {
                backgroundColor(Color.WHITE)
                allCenter()
            }

            Text {
                attr {
                    fontSize(20f)
                    text("${pageName} Page")
                    color(Color.BLACK)
                }
            }
        }
    }
}
`;
}

function generateComposePageContent(packageName: string, pageName: string): string {
  return `package ${packageName}

import com.tencent.kuikly.core.annotations.Page
import com.tencent.kuikly.compose.ui.Modifier
import com.tencent.kuikly.compose.foundation.layout.*
import com.tencent.kuikly.compose.material3.Text
import com.tencent.kuikly.compose.runtime.Composable
import com.tencent.kuikly.compose.ui.Alignment
import com.tencent.kuikly.compose.ui.unit.sp

@Page("${pageName}")
@Composable
internal fun ${pageName}Page() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "${pageName} Page",
            fontSize = 20.sp
        )
    }
}
`;
}

function detectProjectSettings(projectDir: string, sharedModule: string): {
  packageName: string;
  dsl: string;
} {
  let packageName = '';
  let dsl = 'kuikly';

  // Try to read shared module's build.gradle.kts for package info
  const buildGradlePath = path.join(projectDir, sharedModule, 'build.gradle.kts');
  if (fs.existsSync(buildGradlePath)) {
    const content = fs.readFileSync(buildGradlePath, 'utf-8');
    const nsMatch = content.match(/namespace\s*=\s*"([^"]+)"/);
    if (nsMatch) {
      // namespace = "com.example.app.shared" → package = "com.example.app"
      packageName = nsMatch[1].replace(/\.shared$/, '');
    }
    if (content.includes('org.jetbrains.compose') || content.includes('plugin.compose')) {
      dsl = 'compose';
    }
  }

  return { packageName, dsl };
}
