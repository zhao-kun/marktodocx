import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import puppeteer from 'puppeteer';

const execFileAsync = promisify(execFile);
const defaultStyleOptions = {
  preset: 'default',
  overrides: {},
};
const extensionPagePath = 'page/index.html';
const extensionBuildDir = path.resolve(process.cwd(), 'markdocx-extension', 'dist');
const repoPackagePath = path.resolve(process.cwd(), 'package.json');
const extensionPackagePath = path.resolve(process.cwd(), 'markdocx-extension', 'package.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortKeysDeep(value[key])])
  );
}

function summarizeValues(values) {
  const uniqueValues = new Set(values.filter(Boolean));
  if (uniqueValues.size === 0) {
    return null;
  }
  if (uniqueValues.size === 1) {
    return [...uniqueValues][0];
  }
  return 'mixed';
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function ensurePathExists(filePath, description) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${description} not found: ${filePath}`);
  }
}

export async function getGitSha() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
  });
  return stdout.trim();
}

export async function getGitTreeState() {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: process.cwd(),
  });
  return stdout.trim() === '' ? 'clean' : 'dirty';
}

export function sha256(value) {
  const hash = crypto.createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}

export function normalizeStyleOptions(styleOptions) {
  const normalized = styleOptions && isPlainObject(styleOptions)
    ? structuredClone(styleOptions)
    : structuredClone(defaultStyleOptions);

  if (typeof normalized.preset !== 'string' || normalized.preset.length === 0) {
    normalized.preset = defaultStyleOptions.preset;
  }
  normalized.overrides = isPlainObject(normalized.overrides) ? normalized.overrides : {};

  return sortKeysDeep(normalized);
}

export function styleOptionsDigest(styleOptions) {
  return sha256(JSON.stringify(normalizeStyleOptions(styleOptions)));
}

export async function fileSha256(filePath) {
  return sha256(await fs.readFile(filePath));
}

export async function listFilesRecursively(rootDir) {
  const results = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(absolutePath)));
    } else {
      results.push(absolutePath);
    }
  }

  return results;
}

export async function buildImageMap(rootDir) {
  const files = await listFilesRecursively(rootDir);
  const imageMap = {};
  const mimeTypes = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.svg', 'image/svg+xml'],
  ]);

  for (const absolutePath of files) {
    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = mimeTypes.get(extension);
    if (!mimeType) {
      continue;
    }

    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
    const buffer = await fs.readFile(absolutePath);
    imageMap[relativePath] = `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  return imageMap;
}

export async function verifyPinnedMermaidVersion() {
  const [repoPackageJson, extensionPackageJson] = await Promise.all([
    readJson(repoPackagePath),
    readJson(extensionPackagePath),
  ]);
  const repoVersion = repoPackageJson.dependencies?.mermaid || null;
  const extensionVersion = extensionPackageJson.dependencies?.mermaid || null;

  if (!repoVersion || !extensionVersion) {
    throw new Error('Both the repository root and the extension package must declare a Mermaid dependency.');
  }

  if (repoVersion !== extensionVersion) {
    throw new Error(`Pinned Mermaid versions diverged: root=${repoVersion}, extension=${extensionVersion}.`);
  }

  return { repoVersion, extensionVersion };
}

