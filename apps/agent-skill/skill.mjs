import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  convertMarkdownInNode,
  resolveNodeStyleOptions,
} from '@markdocx/runtime-node';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSkillStyleJson(styleJson) {
  if (styleJson == null || styleJson === '') {
    return undefined;
  }

  if (typeof styleJson === 'string') {
    return styleJson;
  }

  if (isPlainObject(styleJson)) {
    return JSON.stringify(styleJson);
  }

  throw new TypeError('styleJson must be a string, a plain object, or undefined');
}

export function normalizeSkillStyleSet(styleSet) {
  if (Array.isArray(styleSet)) {
    return styleSet.filter((value) => typeof value === 'string' && value.trim() !== '');
  }

  if (typeof styleSet === 'string' && styleSet.trim() !== '') {
    return [styleSet];
  }

  if (styleSet == null || styleSet === '') {
    return [];
  }

  throw new TypeError('styleSet must be a string, an array of strings, or undefined');
}

function resolveDefaultOutputPath(inputPath) {
  return path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.docx`
  );
}

function isOptionalModuleMissing(error) {
  return error?.code === 'ERR_MODULE_NOT_FOUND'
    && String(error.message || '').includes('@markdocx/runtime-node-mermaid');
}

export async function createOptionalMermaidRenderer(markdown) {
  if (!markdown.includes('```mermaid')) {
    return null;
  }

  try {
    const { createPuppeteerMermaidRenderer } = await import('@markdocx/runtime-node-mermaid');
    return createPuppeteerMermaidRenderer();
  } catch (error) {
    if (isOptionalModuleMissing(error)) {
      throw new Error(
        'This document contains Mermaid diagrams. Install @markdocx/runtime-node-mermaid to enable Mermaid rendering on the agent skill Node path.'
      );
    }
    throw error;
  }
}

export async function resolveAgentSkillStyleOptions({
  cwd = process.cwd(),
  env = process.env,
  stylePreset,
  marginPreset,
  styleJson,
  styleSet,
} = {}) {
  return resolveNodeStyleOptions({
    cwd,
    env,
    stylePreset,
    marginPreset,
    styleJson: normalizeSkillStyleJson(styleJson),
    styleSet: normalizeSkillStyleSet(styleSet),
  });
}

async function resolveSkillInput({
  inputPath,
  markdown,
  baseDir,
  cwd,
}) {
  const hasInputPath = typeof inputPath === 'string' && inputPath.trim() !== '';
  const hasMarkdown = typeof markdown === 'string';

  if (hasInputPath === hasMarkdown) {
    throw new TypeError('Provide exactly one of inputPath or markdown');
  }

  if (hasInputPath) {
    const resolvedInputPath = path.resolve(cwd, inputPath);
    return {
      markdown: await fs.readFile(resolvedInputPath, 'utf8'),
      baseDir: path.dirname(resolvedInputPath),
      resolvedInputPath,
    };
  }

  if (typeof baseDir === 'string' && baseDir.trim() !== '') {
    return {
      markdown,
      baseDir: path.resolve(cwd, baseDir),
      resolvedInputPath: null,
    };
  }

  return {
    markdown,
    baseDir: cwd,
    resolvedInputPath: null,
  };
}

export async function convertWithAgentSkill({
  inputPath,
  markdown,
  baseDir,
  outputPath,
  cwd = process.cwd(),
  env = process.env,
  stylePreset,
  marginPreset,
  styleJson,
  styleSet,
  onProgress,
} = {}) {
  const resolvedCwd = path.resolve(cwd);
  const input = await resolveSkillInput({
    inputPath,
    markdown,
    baseDir,
    cwd: resolvedCwd,
  });

  const styleOptions = await resolveAgentSkillStyleOptions({
    cwd: resolvedCwd,
    env,
    stylePreset,
    marginPreset,
    styleJson,
    styleSet,
  });

  const mermaidRenderer = await createOptionalMermaidRenderer(input.markdown);
  let bytes;

  try {
    bytes = await convertMarkdownInNode({
      markdown: input.markdown,
      baseDir: input.baseDir,
      styleOptions,
      renderMermaid: mermaidRenderer?.renderMermaidToImageTag?.bind(mermaidRenderer),
      onProgress,
    });
  } finally {
    await mermaidRenderer?.close?.();
  }

  const resolvedOutputPath = typeof outputPath === 'string' && outputPath.trim() !== ''
    ? path.resolve(resolvedCwd, outputPath)
    : input.resolvedInputPath
      ? resolveDefaultOutputPath(input.resolvedInputPath)
      : undefined;

  if (resolvedOutputPath) {
    await fs.writeFile(resolvedOutputPath, bytes);
  }

  return {
    bytes,
    outputPath: resolvedOutputPath,
    styleOptions,
  };
}