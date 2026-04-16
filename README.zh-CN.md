# marktodocx

<!-- markdownlint-disable-next-line MD033 -->
<div align="center">
<img src="assets/icon.svg" alt="marktodocx 图标" width="220" />
</div>

<!-- markdownlint-disable MD033 -->
<div align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f172a" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/parity-fixture--gated-2563eb" alt="Fixture-gated parity" />
  <img src="https://img.shields.io/badge/hosts-CLI%20%7C%20Chrome%20%7C%20VS%20Code%20%7C%20Skill-111827" alt="Supported hosts" />
</div>
<!-- markdownlint-enable MD033 -->

[English](README.md) | 简体中文

marktodocx 可以将 Markdown 转换为 Word（`.docx`）文档，同时尽可能保留标题、段落、列表、表格、代码块、引用块、本地图片和 Mermaid 图表。所有支持的宿主都共享同一套转换规则，因此修复一次即可在所有入口生效，而不需要在不同工具之间重复实现。

marktodocx **的发布目标**是三个公开仓库：VS Code Marketplace、Chrome Web Store 以及 ClawHub（OpenClaw 的 skill registry），并把 skill 的 zip 制品同步到 GitHub Releases。完整发布流程已经在 [`docs/publishing.md`](docs/publishing.md) 中描述，但目前还没有任何宿主真正发布到对应的 registry，因此现在所有宿主都需要从本仓库本地构建。CLI 故意保持源码安装，不发布到任何 registry。

不同宿主的 Mermaid 支持方式不同：

- Chrome 扩展和 VS Code 扩展在构建完成后，都会通过浏览器运行时内置 Mermaid 支持。
- CLI 和 agent skill 默认运行在 Node 运行时上，因此当文档包含 Mermaid fence 时，需要 `@marktodocx/runtime-node-mermaid` 或使用 Mermaid 增强导出包。

## 目录