export function extractMermaidBlocks(markdown) {
  const blocks = [];
  const pattern = /^```mermaid\s*\n([\s\S]*?)^```\s*$/gm;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

export async function createExtensionSession({ allowNoSandbox = false } = {}) {
  await verifyPinnedMermaidVersion();
  await ensurePathExists(extensionBuildDir, 'Extension build directory');
  await ensurePathExists(path.join(extensionBuildDir, 'manifest.json'), 'Extension manifest');

  const launchArgs = [
    `--disable-extensions-except=${extensionBuildDir}`,
    `--load-extension=${extensionBuildDir}`,
  ];
  if (allowNoSandbox) {
    launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: launchArgs,
  });

  const extensionId = await getExtensionId(browser, {
    onProgress: (message) => console.warn(message),
  });
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/${extensionPagePath}`, {
    waitUntil: 'networkidle0',
  });
  await assertParityHooks(page);

  return {
    browser,
    page,
    extensionId,
    async close() {
      await browser.close();
    },
  };
}

async function assertParityHooks(page) {
  const hasHooks = await page.evaluate(() => {
    return Boolean(
      window.__MARKDOCX_PARITY__
        && typeof window.__MARKDOCX_PARITY__.renderMermaidArtifactsForParity === 'function'
    );
  });

  if (!hasHooks) {
    throw new Error('Extension page is missing Mermaid parity hooks. Rebuild the extension before running parity tooling.');
  }
}

async function getExtensionId(browser, { onProgress } = {}) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const target of browser.targets()) {
      const url = target.url();
      if (url.startsWith('chrome-extension://')) {
        return new URL(url).host;
      }
    }

    if (onProgress && (attempt === 0 || (attempt + 1) % 10 === 0)) {
      onProgress(`Waiting for Chrome extension to load (${attempt + 1}/100)...`);
    }

    await sleep(100);
  }

  throw new Error(`Could not determine extension ID after launch. Ensure ${extensionBuildDir} exists and contains a built extension.`);
}

async function sendConvertMessage(page, payload) {
  let lastError;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await page.evaluate(async (messagePayload) => {
        return chrome.runtime.sendMessage({
          type: 'CONVERT_MD_TO_DOCX',
          conversionId: messagePayload.conversionId,
          markdown: messagePayload.markdown,
          imageMap: messagePayload.imageMap,
          mdRelativeDir: messagePayload.mdRelativeDir,
          styleOptions: messagePayload.styleOptions,
        });
      }, payload);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Receiving end does not exist') && !message.includes('Extension context invalidated')) {
        throw error;
      }
      await sleep(250);
    }
  }

  throw lastError || new Error('Failed to send conversion message to extension runtime.');
}

export async function convertFixtureWithExtension(session, fixture) {
  const testMarkdownRoot = path.resolve(process.cwd(), 'test-markdown');
  const markdownPath = path.resolve(process.cwd(), fixture.markdownPath);
  const markdown = await fs.readFile(markdownPath, 'utf8');
  const imageMap = await buildImageMap(testMarkdownRoot);
  const mdRelativeDir = path.relative(testMarkdownRoot, path.dirname(markdownPath)).split(path.sep).join('/');
  const normalizedRelativeDir = mdRelativeDir === '.' ? '' : mdRelativeDir;
  const styleOptions = normalizeStyleOptions(fixture.styleOptions);
  const conversionId = `fixture-${fixture.id}-${crypto.randomUUID()}`;

  const result = await sendConvertMessage(session.page, {
    conversionId,
    markdown,
    imageMap,
    mdRelativeDir: normalizedRelativeDir,
    styleOptions,
  });

  if (!result?.success || !result.data) {
    throw new Error(`Fixture ${fixture.id} failed: ${result?.error || 'No response data'}`);
  }

  return {
    markdown,
    markdownPath,
    base64: result.data,
    styleOptions,
  };
}

export async function saveDocxBase64(base64, outputPath) {
  const buffer = Buffer.from(base64, 'base64');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

function normalizeSvg(svg) {
  return svg
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function renderMermaidArtifactsWithExtension(session, markdown, styleOptions = defaultStyleOptions) {
  return session.page.evaluate(async ({ markdownSource, runtimeStyleOptions }) => {
    return window.__MARKDOCX_PARITY__.renderMermaidArtifactsForParity(markdownSource, runtimeStyleOptions);
  }, {
    markdownSource: markdown,
    runtimeStyleOptions: normalizeStyleOptions(styleOptions),
  });
}

export async function renderMermaidSvgMetadata(session, markdown, styleOptions = defaultStyleOptions) {
  const artifacts = await renderMermaidArtifactsWithExtension(session, markdown, styleOptions);
  if (artifacts.length === 0) {
    return [];
  }

  return artifacts.map((artifact) => ({
    index: artifact.index,
    displayWidth: artifact.displayWidth,
    displayHeight: artifact.displayHeight,
    sha256: sha256(normalizeSvg(artifact.svg)),
  }));
}

async function renderMermaidBaselinePngs(session, markdown, styleOptions = defaultStyleOptions) {
  const artifacts = await renderMermaidArtifactsWithExtension(session, markdown, styleOptions);
  return artifacts.map((artifact) => artifact.pngBase64);
}

export async function extractVisualBaselines(session, markdown, fixtureId, styleOptions = defaultStyleOptions) {
  const pngs = await renderMermaidBaselinePngs(session, markdown, styleOptions);
  const outputDir = path.resolve(process.cwd(), 'test-markdown', '__golden__', 'visual-baselines', fixtureId);
  await fs.rm(outputDir, { recursive: true, force: true });

  if (pngs.length === 0) {
    return 0;
  }

  await fs.mkdir(outputDir, { recursive: true });
  for (let index = 0; index < pngs.length; index += 1) {
    const pngBuffer = Buffer.from(pngs[index], 'base64');
    const fileName = `${String(index + 1).padStart(2, '0')}.png`;
    await fs.writeFile(path.join(outputDir, fileName), pngBuffer);
  }

  return pngs.length;
}

export async function renderCurrentVisualBaselineHashes(session, markdown, styleOptions = defaultStyleOptions) {
  const pngs = await renderMermaidBaselinePngs(session, markdown, styleOptions);
  return pngs.map((pngBase64) => sha256(Buffer.from(pngBase64, 'base64')));
}

export function summarizeFixtureSourceSha(fixtures) {
  return summarizeValues(fixtures.map((fixture) => fixture.sourceSha));
}

export function summarizeFixtureSourceTreeState(fixtures) {
  return summarizeValues(fixtures.map((fixture) => fixture.sourceTreeState));
}

export function summarizeFixtureProvenance(fixtures) {
  return {
    sourceSha: summarizeFixtureSourceSha(fixtures),
    sourceTreeState: summarizeFixtureSourceTreeState(fixtures),
  };
}