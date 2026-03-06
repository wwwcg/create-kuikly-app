/**
 * Project configuration — all parameters needed to generate a Kuikly project.
 */
export interface ProjectConfig {
  /** Project name (also used as the root directory name) */
  projectName: string;
  /** Java/Kotlin package name, e.g. "com.example.myapp" */
  packageName: string;
  /** DSL type: "kuikly" (classic) or "compose" */
  dsl: 'kuikly' | 'compose';
  /** Kotlin version */
  kotlinVersion: string;
  /** Kuikly SDK version (resolved from registry) */
  kuiklyVersion: string;
  /** Shared KMP module name */
  sharedModuleName: string;
  /** Android app module name */
  androidAppName: string;
  /** iOS app module name */
  iosAppName: string;
  /** HarmonyOS (ohos) app module name */
  ohosAppName: string;
  /** H5 app module name */
  h5AppName: string;
  /** Mini program app module name */
  miniAppName: string;
  /** Artifact name for .aar / .framework */
  artifactName: string;
  /** Include H5 web app */
  includeH5: boolean;
  /** Include mini program app */
  includeMiniApp: boolean;
  /** Output directory (where the project folder will be created) */
  outputDir: string;
}

/**
 * Handlebars template context — derived from ProjectConfig
 * with extra computed properties.
 */
export interface TemplateContext extends ProjectConfig {
  /** Package path for directory structure, e.g. "com/example/myapp" */
  packagePath: string;
  /** Whether the DSL is compose */
  isCompose: boolean;
  /** Whether Kotlin 2.x is used */
  isK2: boolean;
  /** Kuikly version string for dependencies (e.g. "2.7.0-2.1.21") */
  kuiklyDependencyVersion: string;
  /** KSP version matching the Kotlin version */
  kspVersion: string;
  /** AGP version */
  agpVersion: string;
  /** Compose Multiplatform version (only relevant if isCompose) */
  composeVersion: string;
  /** Gradle version */
  gradleVersion: string;
}

/**
 * Remote template registry format.
 */
export interface TemplateRegistry {
  version: string;
  /** URL where templates are hosted */
  baseUrl: string;
  /** Latest versions info */
  kuiklyVersions: {
    latest: string;
    supported: string[];
  };
  kotlinVersions: {
    latest: string;
    supported: string[];
  };
  /** Available project templates */
  templates: TemplateInfo[];
}

export interface TemplateInfo {
  /** Template identifier, e.g. "kuikly", "compose" */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Description */
  description: string;
  /** Template version */
  version: string;
  /** Is this the default template? */
  default?: boolean;
  /** Download URL for the template archive (optional, can be derived from baseUrl) */
  url?: string;
}

/**
 * Template manifest (template.json inside each template directory).
 */
export interface TemplateManifest {
  name: string;
  version: string;
  description: string;
  /** Variable definitions with defaults */
  variables: Record<string, {
    description: string;
    default?: string;
    required?: boolean;
  }>;
  /** Post-creation hooks (commands to run) */
  postCreate?: PostCreateHook[];
}

export interface PostCreateHook {
  /** Human-readable description */
  description: string;
  /** Command to run */
  command: string;
  /** Working directory (relative to project root) */
  cwd?: string;
  /** Continue if this command fails? */
  optional?: boolean;
  /** Platform constraint: only run on this platform */
  platform?: 'darwin' | 'linux' | 'win32';
}

/**
 * Structured result for AI Agent consumption.
 */
export interface CommandResult {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  /** Created files list (for create commands) */
  files?: string[];
  /** Next steps / suggestions */
  nextSteps?: string[];
}

/**
 * Doctor check result.
 */
export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warning' | 'error' | 'not_found';
  version?: string;
  message: string;
  fix?: string;
}
