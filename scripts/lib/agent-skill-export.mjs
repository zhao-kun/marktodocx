import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const execFile = promisify(execFileCallback);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptDir, '..', '..');
export const appDir = path.join(repoRoot, 'apps', 'agent-skill');
export const distDir = path.join(appDir, 'dist');
export const exportDir = path.join(distDir, 'markdocx-skill');
export const vendorDir = path.join(exportDir, 'vendor');
export const exportZipPath = path.join(distDir, 'markdocx-skill.zip');
export const exportManifestPath = path.join(exportDir, 'markdocx-export-manifest.json');
export const exportBrowserDir = path.join(exportDir, 'browser');
export const requiredBaseVendorPackages = [
  'markdocx-core',
  'markdocx-runtime-node',
];

async function readRootPackageManifest() {
  return JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
}

export function getNpmInvocation() {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === 'string' && npmExecPath.length > 0) {
    return {
      command: process.execPath,
      prefixArgs: [npmExecPath],
    };
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: [],
  };
}

export async function runNpm(args, options = {}) {
  const invocation = getNpmInvocation();
  return execFile(invocation.command, [...invocation.prefixArgs, ...args], options);
}

export async function packPackage(packageDir) {
  const result = await runNpm([
    'pack',
    packageDir,
    '--pack-destination',
    vendorDir,
    '--json',
  ], {
    cwd: repoRoot,
    env: process.env,
  });

  const parsed = JSON.parse(result.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!entry?.filename) {
    throw new Error(`npm pack did not return a filename for ${packageDir}`);
  }

  return entry.filename;
}

export async function createExportPackageJson({ coreTarball, runtimeNodeTarball, runtimeNodeMermaidTarball }) {
  const rootManifest = await readRootPackageManifest();
  return {
    name: 'markdocx-skill-export',
    private: true,
    type: 'module',
    main: './skill.mjs',
    dependencies: {
      '@markdocx/runtime-node': `file:./vendor/${runtimeNodeTarball}`,
    },
    optionalDependencies: {
      '@markdocx/runtime-node-mermaid': `file:./vendor/${runtimeNodeMermaidTarball}`,
    },
    overrides: {
      ...(rootManifest.overrides || {}),
      '@markdocx/core': `file:./vendor/${coreTarball}`,
    },
  };
}

export async function prepareExportDirectory() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(vendorDir, { recursive: true });

  await Promise.all([
    fs.copyFile(path.join(appDir, 'SKILL.md'), path.join(exportDir, 'SKILL.md')),
    fs.copyFile(path.join(appDir, 'README.md'), path.join(exportDir, 'README.md')),
    fs.copyFile(path.join(appDir, 'skill.mjs'), path.join(exportDir, 'skill.mjs')),
  ]);
}

export async function installExportDependencies({ withMermaid = false } = {}) {
  const installArgs = ['install', '--omit=dev'];
  if (!withMermaid) {
    installArgs.push('--omit=optional');
  }

  await runNpm(installArgs, {
    cwd: exportDir,
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: '1',
    },
  });
}

function shouldInstallPuppeteerSystemDeps(env = process.env) {
  return env.MARKDOCX_PUPPETEER_INSTALL_DEPS === '1';
}

function isSandboxRestrictionError(text) {
  return /No usable sandbox!/i.test(text);
}

function isMissingSharedLibrariesError(text) {
  return /error while loading shared libraries:/i.test(text);
}

async function installVendoredChromeBrowser() {
  const installArgs = ['exec', 'puppeteer', 'browsers', 'install', 'chrome'];
  if (shouldInstallPuppeteerSystemDeps(process.env)) {
    installArgs.push('--install-deps');
  }

  await fs.mkdir(exportBrowserDir, { recursive: true });
  const result = await runNpm(installArgs, {
    cwd: exportDir,
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: exportBrowserDir,
      PUPPETEER_SKIP_DOWNLOAD: '0',
    },
  });

  const outputLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => /^chrome@\S+\s+.+$/.test(line));

  if (!outputLine) {
    throw new Error('Failed to determine the vendored Chromium executable path from `puppeteer browsers install chrome`.');
  }

  const match = outputLine.match(/^chrome@(\S+)\s+(.+)$/);
  if (!match) {
    throw new Error(`Unexpected Puppeteer browser install output: ${outputLine}`);
  }

  const executablePath = match[2].trim();
  await fs.access(executablePath);

  return {
    browser: 'chrome',
    buildId: match[1],
    executablePath,
    relativeExecutablePath: path.relative(exportDir, executablePath),
  };
}

