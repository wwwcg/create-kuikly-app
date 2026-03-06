import * as path from 'path';
import * as fs from 'fs';
import { CommandResult } from '../types';
import { writeFile } from '../utils/fs';
import * as logger from '../utils/logger';

export interface CreateComponentOptions {
  package?: string;
  dsl?: string;
  module?: string;
  dir?: string;
}

/**
 * Create a new Kuikly reusable component.
 */
export async function createComponent(
  componentName: string,
  options: CreateComponentOptions
): Promise<CommandResult> {
  if (!componentName || !/^[A-Z][a-zA-Z0-9]*$/.test(componentName)) {
    return {
      success: false,
      command: 'create-component',
      error: {
        code: 'INVALID_COMPONENT_NAME',
        message: `Invalid component name: "${componentName}"`,
        details: 'Component name must be PascalCase.',
      },
    };
  }

  const projectDir = options.dir || process.cwd();
  const sharedModule = options.module || 'shared';
  const packageName = options.package || detectPackageName(projectDir, sharedModule);
  if (!packageName) {
    return {
      success: false,
      command: 'create-component',
      error: {
        code: 'NOT_IN_PROJECT',
        message: 'Could not detect package name.',
        details: 'Run from project root or specify --package.',
      },
    };
  }

  const dsl = options.dsl || detectDsl(projectDir, sharedModule);
  const packagePath = packageName.replace(/\./g, '/');
  const targetDir = path.join(projectDir, sharedModule, 'src/commonMain/kotlin', packagePath, 'components');

  fs.mkdirSync(targetDir, { recursive: true });

  const fileName = `${componentName}.kt`;
  const filePath = path.join(targetDir, fileName);

  if (fs.existsSync(filePath)) {
    return {
      success: false,
      command: 'create-component',
      error: {
        code: 'FILE_EXISTS',
        message: `Component file already exists: ${fileName}`,
      },
    };
  }

  const content = dsl === 'compose'
    ? generateComposeComponent(packageName, componentName)
    : generateKuiklyComponent(packageName, componentName);

  writeFile(filePath, content);
  logger.success(`Component "${componentName}" created: ${path.relative(projectDir, filePath)}`);

  return {
    success: true,
    command: 'create-component',
    data: {
      message: `Component "${componentName}" created successfully`,
      componentName,
      filePath: path.relative(projectDir, filePath),
    },
    files: [path.relative(projectDir, filePath)],
    nextSteps: [
      `Import and use ${componentName} in your pages`,
    ],
  };
}

function generateKuiklyComponent(packageName: string, name: string): string {
  return `package ${packageName}.components

import com.tencent.kuikly.core.base.*
import com.tencent.kuikly.core.views.*

/**
 * Reusable ${name} component.
 *
 * Usage:
 * \`\`\`
 * ${name}(this) {
 *     // customize attrs
 * }
 * \`\`\`
 */
internal fun ViewContainer<*, *>.${name}(
    pager: IPagerId,
    init: (ComposeView.() -> Unit)? = null
) {
    ComposeView {
        attr {
            // Default layout
            flexDirectionRow()
            allCenter()
        }

        Text {
            attr {
                fontSize(16f)
                text("${name}")
                color(Color.BLACK)
            }
        }

        init?.invoke(this)
    }
}
`;
}

function generateComposeComponent(packageName: string, name: string): string {
  return `package ${packageName}.components

import com.tencent.kuikly.compose.foundation.layout.*
import com.tencent.kuikly.compose.material3.Text
import com.tencent.kuikly.compose.runtime.Composable
import com.tencent.kuikly.compose.ui.Alignment
import com.tencent.kuikly.compose.ui.Modifier
import com.tencent.kuikly.compose.ui.unit.sp

/**
 * Reusable ${name} component.
 *
 * Usage:
 * \`\`\`
 * ${name}(modifier = Modifier)
 * \`\`\`
 */
@Composable
internal fun ${name}(
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "${name}",
            fontSize = 16.sp
        )
    }
}
`;
}

function detectPackageName(dir: string, module: string): string {
  const gradlePath = path.join(dir, module, 'build.gradle.kts');
  if (fs.existsSync(gradlePath)) {
    const content = fs.readFileSync(gradlePath, 'utf-8');
    const match = content.match(/namespace\s*=\s*"([^"]+)"/);
    if (match) return match[1].replace(/\.shared$/, '');
  }
  return '';
}

function detectDsl(dir: string, module: string): string {
  const gradlePath = path.join(dir, module, 'build.gradle.kts');
  if (fs.existsSync(gradlePath)) {
    const content = fs.readFileSync(gradlePath, 'utf-8');
    if (content.includes('org.jetbrains.compose')) return 'compose';
  }
  return 'kuikly';
}
