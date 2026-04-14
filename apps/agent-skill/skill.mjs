import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  convertMarkdownInNode,
  resolveNodeStyleOptions,
} from '@markdocx/runtime-node';

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const exportManifestPath = path.join(skillDir, 'markdocx-export-manifest.json');

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

export async function readAgentSkillExportManifest() {
  return readAgentSkillExportManifestFromPath(exportManifestPath);
}

async function readAgentSkillExportManifestFromPath(manifestPath) {
  try {
    const source = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(source);
    return isPlainObject(manifest) ? manifest : null;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function assertBundledBrowserTargetMatchesCurrentHost(manifest) {
  const targetPlatform = typeof manifest?.platform === 'string' ? manifest.platform : '';
  const targetArch = typeof manifest?.arch === 'string' ? manifest.arch : '';

  if (!targetPlatform || !targetArch) {
    throw new Error(
      'The exported Mermaid manifest is missing target platform metadata. Re-extract the exported skill archive or re-run the export with --with-mermaid.'
    );
  }

  if (targetPlatform === process.platform && targetArch === process.arch) {
    return;
  }

  throw new Error(
    `This Mermaid-enabled export targets ${targetPlatform}-${targetArch}, but the current host is ${process.platform}-${process.arch}. Re-export the skill on the target platform, or set PUPPETEER_EXECUTABLE_PATH to a compatible browser.`
  );
}

export async function resolveBundledMermaidLaunchOptions({
  env = process.env,
  manifest,
  skillRootDir = skillDir,
} = {}) {
  if (typeof env.PUPPETEER_EXECUTABLE_PATH === 'string' && env.PUPPETEER_EXECUTABLE_PATH.trim() !== '') {
    return undefined;
  }

  const resolvedManifest = manifest ?? await readAgentSkillExportManifestFromPath(path.join(skillRootDir, 'markdocx-export-manifest.json'));
  const bundledBrowser = resolvedManifest?.mermaid?.bundledBrowser;
  if (!isPlainObject(bundledBrowser)) {
    return undefined;
  }

  assertBundledBrowserTargetMatchesCurrentHost(resolvedManifest);

  if (typeof bundledBrowser.executablePath !== 'string' || bundledBrowser.executablePath.trim() === '') {
    throw new Error('The exported Mermaid manifest is missing a bundled browser executablePath. Re-export with --with-mermaid.');
  }

  const resolvedExecutablePath = path.resolve(skillRootDir, bundledBrowser.executablePath);
  try {
    await fs.access(resolvedExecutablePath);
  } catch {
    throw new Error(
      `The bundled Mermaid browser is missing at ${resolvedExecutablePath}. Re-extract the exported skill archive, re-run the export with --with-mermaid, or set PUPPETEER_EXECUTABLE_PATH to a compatible browser.`
    );
  }

  const launchArgs = Array.isArray(bundledBrowser.launchArgs)
    ? bundledBrowser.launchArgs.filter((value) => typeof value === 'string' && value.trim() !== '')
    : [];

  return {
    executablePath: resolvedExecutablePath,
    args: launchArgs,
  };
}

function buildMissingMermaidSupportError(manifest) {
  if (manifest?.profile === 'standard') {
    return new Error(
      'This exported skill was built without Mermaid support. Re-export with --with-mermaid to bundle Chromium-backed Mermaid rendering, or install @markdocx/runtime-node-mermaid and provision Chromium on the target host.'
    );
  }

  if (manifest?.profile === 'with-mermaid') {
    return new Error(
      'This exported skill declares Mermaid support, but @markdocx/runtime-node-mermaid is missing from the deployed artifact. Rebuild or re-extract the Mermaid-enabled export, or set PUPPETEER_EXECUTABLE_PATH if you want to recover with a host-provided browser after restoring the Mermaid package.'
    );
  }

  return new Error(
    'This document contains Mermaid diagrams. Install @markdocx/runtime-node-mermaid to enable Mermaid rendering on the agent skill Node path.'
  );
}

export async function createOptionalMermaidRenderer(markdown, {
  env = process.env,
} = {}) {
  if (!markdown.includes('```mermaid')) {
    return null;
  }

  try {
    const { createPuppeteerMermaidRenderer } = await import('@markdocx/runtime-node-mermaid');
    const launchOptions = await resolveBundledMermaidLaunchOptions({ env });
    return createPuppeteerMermaidRenderer(launchOptions ? { launchOptions } : undefined);
  } catch (error) {
    if (isOptionalModuleMissing(error)) {
      throw buildMissingMermaidSupportError(await readAgentSkillExportManifest());
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

  const mermaidRenderer = await createOptionalMermaidRenderer(input.markdown, { env });
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