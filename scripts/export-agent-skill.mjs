import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createExportPackageJson,
  createExportZipArchive,
  exportDir,
  packPackage,
  prepareExportDirectory,
  provisionMermaidSupport,
  repoRoot,
  runStandaloneSmokeTest,
  installExportDependencies,
  verifyExportLayout,
} from './lib/agent-skill-export.mjs';

function parseArgs(argv) {
  return {
    withMermaid: argv.includes('--with-mermaid'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await prepareExportDirectory();

  const [coreTarball, runtimeNodeTarball, runtimeNodeMermaidTarball] = await Promise.all([
    packPackage(path.join(repoRoot, 'packages', 'core')),
    packPackage(path.join(repoRoot, 'packages', 'runtime-node')),
    packPackage(path.join(repoRoot, 'packages', 'runtime-node-mermaid')),
  ]);

  const exportPackageJson = await createExportPackageJson({
    coreTarball,
    runtimeNodeTarball,
    runtimeNodeMermaidTarball,
  });

  await fs.writeFile(
    path.join(exportDir, 'package.json'),
    `${JSON.stringify(exportPackageJson, null, 2)}\n`,
    'utf8'
  );

  await installExportDependencies({ withMermaid: options.withMermaid });
  await provisionMermaidSupport({ withMermaid: options.withMermaid });
  await createExportZipArchive();
  await verifyExportLayout();
  await runStandaloneSmokeTest({ withMermaid: options.withMermaid });

  console.log(`Standalone agent skill exported to ${exportDir}${options.withMermaid ? ' with Mermaid support' : ''}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});