import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createExtensionSession, convertFixtureWithExtension, saveDocxBase64 } from './scripts/lib/extension-parity.mjs';
import { loadDocxEntriesFromFile, normalizeDocxXml } from './scripts/lib/docx-parity.mjs';

async function run() {
  const session = await createExtensionSession({ allowNoSandbox: true });
  const fixture = {
    id: 'all-features',
    markdownPath: 'test-markdown/test.md',
    styleOptions: {
      preset: 'default',
      overrides: {}
    }
  };

  try {
    for (let i = 0; i < 3; i++) {
        const result = await convertFixtureWithExtension(session, fixture);
        const tempDocxPath = "temp_all_features_" + i + ".docx";
        await saveDocxBase64(result.base64, tempDocxPath);

        const entryMap = await loadDocxEntriesFromFile(tempDocxPath);
        const xml = entryMap['word/document.xml'];
        const normalizedXml = normalizeDocxXml('word/document.xml', xml);
        
        const hash = createHash('sha256').update(normalizedXml).digest('hex');
        console.log(hash);
        
        await fs.unlink(tempDocxPath);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    if (session && session.browser) {
      await session.browser.close();
    }
  }
}

run();
