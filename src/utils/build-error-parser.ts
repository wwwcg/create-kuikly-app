/**
 * Build Error Parser — Extracts structured diagnostic information from
 * Gradle/Kotlin/Android build output for AI Agent consumption.
 */

export interface BuildDiagnostic {
  /** error | warning */
  severity: 'error' | 'warning';
  /** Source file path (if available) */
  file?: string;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
  /** Error/warning message */
  message: string;
  /** Error category for Agent decision-making */
  category: DiagnosticCategory;
}

export type DiagnosticCategory =
  | 'kotlin_compilation'    // Kotlin source code error
  | 'java_compilation'      // Java source code error
  | 'dependency_resolution' // Missing or conflicting dependency
  | 'dexing'                // D8/R8 dexing failure
  | 'resource'              // Android resource error
  | 'configuration'         // Gradle configuration error
  | 'sdk_missing'           // Missing SDK/tool
  | 'version_mismatch'      // Version incompatibility
  | 'unknown';

export interface ParsedBuildError {
  /** Overall failure description */
  summary: string;
  /** Individual diagnostics */
  diagnostics: BuildDiagnostic[];
  /** Suggested fixes (human-readable) */
  suggestions: string[];
  /** The raw "What went wrong" section from Gradle */
  rawFailure?: string;
}

/**
 * Parse Gradle build output and extract structured error information.
 */
export function parseBuildOutput(combined: string): ParsedBuildError {
  const diagnostics: BuildDiagnostic[] = [];
  const suggestions: string[] = [];
  let summary = 'Build failed';
  let rawFailure: string | undefined;

  // Extract Gradle "What went wrong" section
  const whatWentWrong = combined.match(/\* What went wrong:\n([\s\S]*?)(?=\n\* Try:|\n\* Exception:)/);
  if (whatWentWrong) {
    rawFailure = whatWentWrong[1].trim();
    summary = rawFailure.split('\n')[0];
  }

  // ─── Kotlin compilation errors ─────────────────────────
  // Kotlin 1.x format: e: /path/File.kt:42:10: Error message  (colon after column)
  // Kotlin 2.x format: e: file:///path/File.kt:42:10 Error message  (space after column)
  const kotlinErrorRegex = /e: (?:file:\/\/)?([^:\s]+\.kt):(\d+):(\d+)[:\s]\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = kotlinErrorRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'error',
      file: cleanPath(match[1]),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: match[4].trim(),
      category: 'kotlin_compilation',
    });
  }

  // Kotlin warnings (same dual format)
  const kotlinWarnRegex = /w: (?:file:\/\/)?([^:\s]+\.kt):(\d+):(\d+)[:\s]\s*(.+)/g;
  while ((match = kotlinWarnRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'warning',
      file: cleanPath(match[1]),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: match[4].trim(),
      category: 'kotlin_compilation',
    });
  }

  // ─── Java compilation errors ───────────────────────────
  // Pattern: /path/to/File.java:42: error: message
  const javaErrorRegex = /([^\s]+\.java):(\d+):\s*error:\s*(.+)/g;
  while ((match = javaErrorRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'error',
      file: cleanPath(match[1]),
      line: parseInt(match[2], 10),
      message: match[3].trim(),
      category: 'java_compilation',
    });
  }

  // ─── Dependency resolution errors ──────────────────────
  const depErrorRegex = /Could not resolve (?:all files for|dependency)\s+.*?['":]([^\s'"]+)/g;
  while ((match = depErrorRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'error',
      message: `Could not resolve dependency: ${match[1]}`,
      category: 'dependency_resolution',
    });
  }

  // ─── Dexing errors ─────────────────────────────────────
  if (combined.includes('Error while dexing') || combined.includes('DexingWithClasspathTransform')) {
    diagnostics.push({
      severity: 'error',
      message: 'D8/R8 dexing failed. This often indicates AGP version is too old for the Kotlin version.',
      category: 'dexing',
    });
    suggestions.push('Try upgrading AGP version in build.gradle.kts (8.2+ recommended for Kotlin 2.1.x)');
  }

  // ─── Android resource errors ───────────────────────────
  const resErrorRegex = /AAPT:\s*error:\s*(.+)/g;
  while ((match = resErrorRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'error',
      message: match[1].trim(),
      category: 'resource',
    });
  }

  // ─── SDK missing ───────────────────────────────────────
  if (combined.includes('SDK location not found') || combined.includes('ANDROID_HOME')) {
    diagnostics.push({
      severity: 'error',
      message: 'Android SDK not found. Set ANDROID_HOME environment variable.',
      category: 'sdk_missing',
    });
    suggestions.push('Set ANDROID_HOME: export ANDROID_HOME=/path/to/android/sdk');
  }

  // ─── Unresolved reference (common Kotlin error) ────────
  const unresolvedRegex = /Unresolved reference:?\s*'?([^'\s]+)'?/g;
  while ((match = unresolvedRegex.exec(combined)) !== null) {
    // Only add as suggestion if not already captured as a diagnostic
    const symbol = match[1];
    if (!diagnostics.some(d => d.message.includes(symbol))) {
      suggestions.push(`Unresolved reference "${symbol}" — check imports and dependency declarations`);
    }
  }

  // ─── Version mismatch indicators ───────────────────────
  if (combined.includes('incompatible') && combined.includes('version')) {
    diagnostics.push({
      severity: 'error',
      message: 'Version incompatibility detected between project dependencies.',
      category: 'version_mismatch',
    });
    suggestions.push('Run "kuikly doctor" to check environment, then "kuikly upgrade" to align versions');
  }

  // ─── Gradle configuration errors ───────────────────────
  const configErrorRegex = /A problem occurred (?:configuring|evaluating) (?:project|root project) '([^']+)'\.\n>\s*(.+)/g;
  while ((match = configErrorRegex.exec(combined)) !== null) {
    diagnostics.push({
      severity: 'error',
      message: `Configuration error in project '${match[1]}': ${match[2].trim()}`,
      category: 'configuration',
    });
  }

  // ─── Generate suggestions from Kotlin errors ───────────
  for (const diag of diagnostics) {
    if (diag.category === 'kotlin_compilation' && diag.severity === 'error') {
      if (diag.message.includes('Unresolved reference')) {
        const ref = diag.message.match(/Unresolved reference:?\s*'?([^'\s]+)'?/);
        if (ref) {
          suggestions.push(`"${ref[1]}" is unresolved in ${diag.file}:${diag.line} — check spelling, imports, and that the dependency is declared`);
        }
      } else if (diag.message.includes('Type mismatch')) {
        suggestions.push(`Type mismatch at ${diag.file}:${diag.line} — ${diag.message}`);
      } else if (diag.message.includes('overrides nothing')) {
        suggestions.push(`${diag.file}:${diag.line} — method signature doesn't match superclass. Check parameter types.`);
      }
    }
  }

  // Deduplicate suggestions
  const uniqueSuggestions = [...new Set(suggestions)];

  return {
    summary,
    diagnostics,
    suggestions: uniqueSuggestions,
    rawFailure,
  };
}

/**
 * Remove file:// prefix and normalize path.
 */
function cleanPath(rawPath: string): string {
  return rawPath.replace(/^file:\/\//, '').replace(/^\/\//, '/');
}
