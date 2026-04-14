# markdocx

[English](README.md) | 简体中文

markdocx 可以将 Markdown 转换为 Word（`.docx`）文档，同时尽可能保留标题、段落、列表、表格、代码块、引用块、本地图片和 Mermaid 图表。所有支持的宿主都共享同一套转换规则，因此修复一次即可在所有入口生效，而不需要在不同工具之间重复实现。

## 宿主状态

| 宿主 | 状态 | 入口 |
| --- | --- | --- |
| Chrome 扩展 | 已实现 | `apps/chrome-extension/` |
| CLI | 已实现 | `md-to-docx.mjs` |
| VS Code 扩展 | 已实现 | `apps/vscode-extension/` |
| Agent Skill | 已实现 | `apps/agent-skill/` |

## 架构

仓库采用 **Shared Core + Two Runtime Families** 布局：

- 一个共享转换核心负责规范的 Markdown → HTML → DOCX 规则、样式与布局 schema、DOCX 归一化逻辑以及 parity 测试夹具。
- 一个 **浏览器运行时家族**（`@markdocx/runtime-browser`）承载 Chrome 扩展与 VS Code 扩展，基于原生 `DOMParser` 和页面内 Mermaid 渲染。
- 一个 **Node 运行时家族**（`@markdocx/runtime-node`，以及可选的 `@markdocx/runtime-node-mermaid`）承载 CLI 和 agent skill，基于 jsdom DOM 适配器与可选的 Puppeteer Mermaid 渲染器。

跨宿主输出一致性通过以下基于夹具的 parity 检查强制保证：`scripts/run-fixture-parity.mjs`、`scripts/run-cli-parity.mjs`、`scripts/run-vscode-parity.mjs` 和 `scripts/run-agent-skill-parity.mjs`。完整设计、契约与背景说明见 `docs/design-core-refactor.md`。

当前仓库仍保留一处渐进式清理：`md-to-docx.mjs` 仍然作为公开 CLI 入口保留，后续如有进一步清理，重点会是文件位置整理，而不是重写转换逻辑。

## 包布局

```text
markdocx/
├── md-to-docx.mjs                  # 轻量 CLI 包装层（参数解析 + 样式解析）
├── packages/
│   ├── core/                       # @markdocx/core — 规范规则、schema、夹具
│   ├── runtime-browser/            # @markdocx/runtime-browser — 原生 DOMParser + 页面内 Mermaid
│   ├── runtime-node/               # @markdocx/runtime-node — jsdom 适配器 + 文件系统图片映射
│   └── runtime-node-mermaid/       # @markdocx/runtime-node-mermaid — 可选 Puppeteer Mermaid 渲染器
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

- Node.js 22+
- npm（启用 workspaces）
- 一个 Puppeteer 可访问的 Chrome 二进制文件（仅当你需要通过 CLI 渲染 Mermaid 时才需要）

## 安装

在仓库根目录执行：

```bash
npm install
```

这会安装所有 workspace 包，包括 `@markdocx/core`、`@markdocx/runtime-browser`、`@markdocx/runtime-node` 和 `@markdocx/runtime-node-mermaid`。

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

CLI 通过 `@markdocx/runtime-node` 解析共享 `styleOptions`。所有配置都会经过和其他宿主相同的 schema，因此 CLI 上设置的样式预设，与扩展中设置相同预设时会得到一致输出。

| CLI 参数 | 环境变量 | 作用 |
| --- | --- | --- |
| `--style-preset <name>` | `MARKDOCX_STYLE_PRESET` | 基础样式预设（`default`、`minimal`、`report`） |
| `--margin-preset <name>` | `MARKDOCX_MARGIN_PRESET` | 页面边距预设（`default`、`compact`、`wide`） |
| `--style-json <json\|path>` | `MARKDOCX_STYLE_JSON` | 内联 JSON 字符串或 JSON 文件路径 |
| `--set key=value` | `MARKDOCX_STYLE_SET` | 精准 dotted-path 覆盖项（可重复） |

解析优先级如下（后者覆盖前者）：环境变量 preset → 环境变量 JSON → 环境变量 margin → 环境变量赋值 → CLI preset → CLI JSON → CLI margin → CLI 赋值。最终对象会交给 core 的 `normalizeStyleOptions` 做校验。

`--set` 与 `MARKDOCX_STYLE_SET` 使用相同的 dotted-path 分号分隔语法：

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

组合使用示例：

```bash
node md-to-docx.mjs report.md dist/report.docx \
  --style-preset minimal \
  --margin-preset wide \
  --style-json ./style-options.json \
  --set body.fontSizePt=12 \
  --set blockquote.italic=false
