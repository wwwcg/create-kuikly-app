import chalk from 'chalk';
import { CommandResult, DoctorCheck } from '../types';

let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Log info message (suppressed in JSON mode).
 */
export function info(message: string): void {
  if (!jsonMode) {
    console.log(chalk.cyan('ℹ ') + message);
  }
}

/**
 * Log success message (suppressed in JSON mode).
 */
export function success(message: string): void {
  if (!jsonMode) {
    console.log(chalk.green('✅ ') + message);
  }
}

/**
 * Log warning message (suppressed in JSON mode).
 */
export function warn(message: string): void {
  if (!jsonMode) {
    console.log(chalk.yellow('⚠️  ') + message);
  }
}

/**
 * Log error message (suppressed in JSON mode).
 */
export function error(message: string): void {
  if (!jsonMode) {
    console.error(chalk.red('❌ ') + message);
  }
}

/**
 * Log a step in a process (suppressed in JSON mode).
 */
export function step(index: number, total: number, message: string): void {
  if (!jsonMode) {
    console.log(chalk.gray(`[${index}/${total}]`) + ' ' + message);
  }
}

/**
 * Log a section header (suppressed in JSON mode).
 */
export function section(title: string): void {
  if (!jsonMode) {
    console.log('\n' + chalk.bold.underline(title));
  }
}

/**
 * Log a key-value pair (suppressed in JSON mode).
 */
export function kv(key: string, value: string): void {
  if (!jsonMode) {
    console.log(`  ${chalk.gray(key + ':')} ${value}`);
  }
}

/**
 * Log a tree structure for project output (suppressed in JSON mode).
 */
export function tree(label: string, description: string): void {
  if (!jsonMode) {
    console.log(`  ${chalk.cyan('├──')} ${chalk.bold(label)} ${chalk.gray(`(${description})`)}`);
  }
}

export function treeEnd(label: string, description: string): void {
  if (!jsonMode) {
    console.log(`  ${chalk.cyan('└──')} ${chalk.bold(label)} ${chalk.gray(`(${description})`)}`);
  }
}

/**
 * Output a structured result (always printed, in JSON mode outputs JSON).
 */
export function result(res: CommandResult): void {
  if (jsonMode) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    if (res.success) {
      success(res.data?.message as string || 'Done!');
    } else {
      error(res.error?.message || 'Unknown error');
      if (res.error?.details) {
        console.log(chalk.gray('  ' + res.error.details));
      }
    }
    if (res.nextSteps && res.nextSteps.length > 0) {
      section('Next steps');
      res.nextSteps.forEach((step, i) => {
        console.log(`  ${chalk.green(`${i + 1}.`)} ${step}`);
      });
      console.log('');
    }
  }
}

/**
 * Output doctor check results.
 */
export function doctorResults(checks: DoctorCheck[]): void {
  if (jsonMode) {
    console.log(JSON.stringify({ checks }, null, 2));
    return;
  }
  section('Environment Check');
  for (const check of checks) {
    const icon = check.status === 'ok' ? chalk.green('✓')
      : check.status === 'warning' ? chalk.yellow('⚠')
      : check.status === 'error' ? chalk.red('✗')
      : chalk.gray('?');
    const version = check.version ? chalk.gray(` (${check.version})`) : '';
    console.log(`  ${icon} ${check.name}${version} — ${check.message}`);
    if (check.fix) {
      console.log(`    ${chalk.gray('Fix:')} ${check.fix}`);
    }
  }
  console.log('');
}