async function probeBundledBrowserLaunchArgs(executablePath) {
  async function tryLaunch(args) {
    const code = [
      "import puppeteer from 'puppeteer';",
      `const browser = await puppeteer.launch({ executablePath: ${JSON.stringify(executablePath)}, args: ${JSON.stringify(args)}, headless: 'new' });`,
      'await browser.close();',
      "process.stdout.write('ok');",
    ].join('\n');

    const result = await execFile(process.execPath, ['--input-type=module', '--eval', code], {
      cwd: exportDir,
      env: process.env,
    });

    assert.equal(result.stdout, 'ok');
  }

  try {
    await tryLaunch([]);
    return [];
  } catch (error) {
    const text = error instanceof Error ? error.stack || error.message : String(error);
    if (isMissingSharedLibrariesError(text)) {
      throw error;
    }

    if (!isSandboxRestrictionError(text)) {
      throw error;
    }

    await tryLaunch(['--no-sandbox', '--disable-setuid-sandbox']);
    return ['--no-sandbox', '--disable-setuid-sandbox'];
  }
}

function buildMermaidSmokeFailureMessage(error) {
  const text = error instanceof Error ? error.stack || error.message : String(error);
  if (isSandboxRestrictionError(text)) {
    return [
      'Mermaid-enabled export bundled Chromium successfully, but the current Linux host does not allow Chromium to start with its sandbox enabled.',
      'This commonly happens on Ubuntu 23.10+ or other hosts where unprivileged user namespaces are restricted by AppArmor or kernel policy.',
      'If this is a trusted CI, VPS, or container environment, rerun with:',
      '  MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid',
      'If you also need Puppeteer to install Linux runtime libraries automatically, combine it with:',
      '  sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid',
      '',
      'Original launch error:',
      text,
    ].join('\n');
  }

  if (!isMissingSharedLibrariesError(text)) {
    return text;
  }

  return [
    'Mermaid-enabled export bundled Chromium successfully, but the current Linux host is missing one or more shared libraries required to launch it.',
    'Install the Puppeteer Linux runtime dependencies on the deploy host and rerun the export smoke test.',
    'On Debian or Ubuntu, you can let Puppeteer attempt this automatically with:',
    '  sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid',
    'If you prefer to install packages manually, install the Chromium runtime libraries required by Puppeteer for your distro.',
    'If this host is a container or restricted environment, you may also need:',
    '  MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid',
    '',
    'Original launch error:',
    text,
  ].join('\n');
}