```

## Chrome 扩展

Chrome 扩展位于 `apps/chrome-extension/`，并通过 `@markdocx/core` + `@markdocx/runtime-browser` 与 CLI 共享转换逻辑。构建后可执行 `npm run build:chrome-extension`，然后把生成的 `apps/chrome-extension/dist/` 目录作为未打包扩展加载到 Chrome。该扩展要求用户选择目录而不是单个文件，这样才能正确解析相对本地图片路径。

## VS Code 扩展

VS Code 扩展位于 `apps/vscode-extension/`。它注册 `markdocx.convertToDocx` 命令，可从资源管理器、编辑器右键菜单和编辑器标题栏触发，并通过一个隐藏 webview 加载 `@markdocx/runtime-browser` 来完成转换。构建命令：

```bash
npm run build:vscode-extension
```

然后让 VS Code 指向 `apps/vscode-extension/`（例如通过 Run Extension 启动配置）即可加载开发版本。扩展配置位于 `markdocx` 命名空间下，并直接映射到共享的 `styleOptions` schema：

| 配置项 | 作用 |
| --- | --- |
| `markdocx.stylePreset` | 基础样式预设（`default`、`minimal`、`report`） |
| `markdocx.marginPreset` | 可选页面边距预设覆盖（`default`、`compact`、`wide`） |
| `markdocx.styleJson` | 内联样式 JSON 字符串，或工作区相对路径的样式 JSON 文件 |
| `markdocx.styleSet` | 精准 dotted-path 覆盖，例如 `body.fontSizePt=12`（字符串数组） |

本地图片相对于当前被转换 Markdown 文件所属工作区目录解析，这与 Chrome 扩展的目录选择约束保持一致。

### 打包 VS Code 扩展

扩展通过 [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) 打包。`package` 脚本会构建 bundle、运行 bundle smoke 检查，并把独立 `.vsix` 写到 `apps/vscode-extension/dist/markdocx-vscode-extension.vsix`。

在仓库根目录可执行：

```bash
npm run package:vscode-extension
# 或
npm run package -w markdocx-vscode-extension
```

或者在扩展目录中执行：

```bash
cd apps/vscode-extension
npm run package
```

将生成的 `.vsix` 安装到本地 VS Code：

```bash
npm run install:vsix -w markdocx-vscode-extension
# 或
code --install-extension apps/vscode-extension/dist/markdocx-vscode-extension.vsix --force
```

打包后的 `.vsix` 包含 `dist/extension.cjs`、webview 资源 bundle 和 manifest。workspace 内的 `@markdocx/*` 包会在构建时内联，因此安装扩展时不需要 `node_modules`，而且 `vsce package` 使用了 `--no-dependencies`。

## Agent Skill

agent skill 源码位于 `apps/agent-skill/`，并从 `apps/agent-skill/skill.mjs` 导出 `convertWithAgentSkill()`。它被刻意保持得很薄：负责解析文件或内联 Markdown 输入，把 skill 参数与环境默认值映射到共享 `styleOptions` schema，然后在有输出路径时写出 DOCX。

命名规则：

- 内部源码目录：`apps/agent-skill/`
- 内部 workspace 包名：`markdocx-agent-skill`
- 对外 Claude skill 名称：`markdocx-skill`

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

skill 与 CLI 使用同一组环境变量默认值：`MARKDOCX_STYLE_PRESET`、`MARKDOCX_MARGIN_PRESET`、`MARKDOCX_STYLE_JSON` 和 `MARKDOCX_STYLE_SET`。Mermaid 行为也一致：当文档包含 Mermaid fence 时，需要安装 `@markdocx/runtime-node-mermaid`。

要生成一个不依赖当前仓库 checkout 的独立可部署 skill 目录，请执行：

```bash
npm run export:agent-skill
```

这会生成 `apps/agent-skill/dist/markdocx-skill/` 以及 `apps/agent-skill/dist/markdocx-skill.zip`，可直接复制或软链接到其他 agent 运行时的 skills 目录中。

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
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid
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

在容器环境中，你可能还需要设置 `MARKDOCX_PUPPETEER_NO_SANDBOX=1`。

如果 Chromium 报错 `No usable sandbox!`，请使用以下方式重新运行 Mermaid 导出 gate：

```bash
MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

在精简版 Ubuntu VPS 上，你可能需要同时设置两个环境变量：

```bash
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

### CLI 报错：请安装 `@markdocx/runtime-node-mermaid`

如果 CLI 提示需要安装 `@markdocx/runtime-node-mermaid`，说明你的 Markdown 中包含 Mermaid fence，但可选的 Puppeteer helper 包尚未安装。安装 workspace 依赖后重新执行：

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
