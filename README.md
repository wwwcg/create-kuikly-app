# create-kuikly-app

CLI tool for the [Kuikly](https://github.com/nicosResOrg/nicosResOrg.github.io) cross-platform framework.  
One command to scaffold a full Kuikly project — **zero IDE interaction required**.

Designed to be **AI Agent friendly**: every command supports `--json` structured output, fully non-interactive operation, and structured error codes.

---

## Quick Start

```bash
# Create a new project (interactive-friendly output)
npx create-kuikly-app create MyApp --package com.example.myapp

# Or with Compose DSL
npx create-kuikly-app create MyApp --package com.example.myapp --dsl compose

# AI Agent mode (JSON output)
npx create-kuikly-app --json create MyApp --package com.example.myapp
```

## Installation

```bash
# Use directly with npx (recommended)
npx create-kuikly-app create MyApp

# Or install globally
npm install -g create-kuikly-app
kuikly create MyApp --package com.example.myapp
```

## Commands

### `kuikly create <project-name>` — Create a new project

```bash
kuikly create MyApp \
  --package com.example.myapp \
  --dsl kuikly \
  --kotlin-version 2.1.21 \
  --kuikly-version 2.7.0 \
  --shared-module shared \
  --h5 \
  --miniapp \
  --skip-setup \
  --force
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --package <name>` | Java/Kotlin package name | `com.example.<project>` |
| `-t, --template <name>` | Template: `kuikly` or `compose` | `kuikly` |
| `-d, --dsl <type>` | DSL type: `kuikly` or `compose` | `kuikly` |
| `--kotlin-version <ver>` | Kotlin version | Latest from registry |
| `--kuikly-version <ver>` | Kuikly SDK version | Latest from registry |
| `--shared-module <name>` | Shared KMP module name | `shared` |
| `--h5` | Include H5 web app module | `false` |
| `--miniapp` | Include mini program module | `false` |
| `--skip-setup` | Skip post-creation setup | `false` |
| `--force` | Overwrite existing directory | `false` |

**Generated project structure:**

```
MyApp/
├── shared/              # KMP shared module (business logic + UI)
│   ├── build.gradle.kts
│   ├── shared.podspec
│   └── src/
│       ├── commonMain/  # Cross-platform Kotlin code
│       ├── androidMain/
│       └── iosMain/
├── androidApp/          # Android application
├── iosApp/              # iOS application (xcodegen + CocoaPods)
├── ohosApp/             # HarmonyOS application
├── buildSrc/            # Centralized version management
├── build.gradle.kts     # Root Gradle build
├── settings.gradle.kts
├── gradlew / gradlew.bat
└── gradle.properties
```

### `kuikly create-page <page-name>` — Add a new page

```bash
# Auto-detects package name and DSL type from project
kuikly create-page UserProfile

# Explicit options
kuikly create-page UserProfile --package com.example.myapp --dsl kuikly --module shared
```

### `kuikly create-component <component-name>` — Add a reusable component

```bash
kuikly create-component ChatBubble
kuikly create-component ChatBubble --package com.example.myapp
```

### `kuikly build <platform>` — Build for a platform

```bash
kuikly build android              # Debug APK
kuikly build android --release    # Release APK
kuikly build ios                  # iOS framework
kuikly build ohos                 # HarmonyOS HAP
kuikly build h5                   # H5 web bundle
```

### `kuikly run <platform>` — Build and run

```bash
kuikly run android                          # Run on connected Android device/emulator
kuikly run ios                              # Run on iOS Simulator
kuikly run ios --device "iPhone 15 Pro"     # Specify simulator
```

### `kuikly publish` — Publish shared module to Maven

```bash
kuikly publish \
  --version 1.0.0 \
  --maven-url https://your-maven-repo.com/releases \
  --maven-user admin \
  --maven-password secret
```

### `kuikly upgrade` — Upgrade SDK versions

```bash
kuikly upgrade                                     # Upgrade to latest
kuikly upgrade --kuikly-version 2.8.0              # Specific Kuikly version
kuikly upgrade --kotlin-version 2.1.21 --dry-run   # Preview changes
```

### `kuikly doctor` — Check development environment

```bash
kuikly doctor

# Output:
# ✓ Node.js (v22.16.0) — Installed
# ✓ Java / JDK (17.0.9) — Installed
# ✓ Android SDK — Found at /Users/you/Library/Android/sdk
# ✓ XcodeGen (2.42.0) — Installed
# ✓ CocoaPods (1.16.2) — Installed
# ...
```

### `kuikly templates` — List available templates

```bash
kuikly templates
```

---

## AI Agent Integration

All commands support `--json` for structured machine-readable output:

```bash
kuikly --json create MyApp --package com.example.myapp --skip-setup
```

**JSON output format:**

```json
{
  "success": true,
  "command": "create",
  "data": {
    "message": "Project \"MyApp\" created successfully",
    "projectDir": "/path/to/MyApp",
    "config": { "projectName": "MyApp", "packageName": "com.example.myapp", ... },
    "elapsed": "0.3s"
  },
  "files": [
    "shared/build.gradle.kts",
    "shared/src/commonMain/kotlin/com/example/myapp/HelloWorldPage.kt",
    "androidApp/build.gradle.kts",
    ...
  ],
  "nextSteps": [
    "cd MyApp",
    "# Android: Open in Android Studio, then Run"
  ]
}
```

**Error output format:**

```json
{
  "success": false,
  "command": "create",
  "error": {
    "code": "DIR_NOT_EMPTY",
    "message": "Directory \"MyApp\" already exists and is not empty.",
    "details": "Use --force to overwrite, or choose a different name."
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_PROJECT_NAME` | Project name contains invalid characters |
| `DIR_NOT_EMPTY` | Target directory already exists |
| `REGISTRY_ERROR` | Failed to fetch template registry |
| `TEMPLATE_NOT_FOUND` | Requested template not available |
| `GENERATION_ERROR` | File generation failed |
| `NOT_IN_PROJECT` | Command run outside a Kuikly project |
| `BUILD_FAILED` | Build process returned non-zero |
| `INVALID_PLATFORM` | Unrecognized platform argument |
| `MISSING_DEPS` | Required tools not installed (doctor) |

### AI Agent Workflow Example

```bash
# 1. Check environment
kuikly --json doctor

# 2. Create project
kuikly --json create TodoApp --package com.example.todo

# 3. Add pages
cd TodoApp
kuikly --json create-page TodoList
kuikly --json create-page TodoDetail

# 4. Add components
kuikly --json create-component TodoItem

# 5. Build
kuikly --json build android

# 6. Upgrade SDK
kuikly --json upgrade --dry-run
kuikly --json upgrade
```

---

## Template System

### Built-in Templates

| Template | Description |
|----------|-------------|
| `kuikly` | Standard Kuikly DSL — declarative UI with `View { attr {} }` syntax |
| `compose` | Compose DSL — Jetpack Compose-style `@Composable` API |

### Remote Templates

Templates are fetched from a remote registry at runtime, so the CLI stays lightweight and templates can be updated independently of CLI releases.

```bash
# Use a custom registry
KUIKLY_REGISTRY_URL=https://your-server.com/registry.json kuikly create MyApp
```

Template cache is stored at `~/.kuikly/cache/`.

### Template File Format

Templates use [Handlebars](https://handlebarsjs.com/) syntax:

- `{{variableName}}` — Variable interpolation
- `{{#if isCompose}} ... {{/if}}` — Conditional blocks
- Files ending in `.hbs` are processed through the template engine
- Directory names with `__variableName__` are dynamically renamed
- Binary files (images, JARs) are copied verbatim

---

## Version Management

The CLI **does not** bundle Kuikly SDK versions. Instead:

1. A remote `registry.json` defines the latest supported versions
2. The CLI fetches this at runtime to resolve default versions
3. You can always pin specific versions via `--kuikly-version` and `--kotlin-version`
4. Projects use `buildSrc/KotlinBuildVar.kt` for centralized version management

This means you **never need to update the CLI** just because a new Kuikly SDK was released.

---

## iOS Project Generation

Instead of embedding a massive `.xcodeproj/project.pbxproj` file, this CLI generates:

1. **`project.yml`** — A concise [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec
2. **`Podfile`** — CocoaPods dependency configuration
3. **Swift source files** — AppDelegate, ViewController, etc.

The Xcode project is generated by running:

```bash
cd iosApp
xcodegen generate    # Generates .xcodeproj from project.yml
pod install          # Installs CocoaPods dependencies
open iosApp.xcworkspace
```

If `xcodegen` and `pod` are available, the `create` command runs these automatically.

---

## Prerequisites

Run `kuikly doctor` to verify your environment. Required tools:

| Tool | Required | Purpose |
|------|----------|---------|
| Node.js 16+ | ✅ | Run the CLI |
| JDK 11+ | ✅ | Compile Kotlin/Android |
| Android SDK | ⚠️ | Android builds |
| Xcode | ⚠️ | iOS builds (macOS only) |
| XcodeGen | ⚠️ | Generate Xcode project |
| CocoaPods | ⚠️ | iOS dependency management |
| Gradle | ⚠️ | Project wrapper setup |
| Git | ⚠️ | Version control |

⚠️ = Optional but recommended for full platform support.

---

## Development

```bash
# Clone and install
git clone https://github.com/nicosResOrg/create-kuikly-app.git
cd create-kuikly-app
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test locally
node dist/index.js create TestApp --package com.test.app --skip-setup
```

---

## License

MIT
