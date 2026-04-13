# sanxi/issues

这个仓库主要用于存放 ZooKeeper 事故分析材料，以及一个将 Markdown 转换为 Word (`.docx`) 的工具。

当前仓库里既有事故原始资料，也有已经翻译好的中文报告和转换脚本，适合继续维护 Markdown 报告并导出正式的 Word 文档。

## Repository Contents

主要文件如下：

- `zookeeper-accident-analysis-report.md`: 英文版 ZooKeeper 事故分析报告
- `zookeeper-accident-analysis-report-zh.md`: 中文版 ZooKeeper 事故分析报告
- `zookeeper-accident-analysis-report-zh.docx`: 由转换工具生成的 Word 文件
- `zookeeper issue.md`: 相关问题说明文档
- `myid6.log`: 事故分析使用的原始日志
- `md-to-docx.mjs`: Markdown 转 Word 的 CLI 工具
- `package.json`: Node.js 依赖与脚本入口

## What The Converter Supports

`md-to-docx.mjs` 的目标是尽可能保留原始 Markdown 的结构和表现形式，当前支持：

- 标题、段落、粗体、斜体、引用块
- 有序列表、无序列表
- 代码块、行内代码
- Markdown 表格
- 本地图片
- Mermaid 图表

Mermaid 图不会直接以源码进入 Word，而是先渲染成图片，再嵌入到 DOCX 中。这样可以避免 Word 本身不支持 Mermaid 的问题，同时尽量保留布局效果。

## How It Works

当前 CLI 已经切到 Epic 4 的 Node runtime family：

1. `md-to-docx.mjs` 只负责参数解析、样式配置和错误出口
2. `@markdocx/runtime-node` 负责 Markdown -> HTML -> DOCX 的 Node 侧组合
3. `@markdocx/runtime-node-mermaid` 在检测到 Mermaid 代码块时，用 Puppeteer 渲染 PNG 并回填到共享渲染链路

这样 CLI 不再维护一套独立的转换单体逻辑，后续修复会直接落在共享 core 和 runtime 包上。

## Prerequisites

运行环境要求：

- Node.js 22+
- npm
- 可供 Puppeteer 调用的 Chrome 浏览器二进制

首次使用时，建议按下面顺序准备环境。

## Install Dependencies

在仓库根目录执行：

```bash
npm install
```

这会安装转换脚本所需依赖，包括：

- `html-to-docx`
- `@markdocx/runtime-node`
- `@markdocx/runtime-node-mermaid`
- `puppeteer`

## Install Chrome For Mermaid Rendering

Mermaid 渲染依赖 Puppeteer 启动 Chrome。第一次使用前，需要执行：

```bash
npx puppeteer browsers install chrome
```

成功后，Chrome 会被下载到 Puppeteer 的本地缓存目录，通常类似：

```text
~/.cache/puppeteer/
```

如果这一步没有完成，Mermaid 图无法渲染，DOCX 转换会失败。

## Convert Markdown To DOCX

最直接的使用方式：

```bash
node md-to-docx.mjs <input.md> [output.docx] [options]
```

示例：

```bash
node md-to-docx.mjs zookeeper-accident-analysis-report-zh.md
```

如果不传第二个参数，工具会默认在同目录下生成一个同名 `.docx` 文件。

例如上面的命令会生成：

```text
zookeeper-accident-analysis-report-zh.docx
```

也可以显式指定输出路径：

```bash
node md-to-docx.mjs zookeeper-accident-analysis-report-zh.md output.docx
```

## CLI Style Options

CLI 现在支持通过参数和环境变量配置共享 `styleOptions`：

```bash
node md-to-docx.mjs report.md output.docx \
  --style-preset minimal \
  --margin-preset wide \
  --style-json ./style-options.json \
  --set body.fontSizePt=12 \
  --set blockquote.italic=false
```

支持的参数：

- `--style-preset <name>`
- `--margin-preset <name>`
- `--style-json <json-or-path>`
- `--set key=value`

对应环境变量：

- `MARKDOCX_STYLE_PRESET`
- `MARKDOCX_MARGIN_PRESET`
- `MARKDOCX_STYLE_JSON`
- `MARKDOCX_STYLE_SET`

`MARKDOCX_STYLE_SET` 和 `--set` 都使用分号分隔的 dotted-path 赋值语法，例如：

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

## Use The npm Script

仓库里也提供了 npm 脚本入口：

```bash
npm run convert -- zookeeper-accident-analysis-report-zh.md
```

带输出路径的写法：

```bash
npm run convert -- zookeeper-accident-analysis-report-zh.md custom-output.docx
```

## Example Workflow

一个完整的常用流程如下：

```bash
npm install
npx puppeteer browsers install chrome
node md-to-docx.mjs zookeeper-accident-analysis-report-zh.md zookeeper-accident-analysis-report-zh.docx
```

## Mermaid Layout Tuning

Mermaid 布局参数现在由共享 runtime 配置控制，而不是由 CLI 单文件脚本控制。当前默认仍然使用更宽的 flowchart wrapping width 和线性曲线，以减少节点文字过早换行。

## Notes And Limitations

需要注意的点：

- Mermaid 图在 Word 中以图片形式存在，不是可编辑的 Mermaid 源码
- 极端复杂的大图在 Word 里仍可能因为页面宽度限制而缩放
- Markdown 到 DOCX 的“严格保真”只能尽量接近，尤其是 HTML/CSS 与 Word 的渲染模型并不完全一致
- 远程图片当前不会自动下载，最稳妥的方式是使用本地图片

## Troubleshooting

### Chrome not found

如果看到类似错误：

```text
Could not find Chrome
```

执行：

```bash
npx puppeteer browsers install chrome
```

### Mermaid text wraps too early

当前应修改共享 Mermaid runtime 配置，而不是重新引入 CLI 本地参数漂移。

### Unsupported local image format

当前脚本支持：

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.svg`

如果图片格式不在这个列表中，需要先转换图片格式，再执行 DOCX 导出。

## Help

查看工具帮助：

```bash
node md-to-docx.mjs --help
```

输出示例：

```text
Usage:
  node md-to-docx.mjs <input.md> [output.docx] [options]
```
