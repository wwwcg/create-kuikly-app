# 让 AI Agent 自己开发一个 Kuikly 跨端 App

> 我们为 Kuikly 打造了一套 AI Agent 开发工具链，让 Claude、OpenClaw 等 AI Agent 能自主完成从项目创建到编译预览的完整跨端 App 开发流程。本文记录了整个实践过程和技术思考。

---

## 一、引子：当 AI Agent 想学一个新框架

想象一下这个场景——

你对 AI 说：**"帮我用 Kuikly 开发一个 TodoApp，支持 Android、iOS 和鸿蒙。"**

AI 回复：*"好的，正在创建项目..."*

然后你看着它：自动创建项目 → 编写页面代码 → 编译 → 发现报错 → 自动修复 → 重新编译 → 成功 → 安装到模拟器 → 截图给你看效果 → 你说"把标题改成蓝色" → 改代码 → 再截一张图...

**这不是科幻，这是我们正在做的事情。**

---

## 二、背景：为什么 AI Agent 需要"技能"

2025-2026 年，AI Agent 生态爆发。[OpenClaw](https://clawhub.ai/) 上已经有大量 Skills 供 AI Agent 使用——从操作数据库到部署网站，Agent 正在学会越来越多的事情。

但有一个领域还相对空白：**跨端 App 开发**。

原因很简单：

| 挑战 | 说明 |
|------|------|
| 🔧 环境复杂 | JDK、Android SDK、Xcode、CocoaPods、Gradle... 工具链又长又脆弱 |
| 📦 项目搭建难 | 一个跨端项目涉及 5+ 个模块、多个构建系统、大量模板文件 |
| 🤖 AI 不认识你 | 框架如果没有足够的训练数据，AI 就只能靠猜——猜错了就是编译不过 |
| 👀 没有反馈循环 | AI 写了代码，看不到效果，无法自我验证 |

我们要解决的就是这四个问题。

---

## 三、Kuikly 是什么？

[Kuikly](https://github.com/Tencent-TDS/KuiklyUI) 是腾讯开源的 **Kotlin Multiplatform 跨端框架**，一套代码运行在 Android、iOS、鸿蒙、H5、小程序上。它有两种 DSL：

```kotlin
// Kuikly DSL — 声明式 UI
@Page("Hello")
class HelloPage : BasePager() {
    var greeting by observable("Hello, Kuikly!")

    override fun body(): ViewBuilder {
        val ctx = this
        return {
            View {
                attr {
                    flexDirection(FlexDirection.COLUMN)
                    alignItems(FlexAlign.CENTER)
                    justifyContent(FlexAlign.CENTER)
                    backgroundColor(Color.WHITE)
                }
                Text {
                    attr {
                        fontSize(32f)
                        color(Color.BLACK)
                        text(ctx.greeting)
                    }
                }
            }
        }
    }
}
```

优势明显：**真正的原生渲染 + Kotlin Multiplatform + 动态化能力**。但对 AI Agent 来说，它是一个 "训练数据不足" 的框架——ChatGPT、Claude 都不太可能在预训练时见过大量 Kuikly 代码。

**所以我们决定：不等 AI 来学我们，我们主动给 AI 装上 Kuikly 技能。**

---

## 四、我们造了什么？

### 4.1 create-kuikly-app：一个 AI-First 的 CLI 工具

```bash
npx create-kuikly-app create MyApp --package com.example.myapp
```

一条命令，生成完整的 KMP 跨端项目。但这不是重点——**重点是它为 AI Agent 设计的每一个细节**：

#### ✅ 全命令 JSON 输出

```bash
kuikly --json create MyApp --package com.example.myapp
```

```json
{
  "success": true,
  "command": "create",
  "data": {
    "message": "Project \"MyApp\" created successfully",
    "projectDir": "/path/to/MyApp"
  },
  "nextSteps": ["cd MyApp", "kuikly build android"]
}
```

AI Agent 不需要解析人类可读的终端输出——结构化 JSON，直接 `JSON.parse()`。

#### ✅ 完全非交互

所有参数都通过命令行传入，没有任何 "Press Enter to continue" 式的交互。AI Agent 可以全自动执行，不会卡住。

#### ✅ 结构化编译错误

这是我们最引以为傲的设计。当编译失败时：

```json
{
  "success": false,
  "error": {
    "code": "BUILD_FAILED",
    "diagnostics": [
      {
        "severity": "error",
        "file": "shared/.../TodoList.kt",
        "line": 42,
        "column": 15,
        "message": "Unresolved reference: Textview",
        "category": "kotlin_compilation"
      }
    ],
    "suggestions": [
      "\"Textview\" is unresolved — check spelling, imports, and that the dependency is declared"
    ]
  }
}
```

AI Agent 拿到这个，可以直接：
1. 打开 `TodoList.kt` 第 42 行
2. 看到 `Textview` → 应该是 `Text`
3. 修改代码
4. 重新编译

**自动修复循环，无需人类介入。**

#### ✅ 预览截图

```bash
kuikly --json preview android --page HelloWorld
```

**Build → Install → Launch → Wait → Screenshot → 返回截图路径**

AI Agent 写完代码后，可以截图给用户看效果。用户说"标题再大一点"，Agent 改代码后再截一张——这就是 **AI Agent 的视觉反馈循环**。

### 4.2 十二条命令，覆盖完整开发生命周期

| 命令 | 作用 | AI Agent 场景 |
|------|------|---------------|
| `create` | 创建项目 | "用 Kuikly 创建一个 TodoApp" |
| `create-page` | 添加页面 | "加一个用户设置页面" |
| `create-component` | 添加组件 | "封装一个 ChatBubble 组件" |
| `build` | 编译 | 每次代码修改后自动编译 |
| `run` | 编译并运行 | 在设备/模拟器上运行 |
| `preview` | 编译+截图 | **视觉验证闭环** |
| `screenshot` | 快速截图 | 不重新编译，只截当前屏幕 |
| `doctor` | 环境检查 | 开始前确认工具链就绪 |
| `upgrade` | 升级 SDK | "帮我升级到最新版 Kuikly" |
| `publish` | 发布 Maven | 发布共享模块 |
| `templates` | 查看模板 | 列出可用的项目模板 |

### 4.3 Kuikly Skills：教 AI 写 Kuikly 代码

CLI 解决了 "怎么操作" 的问题，但 AI 还需要知道 "怎么写代码"。我们编写了一套 Cursor Rules（`.mdc` 文件），作为 AI Agent 的 **Kuikly 编程知识库**：

- **38+ 组件速查表**：View、Text、Image、List、Modal... 每个组件的 import 路径
- **常见错误对照表**：`textColor()` → `color()`、`setTimeout` 参数顺序、`observableList` vs `observable`
- **编译错误诊断表**：`Unresolved reference`、`D8 error`、`dependency not found` 等的修复方式
- **版本兼容矩阵**：Kotlin 2.1.21 + AGP 8.2.2 + Gradle 8.5
- **"禁止凭记忆写代码"规则**：强制 AI 先查文档再写，不许用 React/Flutter 经验猜测 Kuikly API

这些规则文件可以直接放到任何 Kuikly 项目的 `.cursor/rules/` 目录中，让 Cursor 中的 AI 自动获得 Kuikly 开发能力。

---

## 五、实战演示：从零到 APK

以下是一个真实的 AI Agent 开发会话（非模拟，实际执行过）：

### Step 1: 检查环境

```bash
$ kuikly --json doctor
{
  "success": true,
  "data": {
    "results": [
      { "name": "Node.js", "status": "ok", "version": "v22.16.0" },
      { "name": "JDK", "status": "ok", "version": "17.0.9" },
      { "name": "Android SDK", "status": "ok", "path": "/Users/.../sdk" },
      { "name": "adb", "status": "ok" }
    ]
  }
}
```

### Step 2: 创建项目

```bash
$ kuikly --json create KuiklyDemo --package com.example.demo --force
```

3 秒内生成完整项目：shared 模块、androidApp、iosApp、ohosApp、buildSrc 版本管理、Gradle Wrapper（内置 jar，无需全局 Gradle）。

### Step 3: 首次编译

```bash
$ kuikly --json build android --dir ./KuiklyDemo
```

首次编译需要下载依赖（~2 分钟），之后 `success: true`，APK 成功生成。

### Step 4: AI 开始写业务代码

Agent 编辑 `shared/src/commonMain/kotlin/com/example/demo/HelloWorldPage.kt`，写了一些代码但引用了错误的 API...

### Step 5: 编译报错 → 自动修复

```bash
$ kuikly --json build android --dir ./KuiklyDemo
```

返回：

```json
{
  "diagnostics": [{
    "file": ".../HelloWorldPage.kt",
    "line": 22,
    "message": "Unresolved reference 'textContent'"
  }],
  "suggestions": ["\"textContent\" is unresolved — check spelling..."]
}
```

Agent 查阅知识库，发现应该用 `text()` 而不是 `textContent()`，自动修改并重新编译——**这次通过了**。

### Step 6: 截图验证

```bash
$ kuikly --json preview android --dir ./KuiklyDemo --page HelloWorld --timeout 8
```

返回截图路径，Agent 将截图展示给用户。用户满意，开发完成。

**整个过程中，用户只说了一句话："帮我用 Kuikly 创建一个 Demo App。"**

---

## 六、关键技术决策

### 为什么选 Node.js CLI？

| 对比项 | Gradle Plugin | IDE Plugin | Node.js CLI |
|--------|--------------|------------|-------------|
| AI Agent 可用 | ❌ 需要 IDE | ❌ 需要 IDE | ✅ 命令行直接用 |
| 零安装使用 | ❌ | ❌ | ✅ `npx` 即用 |
| 跨平台 | ✅ | ⚠️ | ✅ |
| JSON 输出 | 需要定制 | 不支持 | ✅ 原生支持 |
| 适合 CI/CD | ⚠️ | ❌ | ✅ |

**结论：AI Agent 能执行终端命令，但不能操作 IDE GUI。CLI 是唯一选择。**

### 为什么要内置 Gradle Wrapper JAR？

普通的项目模板依赖全局 Gradle 来生成 Wrapper。但 AI Agent 的环境可能没有安装 Gradle。

我们直接把官方 `gradle-wrapper.jar`（43KB）打包进 CLI 模板里。创建项目后，`./gradlew` 可以直接运行——它会自动下载对应版本的 Gradle 发行版到本地缓存。

**效果：AI Agent 创建的项目开箱即编译，不需要任何额外安装。**

### 为什么要做结构化错误解析？

Gradle 的构建输出动辄几百行，混杂着 WARNING、INFO、ERROR、堆栈信息。人类都不一定看得懂，更别说 AI。

我们写了一个 **Build Error Parser**，支持解析：
- Kotlin 编译错误（含 K2 新格式）
- Java 编译错误
- 依赖解析失败
- D8/R8 dexing 错误
- Gradle 配置错误

解析后输出结构化的 `diagnostics` 数组 + `suggestions`，AI Agent 可以直接定位文件和行号去修复。

---

## 七、对接 OpenClaw 生态

我们的目标是把 **Kuikly 开发能力** 打包成一个 Skill，上架到 [ClawHub](https://clawhub.ai/)，让任何支持 MCP/Tool-Use 的 AI Agent 都能使用。

### Skill 包含什么？

```
kuikly-dev-skill/
├── tools/              # MCP Tools 定义
│   ├── create.json     # 创建项目
│   ├── build.json      # 编译
│   ├── preview.json    # 预览截图
│   └── ...
├── knowledge/          # Kuikly 编程知识
│   ├── components.md   # 组件 API 速查
│   ├── common-errors.md # 常见错误修复
│   └── ...
└── manifest.json       # Skill 元数据
```

### 它能做什么？

装上这个 Skill 的 AI Agent，可以：

1. ✅ 理解 "用 Kuikly 创建 App" 这类指令
2. ✅ 正确使用 Kuikly 的 API（不会用 Flutter/React Native 的写法去猜）
3. ✅ 自动处理编译错误
4. ✅ 截图验证 UI 效果
5. ✅ 覆盖从创建到发布的完整开发生命周期

---

## 八、反思：AI Agent 开发框架的设计原则

在这个项目中，我们总结了几个让框架对 AI Agent 友好的设计原则：

### 原则 1：一切皆可 JSON

每个命令、每个错误、每个结果都有结构化的 JSON 表达。AI Agent 不擅长解析人类可读的格式化输出，但非常擅长处理 JSON。

### 原则 2：零交互

`--force`、`--skip-setup`、`--json` 等 flag 确保 AI Agent 永远不会被 "是否继续？[Y/n]" 卡住。

### 原则 3：错误即指导

错误信息不只是说"失败了"，而是告诉 AI "哪个文件第几行什么问题，建议怎么修"。这是 AI Agent 自修复能力的基础。

### 原则 4：视觉可验证

`preview` 命令提供了"眼睛"——AI Agent 可以看到自己写的代码渲染出来是什么样子，形成 **编码 → 编译 → 预览 → 修改** 的完整反馈循环。

### 原则 5：知识即代码

把框架知识写成 `.mdc` Rules 文件，让 AI 在编码时自动获得上下文。不是让 AI 去搜索引擎找答案，而是**把答案塞到 AI 的工作记忆里**。

---

## 九、未来计划

- **🚀 上架 OpenClaw/ClawHub**：打包成标准 Skill，让所有 AI Agent 都能使用
- **📱 iOS 预览支持完善**：目前 Android 预览已经端到端跑通，iOS 路径待完善
- **🎨 AI UI 迭代**：探索让 AI 根据截图自动优化 UI 布局和配色
- **📊 更多模板**：电商、社交、工具类 App 模板，让 AI 有更好的起点
- **🌐 HarmonyOS 构建链**：完善鸿蒙系统的编译和预览链路
- **🔌 MCP Server 模式**：把 CLI 包装成 MCP Server，提供更原生的 AI Agent 集成

---

## 十、开始使用

### 方式 1：直接 npx（推荐）

```bash
npx github:wwwcg/create-kuikly-app create MyApp --package com.example.myapp
```

### 方式 2：全局安装

```bash
npm install -g github:wwwcg/create-kuikly-app
kuikly create MyApp --package com.example.myapp
```

### 方式 3：Cursor AI 集成

将 [Skills 文件](https://github.com/wwwcg/create-kuikly-app) 中的 `.mdc` 规则复制到你的项目 `.cursor/rules/` 目录，Cursor 中的 AI 就能自动获得 Kuikly 开发能力。

### 相关链接

- **CLI 工具**：[github.com/wwwcg/create-kuikly-app](https://github.com/wwwcg/create-kuikly-app)
- **Kuikly 框架**：[github.com/Tencent-TDS/KuiklyUI](https://github.com/Tencent-TDS/KuiklyUI)
- **第三方组件**：[github.com/Tencent-TDS/KuiklyUI-third-party](https://github.com/Tencent-TDS/KuiklyUI-third-party)

---

## 附录：完整 AI Agent 工作流

```
用户: "帮我用 Kuikly 开发一个 TodoApp"
        │
        ▼
┌──────────────────────┐
│   kuikly doctor      │ ← 检查环境
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   kuikly create      │ ← 创建项目
│   TodoApp            │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   kuikly build       │ ← 首次编译
│   android            │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   kuikly create-page │ ← 创建页面
│   TodoList           │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   编辑 Kotlin 代码     │ ← AI 写业务逻辑
│   TodoListPage.kt    │
└──────────┬───────────┘
           ▼
    ┌──────────────┐
    │ kuikly build │──── 失败 ──→ 解析 diagnostics ──→ 自动修复 ──┐
    └──────┬───────┘                                              │
           │ 成功                                                  │
           ▼                                                      │
┌──────────────────────┐                                          │
│   kuikly preview     │ ← 截图验证                                │
│   android --page     │                                          │
│   TodoList           │                                          │
└──────────┬───────────┘                                          │
           ▼                                                      │
    ┌──────────────┐                                              │
    │  展示截图给用户 │                                              │
    └──────┬───────┘                                              │
           │                                                      │
     用户满意？                                                     │
      │      │                                                    │
     Yes     No ─→ 修改代码 ─────────────────────────────────────┘
      │
      ▼
┌──────────────────────┐
│   kuikly publish     │ ← 发布
└──────────────────────┘
```

---

*作者：Kuikly Team | 2026 年 3 月*  
*"让每个 AI Agent 都能开发跨端 App。"*
