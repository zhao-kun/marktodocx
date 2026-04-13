#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  convertMarkdownFileInNode,
  resolveNodeStyleOptions,
} from '@markdocx/runtime-node';

function printUsage() {
  console.log([
    'Usage:',
    '  node md-to-docx.mjs <input.md> [output.docx] [options]',
    '',
    'Options:',
    '  --style-preset <name>     Base style preset (default|minimal|report)',
    '  --margin-preset <name>    Page margin preset (default|compact|wide)',
    '  --style-json <json|path>  Style options JSON string or JSON file path',
    '  --set <key=value>         Targeted style override, repeatable',
    '  --help, -h                Show this help',
    '',
    'Environment defaults:',
    '  MARKDOCX_STYLE_PRESET',
    '  MARKDOCX_MARGIN_PRESET',
    '  MARKDOCX_STYLE_JSON',
    '  MARKDOCX_STYLE_SET',
    '',
    'Examples:',
    '  node md-to-docx.mjs report.md',
    '  node md-to-docx.mjs report.md output.docx --style-preset minimal',
    '  node md-to-docx.mjs report.md --style-json ./style-options.json --set body.fontSizePt=12',
  ].join('\n'));
}

function readOptionValue(currentArg, argv, index, optionName) {
  const equalsIndex = currentArg.indexOf('=');
  if (equalsIndex >= 0) {
    return {
      value: currentArg.slice(equalsIndex + 1),
      nextIndex: index,
    };
  }

  if (index + 1 >= argv.length) {
    throw new Error(`${optionName} requires a value`);
  }

  return {
    value: argv[index + 1],
    nextIndex: index + 1,
  };
}

function parseArgs(argv) {
  const options = {
    styleSet: [],
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--style-preset' || arg.startsWith('--style-preset=')) {
      const result = readOptionValue(arg, argv, index, '--style-preset');
      options.stylePreset = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--margin-preset' || arg.startsWith('--margin-preset=')) {
      const result = readOptionValue(arg, argv, index, '--margin-preset');
      options.marginPreset = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--style-json' || arg.startsWith('--style-json=')) {
      const result = readOptionValue(arg, argv, index, '--style-json');
      options.styleJson = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--set' || arg.startsWith('--set=')) {
      const result = readOptionValue(arg, argv, index, '--set');
      options.styleSet.push(result.value);
      index = result.nextIndex;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (options.help) {
    return options;
  }

  if (positional.length === 0 || positional.length > 2) {
    throw new Error('CLI requires an input markdown path and accepts at most one output path');
  }

  options.inputPath = path.resolve(process.cwd(), positional[0]);
  options.outputPath = positional[1] ? path.resolve(process.cwd(), positional[1]) : undefined;
  return options;
}

function isOptionalModuleMissing(error) {
  return error?.code === 'ERR_MODULE_NOT_FOUND'
    && String(error.message || '').includes('@markdocx/runtime-node-mermaid');
}

async function createOptionalMermaidRenderer(markdown) {
  if (!markdown.includes('```mermaid')) {
    return null;
  }

  try {
    const { createPuppeteerMermaidRenderer } = await import('@markdocx/runtime-node-mermaid');
    return createPuppeteerMermaidRenderer();
  } catch (error) {
    if (isOptionalModuleMissing(error)) {
      throw new Error(
        'This document contains Mermaid diagrams. Install @markdocx/runtime-node-mermaid to enable Mermaid rendering on the Node CLI path.'
      );
    }
    throw error;
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    return;
  }

  let mermaidRenderer = null;
  try {
    const markdown = await fs.readFile(options.inputPath, 'utf8');
    const styleOptions = await resolveNodeStyleOptions({
      cwd: process.cwd(),
      env: process.env,
      stylePreset: options.stylePreset,
      marginPreset: options.marginPreset,
      styleJson: options.styleJson,
      styleSet: options.styleSet,
    });

    mermaidRenderer = await createOptionalMermaidRenderer(markdown);

    const result = await convertMarkdownFileInNode({
      inputPath: options.inputPath,
      outputPath: options.outputPath,
      styleOptions,
      renderMermaid: mermaidRenderer?.renderMermaidToImageTag?.bind(mermaidRenderer),
    });

    console.log(`Wrote ${result.outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await mermaidRenderer?.close?.();
  }
}

main();