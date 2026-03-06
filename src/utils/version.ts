/**
 * Version mapping utilities.
 * Maps Kotlin versions to corresponding KSP, AGP, and Kuikly dependency versions.
 */

export interface VersionInfo {
  kotlinVersion: string;
  kspVersion: string;
  agpVersion: string;
  composeVersion: string;
  gradleVersion: string;
}

const VERSION_MAP: Record<string, VersionInfo> = {
  '2.1.21': {
    kotlinVersion: '2.1.21',
    kspVersion: '2.1.21-2.0.1',
    agpVersion: '8.2.2',
    composeVersion: '1.7.3',
    gradleVersion: '8.5',
  },
  '1.9.22': {
    kotlinVersion: '1.9.22',
    kspVersion: '1.9.22-1.0.16',
    agpVersion: '7.4.2',
    composeVersion: '1.7.3',
    gradleVersion: '8.5',
  },
};

/**
 * Get version info for a given Kotlin version.
 */
export function getVersionInfo(kotlinVersion: string): VersionInfo {
  const info = VERSION_MAP[kotlinVersion];
  if (!info) {
    // Default to latest known
    return VERSION_MAP['2.1.21'];
  }
  return info;
}

/**
 * Compute the full Kuikly dependency version string.
 * Format: {kuiklyBaseVersion}-{kotlinVersion}
 */
export function getKuiklyDependencyVersion(kuiklyVersion: string, kotlinVersion: string): string {
  return `${kuiklyVersion}-${kotlinVersion}`;
}

/**
 * Check if a Kotlin version is K2 (2.x).
 */
export function isK2(kotlinVersion: string): boolean {
  const major = parseInt(kotlinVersion.split('.')[0], 10);
  return major >= 2;
}

/**
 * Get supported Kotlin versions.
 */
export function getSupportedKotlinVersions(): string[] {
  return Object.keys(VERSION_MAP);
}