export async function writeExportManifest({
  withMermaid = false,
  bundledBrowser = null,
} = {}) {
  const manifest = {
    version: 1,
    profile: withMermaid ? 'with-mermaid' : 'standard',
    platform: process.platform,
    arch: process.arch,
    createdAt: new Date().toISOString(),
    mermaid: withMermaid
      ? {
          bundled: true,
          bundledBrowser: bundledBrowser
            ? {
                browser: bundledBrowser.browser,
                buildId: bundledBrowser.buildId,
                executablePath: bundledBrowser.relativeExecutablePath.replace(/\\/g, '/'),
                launchArgs: Array.isArray(bundledBrowser.launchArgs) ? bundledBrowser.launchArgs : [],
              }
            : null,
        }
      : {
          bundled: false,
        },
  };

  await fs.writeFile(exportManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export async function provisionMermaidSupport({ withMermaid = false } = {}) {
  if (!withMermaid) {
    return writeExportManifest({ withMermaid: false });
  }

  const bundledBrowser = await installVendoredChromeBrowser();
  try {
    bundledBrowser.launchArgs = await probeBundledBrowserLaunchArgs(bundledBrowser.executablePath);
  } catch (error) {
    throw new Error(buildMermaidSmokeFailureMessage(error));
  }

  return writeExportManifest({
    withMermaid: true,
    bundledBrowser,
  });
}

export async function runStandaloneSmokeTest({ withMermaid = false } = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-skill-export-'));
  const isolatedSkillDir = path.join(tempRoot, 'markdocx-skill');
  const markdownPath = path.join(tempRoot, 'sample.md');
  const outputPath = path.join(tempRoot, 'sample.docx');

  try {
    await fs.cp(exportDir, isolatedSkillDir, { recursive: true });
    await fs.writeFile(
      markdownPath,
      withMermaid
        ? '# Standalone Mermaid Skill Smoke\n\n```mermaid\ngraph TD\n  A-->B\n```\n'
        : '# Standalone Skill Smoke\n\nPlain paragraph.\n',
      'utf8'
    );

    const code = [
      "import { convertWithAgentSkill } from './skill.mjs';",
      `await convertWithAgentSkill({ inputPath: ${JSON.stringify(markdownPath)}, outputPath: ${JSON.stringify(outputPath)}, stylePreset: 'minimal' });`,
      "process.stdout.write('ok');",
    ].join('\n');

    let result;
    try {
      result = await execFile(process.execPath, ['--input-type=module', '--eval', code], {
        cwd: isolatedSkillDir,
        env: process.env,
      });
    } catch (error) {
      if (withMermaid) {
        throw new Error(buildMermaidSmokeFailureMessage(error));
      }
      throw error;
    }

    assert.equal(result.stdout, 'ok');
    const stat = await fs.stat(outputPath);
    assert.equal(stat.size > 0, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const relativeFiles = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      relativeFiles.push(...await collectRelativeFiles(rootDir, entryPath));
      continue;
    }
    if (entry.isFile()) {
      relativeFiles.push(path.relative(rootDir, entryPath));
    }
  }

  return relativeFiles;
}

export async function createExportZipArchive() {
  const zip = new JSZip();
  const exportRootName = path.basename(exportDir);
  const relativeFiles = await collectRelativeFiles(exportDir);

  for (const relativeFile of relativeFiles) {
    const absoluteFile = path.join(exportDir, relativeFile);
    zip.file(
      path.posix.join(exportRootName, relativeFile.replace(/\\/g, '/')),
      createReadStream(absoluteFile)
    );
  }

  await pipeline(
    zip.generateNodeStream({
      streamFiles: true,
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }),
    createWriteStream(exportZipPath)
  );
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertPathExists(filePath, message) {
  if (!(await pathExists(filePath))) {
    throw new Error(message);
  }
}

function getLockPackage(lockFile, packagePath) {
  return lockFile?.packages?.[packagePath] || null;
}

async function verifyExportArchive() {
  const archive = await JSZip.loadAsync(await fs.readFile(exportZipPath));
  const exportRootName = path.basename(exportDir);
  assert.equal(archive.file(`${exportRootName}/SKILL.md`) != null, true, 'Exported zip archive is missing markdocx-skill/SKILL.md.');
  assert.equal(archive.file(`${exportRootName}/skill.mjs`) != null, true, 'Exported zip archive is missing markdocx-skill/skill.mjs.');
  assert.equal(archive.file(`${exportRootName}/markdocx-export-manifest.json`) != null, true, 'Exported zip archive is missing markdocx-skill/markdocx-export-manifest.json.');
}

export async function verifyExportLayout() {
  await assertPathExists(exportDir, 'Missing exported skill directory. Run npm run export:agent-skill first.');
  await assertPathExists(exportZipPath, 'Missing exported skill zip archive. Run npm run export:agent-skill first.');

  const manifest = JSON.parse(await fs.readFile(exportManifestPath, 'utf8'));
  const packageJson = JSON.parse(await fs.readFile(path.join(exportDir, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(await fs.readFile(path.join(exportDir, 'package-lock.json'), 'utf8'));

  await Promise.all([
    assertPathExists(path.join(exportDir, 'SKILL.md'), 'Exported skill is missing SKILL.md.'),
    assertPathExists(path.join(exportDir, 'README.md'), 'Exported skill is missing README.md.'),
    assertPathExists(path.join(exportDir, 'skill.mjs'), 'Exported skill is missing skill.mjs.'),
    assertPathExists(path.join(exportDir, 'package.json'), 'Exported skill is missing package.json.'),
    assertPathExists(path.join(exportDir, 'package-lock.json'), 'Exported skill is missing package-lock.json.'),
    assertPathExists(exportManifestPath, 'Exported skill is missing markdocx-export-manifest.json.'),
    assertPathExists(path.join(exportDir, 'node_modules', '@markdocx', 'runtime-node', 'package.json'), 'Exported skill is missing installed @markdocx/runtime-node.'),
    assertPathExists(path.join(exportDir, 'node_modules', '@markdocx', 'core', 'package.json'), 'Exported skill is missing installed @markdocx/core.'),
  ]);

  const vendorEntries = await fs.readdir(vendorDir);
  for (const packageStem of requiredBaseVendorPackages) {
    assert.equal(
      vendorEntries.some((entry) => entry.startsWith(`${packageStem}-`) && entry.endsWith('.tgz')),
      true,
      `Exported skill vendor directory is missing ${packageStem} tarball.`
    );
  }
  assert.equal(
    vendorEntries.some((entry) => entry.startsWith('markdocx-runtime-node-mermaid-') && entry.endsWith('.tgz')),
    true,
    'Exported skill vendor directory is missing markdocx-runtime-node-mermaid tarball.'
  );

  assert.equal(packageJson.name, 'markdocx-skill-export');
  assert.equal(packageJson.type, 'module');
  assert.equal(typeof packageJson.dependencies?.['@markdocx/runtime-node'], 'string');
  assert.equal(typeof packageJson.optionalDependencies?.['@markdocx/runtime-node-mermaid'], 'string');
  assert.equal('@markdocx/runtime-node-mermaid' in (packageJson.dependencies || {}), false, 'Mermaid runtime must remain optional in exported package.json.');

  const runtimeNodePackage = getLockPackage(packageLock, 'node_modules/@markdocx/runtime-node');
  const corePackage = getLockPackage(packageLock, 'node_modules/@markdocx/core');
  assert.equal(typeof runtimeNodePackage?.resolved, 'string');
  assert.equal(runtimeNodePackage.resolved.startsWith('file:vendor/markdocx-runtime-node-'), true, 'Exported @markdocx/runtime-node must resolve from the vendored tarball.');
  assert.equal(typeof corePackage?.resolved, 'string');
  assert.equal(corePackage.resolved.startsWith('file:vendor/markdocx-core-'), true, 'Exported @markdocx/core must resolve from the vendored tarball.');

  const zipStat = await fs.stat(exportZipPath);
  assert.equal(zipStat.size > 0, true, 'Exported skill zip archive is empty.');

  assert.equal(manifest.version, 1);
  assert.equal(typeof manifest.profile, 'string');
  assert.equal(manifest.platform, process.platform);
  assert.equal(manifest.arch, process.arch);

  if (manifest.profile === 'with-mermaid') {
    const bundledBrowser = manifest.mermaid?.bundledBrowser;
    const runtimeNodeMermaidPackage = getLockPackage(packageLock, 'node_modules/@markdocx/runtime-node-mermaid');
    assert.equal(manifest.mermaid?.bundled, true, 'Mermaid-enabled export manifest must record bundled Mermaid support.');
    assert.equal(typeof bundledBrowser?.executablePath, 'string', 'Mermaid-enabled export manifest is missing bundled browser executablePath.');
    assert.equal(Array.isArray(bundledBrowser?.launchArgs), true, 'Mermaid-enabled export manifest must record bundled browser launchArgs.');
    assert.equal(typeof runtimeNodeMermaidPackage?.resolved, 'string');
    assert.equal(runtimeNodeMermaidPackage.resolved.startsWith('file:vendor/markdocx-runtime-node-mermaid-'), true, 'Exported @markdocx/runtime-node-mermaid must resolve from the vendored tarball.');
    await Promise.all([
      assertPathExists(path.join(exportDir, 'node_modules', '@markdocx', 'runtime-node-mermaid', 'package.json'), 'Mermaid-enabled export is missing installed @markdocx/runtime-node-mermaid.'),
      assertPathExists(path.resolve(exportDir, bundledBrowser.executablePath), 'Mermaid-enabled export is missing its bundled browser binary.'),
    ]);
  } else {
    assert.equal(manifest.profile, 'standard');
    assert.equal(manifest.mermaid?.bundled, false, 'Standard export manifest must record Mermaid support as disabled.');
    assert.equal(await pathExists(path.join(exportDir, 'node_modules', '@markdocx', 'runtime-node-mermaid', 'package.json')), false, 'Standard export must not install @markdocx/runtime-node-mermaid.');
    assert.equal(await pathExists(exportBrowserDir), false, 'Standard export must not bundle a browser directory.');
  }

  await verifyExportArchive();
}