- [快速开始](#快速开始)
- [宿主状态](#宿主状态)
- [架构](#架构)
- [包布局](#包布局)
- [支持特性](#支持特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [CLI 用法](#cli-用法)
- [CLI 样式选项](#cli-样式选项)
- [Chrome 扩展](#chrome-扩展)
- [VS Code 扩展](#vs-code-扩展)
- [Agent Skill](#agent-skill)
- [开发](#开发)
- [限制](#限制)
- [故障排查](#故障排查)
- [帮助](#帮助)

## 快速开始

### CLI 快速开始

1. `npm install`
2. 如果 Markdown 包含 Mermaid，执行 `npx puppeteer browsers install chrome`
3. 使用 `node md-to-docx.mjs report.md` 转换文件
4. 如果不传显式输出路径，结果会写到 `report.md` 同目录

### Chrome 扩展快速开始

1. `npm install && npm run build:chrome-extension`
2. 打开 `chrome://extensions/`，启用 **开发者模式**，点击 **加载已解压的扩展程序**
3. 选择 `apps/chrome-extension/dist/`
4. 固定 marktodocx 图标，打开扩展页面，选择包含 Markdown 和本地图片的目录，选择 `.md` 文件后点击 **Convert**
5. 生成的 `.docx` 会走 Chrome 的正常下载流程：如果启用了 **下载前询问每个文件的保存位置**，Chrome 会弹出保存对话框；否则会写入默认下载目录

### VS Code 扩展快速开始

1. `npm install && npm run package:vscode-extension`
2. 安装 `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix`（例如：`code --install-extension apps/vscode-extension/dist/marktodocx-vscode-extension.vsix --force`）
3. 打开包含 Markdown 文件和本地图片的工作区
4. 在资源管理器中右键 `.md` 文件并选择 **marktodocx: Convert to DOCX**，或从命令面板运行 `marktodocx.convertToDocx`
5. 在保存对话框中选择输出路径

### Agent Skill 快速开始

1. `npm install && npm run export:agent-skill`
2. 将 `apps/agent-skill/dist/marktodocx-skill/` 复制到技能宿主目录，例如 Claude Code 的 `~/.claude/skills/marktodocx-skill` 或 OpenClaw 的 skills 目录
3. 启动新的 agent 会话并显式发起转换请求，例如：`Convert docs/report.md to DOCX with stylePreset=minimal.`
4. 如果文档包含 Mermaid，请改用 `npm run export:agent-skill:mermaid`（该导出具备平台相关性；请在与你部署目标相同的操作系统和架构上导出）

## 宿主状态

| 宿主 | 状态 | 入口 | 发布目标 |
| --- | --- | --- | --- |
| Chrome 扩展 | 已实现 | `apps/chrome-extension/` | Chrome Web Store |
| VS Code 扩展 | 已实现 | `apps/vscode-extension/` | VS Code Marketplace |
| Agent Skill | 已实现 | `apps/agent-skill/` | ClawHub + GitHub Releases |
| CLI | 已实现 | `md-to-docx.mjs` | 仅源码（不发布到 registry） |

每个宿主的发布流程见 [`docs/publishing.md`](docs/publishing.md)。

## 架构

仓库采用 **Shared Core + Two Runtime Families** 布局：

- 一个共享转换核心负责规范的 Markdown → HTML → DOCX 规则、样式与布局 schema、DOCX 归一化逻辑以及 parity 测试夹具。
- 一个 **浏览器运行时家族**（`@marktodocx/runtime-browser`）承载 Chrome 扩展与 VS Code 扩展，基于原生 `DOMParser` 和页面内 Mermaid 渲染。
- 一个 **Node 运行时家族**（`@marktodocx/runtime-node`，以及可选的 `@marktodocx/runtime-node-mermaid`）承载 CLI 和 agent skill，基于 jsdom DOM 适配器与可选的 Puppeteer Mermaid 渲染器。

跨宿主输出一致性通过以下基于夹具的 parity 检查强制保证：`scripts/run-fixture-parity.mjs`、`scripts/run-cli-parity.mjs`、`scripts/run-vscode-parity.mjs` 和 `scripts/run-agent-skill-parity.mjs`。完整设计、契约与背景说明见 `docs/design-core-refactor.md`。

当前仓库仍保留一处渐进式清理：`md-to-docx.mjs` 仍然作为公开 CLI 入口保留，后续如有进一步清理，重点会是文件位置整理，而不是重写转换逻辑。

## 包布局

```text
marktodocx/
├── md-to-docx.mjs                  # 轻量 CLI 包装层（参数解析 + 样式解析）
├── packages/
│   ├── core/                       # @marktodocx/core — 规范规则、schema、夹具
│   ├── runtime-browser/            # @marktodocx/runtime-browser — 原生 DOMParser + 页面内 Mermaid
│   ├── runtime-node/               # @marktodocx/runtime-node — jsdom 适配器 + 文件系统图片映射
│   └── runtime-node-mermaid/       # @marktodocx/runtime-node-mermaid — 可选 Puppeteer Mermaid 渲染器
├── apps/
│   ├── agent-skill/                # Agent skill 宿主（Node 运行时家族）
│   ├── chrome-extension/           # Chrome 扩展宿主
│   └── vscode-extension/           # VS Code 扩展宿主（隐藏 webview + 浏览器运行时）
├── test-markdown/__golden__/       # Parity 夹具与 golden DOCX 产物
└── docs/design-core-refactor.md    # 权威设计文档
```

## 支持特性

- 标题、段落、加粗、斜体、引用块
- 有序与无序列表
- 代码块（含语法高亮）与行内代码
- Markdown 表格
- 本地图片（`.png`、`.jpg`、`.jpeg`、`.gif`、`.webp`、`.svg`）
- Mermaid 图表（渲染为 PNG 后嵌入 DOCX）

## 环境要求

### 构建要求

- Node.js 22+
- npm（启用 workspaces）

### 运行时要求

- Chrome 扩展：Chrome 或 Chromium 116+，并支持加载未打包的 MV3 扩展
- VS Code 扩展：VS Code 1.97+
- CLI：Node.js 22+
- Agent Skill：Node.js 22+，以及兼容的技能宿主，例如 Claude Code 或 OpenClaw
- Node 宿主上的 Mermaid：Puppeteer 管理的 Chrome/Chromium，以及在 Linux 上所需的共享库

## 安装

最终用户可以在对应宿主发布到 registry 之后，直接从公开仓库安装：VS Code 扩展走 VS Code Marketplace，Chrome 扩展走 Chrome Web Store，Agent Skill 通过 `clawhub install marktodocx-skill` 走 ClawHub。CLI 故意保持源码安装。

下面的步骤介绍源码构建流程，对所有宿主都有效，并且是 CLI 唯一的安装方式。在仓库根目录执行：

```bash
npm install
```

这会安装所有 workspace 包，包括 `@marktodocx/core`、`@marktodocx/runtime-browser`、`@marktodocx/runtime-node` 和 `@marktodocx/runtime-node-mermaid`。

如果你的 Markdown 包含 Mermaid，并且计划通过 CLI 转换，请先安装一次由 Puppeteer 管理的 Chrome：

```bash
npx puppeteer browsers install chrome
```

## CLI 用法

基础调用方式：

```bash
node md-to-docx.mjs <input.md> [output.docx] [options]
```

如果省略输出路径，CLI 会在输入 Markdown 同目录下写出 `.docx`：

```bash
node md-to-docx.mjs report.md
# -> report.docx
```

显式指定输出路径：

```bash
node md-to-docx.mjs report.md dist/report.docx
```

也可以使用 npm script 快捷方式：

```bash
npm run convert -- report.md dist/report.docx
```

## CLI 样式选项

CLI 通过 `@marktodocx/runtime-node` 解析共享 `styleOptions`。所有配置都会经过和其他宿主相同的 schema，因此 CLI 上设置的样式预设，与扩展中设置相同预设时会得到一致输出。

| CLI 参数 | 环境变量 | 作用 |
| --- | --- | --- |
| `--style-preset <name>` | `MARKTODOCX_STYLE_PRESET` | 基础样式预设（`default`、`minimal`、`report`） |
| `--margin-preset <name>` | `MARKTODOCX_MARGIN_PRESET` | 页面边距预设（`default`、`compact`、`wide`） |
| `--style-json <json\|path>` | `MARKTODOCX_STYLE_JSON` | 内联 JSON 字符串或 JSON 文件路径 |
| `--set key=value` | `MARKTODOCX_STYLE_SET` | 精准 dotted-path 覆盖项（可重复） |

解析优先级如下（后者覆盖前者）：环境变量 preset → 环境变量 JSON → 环境变量 margin → 环境变量赋值 → CLI preset → CLI JSON → CLI margin → CLI 赋值。最终对象会交给 core 的 `normalizeStyleOptions` 做校验。

`--set` 与 `MARKTODOCX_STYLE_SET` 使用相同的 dotted-path 分号分隔语法：

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

### 支持的 `styleSet` 路径

每个 `--set` 赋值最终都会写入 `overrides.<path>`。当前支持的 dotted-path 如下：

- `body.fontFamily`
- `body.fontSizePt`
- `body.lineHeight`
- `body.color`
- `headings.fontFamily`
- `headings.color`
- `tables.borderColor`
- `tables.headerBackgroundColor`
- `tables.headerTextColor`
- `code.fontFamily`
- `code.fontSizePt`
- `code.syntaxTheme`
- `code.inlineBackgroundColor`
- `code.inlineItalic`
- `code.blockBackgroundColor`
- `code.blockBorderColor`
- `code.languageBadgeColor`
- `blockquote.backgroundColor`
- `blockquote.textColor`
- `blockquote.borderColor`
- `blockquote.italic`
- `page.marginPreset`

值的解析规则：

- `true` 和 `false` 会被解析为布尔值
- 诸如 `11`、`1.55` 的数值会被解析为数字
- 其他值会被当作去掉首尾空白后的字符串

示例：

```bash
node md-to-docx.mjs report.md \
  --set body.fontSizePt=12 \
  --set body.lineHeight=1.6 \
  --set code.syntaxTheme=dark \
  --set blockquote.italic=false
```

### `styleJson` 详细说明

`--style-json` 和 `MARKTODOCX_STYLE_JSON` 支持两种输入形式：

- 内联 JSON 对象字符串
- JSON 文件路径

JSON 可以使用完整 `styleOptions` 结构：

```json
{
  "preset": "minimal",
  "overrides": {
    "body": {
      "fontSizePt": 12
    }
  }
}
```

也可以使用只包含覆盖项的简写对象形式：

```json
{
  "body": {
    "fontSizePt": 12
  },
  "page": {
    "marginPreset": "wide"
  }
}
```

完整示例文件见 `docs/style-options.example.json`。

组合使用示例：

```bash
node md-to-docx.mjs report.md dist/report.docx \
  --style-preset minimal \
  --margin-preset wide \
  --style-json ./docs/style-options.example.json \
  --set body.fontSizePt=12 \
  --set blockquote.italic=false
```

## Chrome 扩展

Chrome 扩展位于 `apps/chrome-extension/`，并通过 `@marktodocx/core` + `@marktodocx/runtime-browser` 与 CLI 共享转换逻辑。

从源码构建：

```bash
npm install
npm run build:chrome-extension
```

### 加载到 Chrome

1. 打开 `chrome://extensions/`。
2. 启用 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择 `apps/chrome-extension/dist/`。

### 首次转换流程

1. 如有需要，先将 marktodocx 图标固定到工具栏。
2. 点击扩展图标打开转换页面。
3. 选择包含 Markdown 文件及其本地图片的目录。
4. 在文件选择器中选择要转换的 Markdown 文件。
5. 如有需要调整样式选项，然后点击 **Convert**。
6. Chrome 会按浏览器的正常下载流程处理生成的 `.docx`。如果启用了下载前询问保存位置，就会弹出保存对话框；否则会写入默认下载目录。

### 为什么必须选择目录

扩展需要按照 Markdown 文件所在位置解析本地图片的相对路径。单文件选择器无法访问 Markdown 所引用的同级目录或父级目录资源，因此这里必须选择包含该文件的目录。

## VS Code 扩展

VS Code 扩展位于 `apps/vscode-extension/`。它注册 `marktodocx.convertToDocx` 命令，可从资源管理器、编辑器右键菜单和编辑器标题栏触发，并通过一个隐藏 webview 加载 `@marktodocx/runtime-browser` 来完成转换。

构建命令：

```bash
npm run build:vscode-extension
```

如果你需要可安装制品，请把它打包为 `.vsix`：

```bash
npm run package:vscode-extension
```

然后安装 `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix`。如果你是在开发扩展，也可以通过 Run Extension 启动配置直接让 VS Code 指向 `apps/vscode-extension/`。

### 触发转换

- 在资源管理器中右键 `.md` 文件并选择 **marktodocx: Convert to DOCX**。
- 或打开命令面板并运行 `marktodocx.convertToDocx`。
- 或在打开 Markdown 文件时使用编辑器右键菜单或编辑器标题按钮。

VS Code 会通过保存对话框询问输出路径。`.docx` 会写到你选择的位置，而本地图片则相对于包含该 Markdown 文件的工作区目录解析。

扩展配置位于 `marktodocx` 命名空间下，并直接映射到共享的 `styleOptions` schema：

| 配置项 | 作用 |
| --- | --- |
| `marktodocx.stylePreset` | 基础样式预设（`default`、`minimal`、`report`） |
| `marktodocx.marginPreset` | 可选页面边距预设覆盖（`default`、`compact`、`wide`） |
| `marktodocx.styleJson` | 内联样式 JSON 字符串，或工作区相对路径的样式 JSON 文件 |
| `marktodocx.styleSet` | 精准 dotted-path 覆盖，例如 `body.fontSizePt=12`（字符串数组） |

本地图片相对于当前被转换 Markdown 文件所属工作区目录解析，这与 Chrome 扩展的目录选择约束保持一致。

### 打包 VS Code 扩展

扩展通过 [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) 打包。`package` 脚本会构建 bundle、运行 bundle smoke 检查，并把独立 `.vsix` 写到 `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix`。

在仓库根目录可执行：

```bash
npm run package:vscode-extension
# 或
npm run package -w marktodocx-vscode-extension
```

或者在扩展目录中执行：

```bash
cd apps/vscode-extension
npm run package
```

将生成的 `.vsix` 安装到本地 VS Code：

```bash
npm run install:vsix -w marktodocx-vscode-extension
# 或
code --install-extension apps/vscode-extension/dist/marktodocx-vscode-extension.vsix --force
```

打包后的 `.vsix` 包含 `dist/extension.cjs`、webview 资源 bundle 和 manifest。workspace 内的 `@marktodocx/*` 包会在构建时内联，因此安装扩展时不需要 `node_modules`，而且 `vsce package` 使用了 `--no-dependencies`。

## Agent Skill

agent skill 源码位于 `apps/agent-skill/`，并从 `apps/agent-skill/skill.mjs` 导出 `convertWithAgentSkill()`。它被刻意保持得很薄：负责解析文件或内联 Markdown 输入，把 skill 参数与环境默认值映射到共享 `styleOptions` schema，然后在有输出路径时写出 DOCX。

如果你需要按宿主区分的部署说明，请阅读 `apps/agent-skill/README.md`，其中包含 Claude Code 与 OpenClaw 的部署流程。

命名规则：

- 内部源码目录：`apps/agent-skill/`
- 内部 workspace 包名：`marktodocx-agent-skill`
- 对外 Claude skill 名称：`marktodocx-skill`

源码目录名不要求与对外 Claude skill 名称一致。公开 skill 身份由 `apps/agent-skill/SKILL.md` 中的 `name` 字段定义。

skill 参数与设计契约保持一致：

| 参数 | 作用 |
| --- | --- |
| `inputPath` | 本地 Markdown 文件路径 |
| `markdown` | 内联 Markdown 字符串 |
| `baseDir` | 使用内联 Markdown 时，本地图片的解析基准目录 |
| `outputPath` | 可选 DOCX 输出路径；若使用文件输入，默认写在 `inputPath` 同目录 |
| `stylePreset` | 基础共享样式预设 |
| `marginPreset` | 可选共享边距预设覆盖 |
| `styleJson` | 共享样式 JSON 字符串、普通对象或 JSON 文件路径 |
| `styleSet` | 共享 dotted-path 覆盖，例如 `body.fontSizePt=12` |

skill 与 CLI 使用同一组环境变量默认值：`MARKTODOCX_STYLE_PRESET`、`MARKTODOCX_MARGIN_PRESET`、`MARKTODOCX_STYLE_JSON` 和 `MARKTODOCX_STYLE_SET`。Mermaid 行为也一致：当文档包含 Mermaid fence 时，需要安装 `@marktodocx/runtime-node-mermaid`。

要生成一个不依赖当前仓库 checkout 的独立可部署 skill 目录，请执行：

```bash
npm run export:agent-skill
```

这会生成 `apps/agent-skill/dist/marktodocx-skill/` 以及 `apps/agent-skill/dist/marktodocx-skill.zip`，可直接复制或软链接到其他 agent 运行时的 skills 目录中。

要生成带有内置 Chromium 的 Mermaid 增强导出包，请执行：

```bash
npm run export:agent-skill:mermaid
```

该配置与平台相关，设计目标是在与构建导出包相同的操作系统和 CPU 架构上部署使用。它还会把可用的 Chromium 启动参数记录到导出 manifest 中，因此在同一台受 sandbox 限制的宿主上运行时，通常不需要再手动设置环境变量。

要运行面向 CI 的导出校验：

```bash
npm run test:export:agent-skill
```

该命令会重新构建导出产物，并校验最终目录布局。

若要校验 Mermaid 增强导出：

```bash
npm run test:export:agent-skill:mermaid
```

## 开发

按包划分的构建脚本：

```bash
npm run build:core
npm run build:runtime-browser
npm run build:runtime-node
npm run build:runtime-node-mermaid
npm run build:packages
npm run build:agent-skill
npm run export:agent-skill
npm run export:agent-skill:mermaid
npm run test:export:agent-skill
npm run test:export:agent-skill:mermaid
npm run build:chrome-extension
npm run build:vscode-extension
npm run build:cli
npm run smoke:all
```

单元测试与 parity 校验：

```bash
npm run test:unit           # 各包单元测试
npm run test:parity         # 扩展路径 parity 校验
npm run test:parity:cli     # CLI 路径 parity 校验
npm run test:parity:skill   # Agent skill 路径 parity 校验
npm run test:parity:vscode  # VS Code 路径 parity 校验
npm run test:parity:all     # 发布前完整 parity 校验（扩展 + CLI + VS Code + agent skill）
```

完整 parity gate 为 `npm run test:parity:all`。任何改动共享转换核心或任一运行时家族之前，都应在发布前执行它。

GitHub Actions 与本地流程保持一致：第一个 job 安装依赖并执行 `npm run smoke:all`（其中包含共享包构建、所有宿主 smoke 测试以及独立 agent-skill 导出校验）；第二个 job 安装 Puppeteer 管理的 Chrome，并在每个 pull request 上运行 `npm run test:parity:all`。

如果规范输出有意发生变化，需要刷新夹具时，请执行：

```bash
npm run generate:goldens
```

## 限制

- Mermaid 图表会以 PNG 图片形式嵌入 Word，而不是保留为可编辑 Mermaid 源。
- 超大的 Mermaid 图表仍可能被 Word 按页宽缩放。
- Markdown → DOCX 的保真度是尽力而为，因为 HTML/CSS 与 Word 的渲染模型并不完全一致。
- 不会下载远程图片。为了稳定嵌入，请使用本地图片文件。
- Chrome 扩展必须选择目录而不是单个文件，这样才能解析相对图片路径。

## 故障排查

### 找不到 Chrome

如果 CLI 在渲染 Mermaid 时提示 `Could not find Chrome`：

```bash
npx puppeteer browsers install chrome
```

### Linux 上 Chromium 缺少共享库

如果 Mermaid 渲染失败，并出现类似 `error while loading shared libraries: libatk-1.0.so.0` 的错误，说明 Chromium 已成功下载，但宿主操作系统缺少 Puppeteer 所需的 Linux 运行库。

在 Debian 或 Ubuntu 上，如果你有 root 权限，可以让 Puppeteer 尝试自动安装：

```bash
sudo MARKTODOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid
```

如果你更希望手动安装 Debian / Ubuntu 依赖，可以先执行：

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2t64 || sudo apt-get install -y libasound2

sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils
```

在部分 Ubuntu 版本中，音频包名称是 `libasound2t64`；在较老版本中则仍是 `libasound2`。

在容器环境中，你可能还需要设置 `MARKTODOCX_PUPPETEER_NO_SANDBOX=1`。

如果 Chromium 报错 `No usable sandbox!`，请使用以下方式重新运行 Mermaid 导出 gate：

```bash
MARKTODOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

在精简版 Ubuntu VPS 上，你可能需要同时设置两个环境变量：

```bash
sudo MARKTODOCX_PUPPETEER_INSTALL_DEPS=1 MARKTODOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

### CLI 报错：请安装 `@marktodocx/runtime-node-mermaid`

如果 CLI 提示需要安装 `@marktodocx/runtime-node-mermaid`，说明你的 Markdown 中包含 Mermaid fence，但可选的 Puppeteer helper 包尚未安装。安装 workspace 依赖后重新执行：

```bash
npm install
```

### 不支持的本地图片格式

共享转换管线只接受以下扩展名：

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.svg`

在运行 CLI 之前，请先将其他格式转换为上述格式之一。

### Mermaid 文本换行过早

Mermaid 布局参数现在由共享运行时配置统一管理，而不是由 CLI 包装层单独维护。调整时请修改共享 Mermaid 配置，不要重新引入 CLI 局部漂移。

## 帮助

打印 CLI 用法说明：

```bash
node md-to-docx.mjs --help
```
