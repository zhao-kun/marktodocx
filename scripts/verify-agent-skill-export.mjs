import { exportDir, exportZipPath, verifyExportLayout } from './lib/agent-skill-export.mjs';

async function main() {
  await verifyExportLayout();
  console.log(`Agent skill export verified: ${exportDir}`);
  console.log(`Agent skill archive verified: ${exportZipPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});