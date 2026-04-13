import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import { MERMAID_DOCX_DESCRIPTION_PREFIX } from '@markdocx/core';

import {
  buildRelationshipMap,
  compareDocxEntryMaps,
  extractMermaidMediaEntries,
  formatDifferences,
  loadDocxEntriesFromFile,
  loadDocxEntriesFromBuffer,
  normalizeDocxXml,
} from '../scripts/lib/docx-parity.mjs';

async function buildZipBuffer(entryMap) {
  const zip = new JSZip();
  for (const [entryPath, value] of Object.entries(entryMap)) {
    zip.file(entryPath, value);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('normalizeDocxXml removes timestamps and revision from core properties', () => {
  const xml = [
    '<cp:coreProperties xmlns:cp="cp" xmlns:dcterms="dcterms" xmlns:xsi="xsi">',
    '  <dcterms:created xsi:type="dcterms:W3CDTF">2026-04-12T10:00:00Z</dcterms:created>',
    '  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-12T11:00:00Z</dcterms:modified>',
    '  <cp:revision>7</cp:revision>',
    '</cp:coreProperties>',
  ].join('');

  const normalized = normalizeDocxXml('docProps/core.xml', xml);

  assert.equal(normalized.includes('2026-04-12T10:00:00Z'), false);
  assert.equal(normalized.includes('2026-04-12T11:00:00Z'), false);
  assert.equal(normalized.includes('<cp:revision>7</cp:revision>'), false);
  assert.equal(normalized.includes('NORMALIZED'), true);
});

test('normalizeDocxXml removes rsid attributes and settings rsid blocks', () => {
  const documentXml = '<w:p w:rsidR="00112233" w:rsidRDefault="44556677"><w:r/></w:p>';
  const settingsXml = '<w:settings><w:rsids><w:rsidRoot w:val="00000000"/></w:rsids><w:view w:val="print"/></w:settings>';

  assert.equal(normalizeDocxXml('word/document.xml', documentXml).includes('rsid'), false);
  const normalizedSettings = normalizeDocxXml('word/settings.xml', settingsXml);
  assert.equal(normalizedSettings.includes('w:rsidRoot'), false);
  assert.equal(normalizedSettings.includes('<w:rsids>NORMALIZED</w:rsids>'), true);
});

test('normalizeDocxXml leaves non-word XML untouched and normalizes windows-style paths', () => {
  const customXml = '<custom>keep-me</custom>';
  assert.equal(normalizeDocxXml('custom/item1.xml', customXml), customXml);

  const docXml = '<w:p w:rsidR="00112233"><w:r/></w:p>';
  assert.equal(normalizeDocxXml('word\\document.xml', docXml).includes('rsid'), false);
});

test('normalizeDocxXml strips image metadata noise from document.xml', () => {
  const docXml = '<wp:anchor wp14:anchorId="12345678" wp14:editId="ABCDEF12"><wp:docPr id="42" name="image-random" descr="Mermaid diagram 1"/><pic:cNvPr id="7" name="Picture 7" descr="random"/></wp:anchor>';
  const normalized = normalizeDocxXml('word/document.xml', docXml);

  assert.equal(normalized.includes('id="42"'), false);
  assert.equal(normalized.includes('name="image-random"'), false);
  assert.equal(normalized.includes('Picture 7'), false);
  assert.equal(normalized.includes('12345678'), false);
  assert.equal(normalized.includes('ABCDEF12'), false);
  assert.equal(normalized.includes('NORMALIZED'), true);
});

test('normalizeDocxXml strips paragraph-level w14 identifiers', () => {
  const docXml = '<w:p w14:paraId="1234ABCD" w14:textId="5678EFGH"><w:r><w:t>Hello</w:t></w:r></w:p>';
  const normalized = normalizeDocxXml('word/document.xml', docXml);

  assert.equal(normalized.includes('1234ABCD'), false);
  assert.equal(normalized.includes('5678EFGH'), false);
  assert.equal(normalized.includes('NORMALIZED'), true);
});

test('normalizeDocxXml canonicalizes Word hex color literals to lowercase', () => {
  const docXml = '<w:r><w:rPr><w:color w:val="FFAA00"/><w:shd w:val="CLEAR" w:fill="F0F0F0" w:color="AUTO"/></w:rPr></w:r>';
  const normalized = normalizeDocxXml('word/document.xml', docXml);

  assert.equal(normalized.includes('w:val="ffaa00"'), true);
  assert.equal(normalized.includes('w:fill="f0f0f0"'), true);
  assert.equal(normalized.includes('w:val="CLEAR"'), true);
  assert.equal(normalized.includes('w:color="AUTO"'), true);
});

test('compareDocxEntryMaps treats metadata-only differences as equal', async () => {
  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'docProps/core.xml': '<cp:coreProperties xmlns:cp="cp" xmlns:dcterms="dcterms" xmlns:xsi="xsi"><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created><cp:revision>1</cp:revision></cp:coreProperties>',
      'word/document.xml': '<w:document><w:p w:rsidR="1111"><w:r><w:t>Hello</w:t></w:r></w:p></w:document>',
    })),
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'docProps/core.xml': '<cp:coreProperties xmlns:cp="cp" xmlns:dcterms="dcterms" xmlns:xsi="xsi"><dcterms:created xsi:type="dcterms:W3CDTF">2027-02-02T00:00:00Z</dcterms:created><cp:revision>9</cp:revision></cp:coreProperties>',
      'word/document.xml': '<w:document><w:p w:rsidR="9999"><w:r><w:t>Hello</w:t></w:r></w:p></w:document>',
    })),
  ]);

  assert.deepEqual(compareDocxEntryMaps(leftEntries, rightEntries), []);
});

test('compareDocxEntryMaps reports semantic document differences', async () => {
  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'word/document.xml': '<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:document>',
    })),
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'word/document.xml': '<w:document><w:p><w:r><w:t>Goodbye</w:t></w:r></w:p></w:document>',
    })),
  ]);

  const differences = compareDocxEntryMaps(leftEntries, rightEntries);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].entryPath, 'word/document.xml');
  assert.equal(differences[0].reason, 'xml-diff');
});

test('compareDocxEntryMaps compares binary media by hash', async () => {
  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'word/media/image1.png': Buffer.from('left-image'),
    })),
    loadDocxEntriesFromBuffer(await buildZipBuffer({
      'word/media/image1.png': Buffer.from('right-image'),
    })),
  ]);

  const differences = compareDocxEntryMaps(leftEntries, rightEntries);
  assert.equal(differences.length >= 2, true);
  assert.equal(differences.every((difference) => difference.reason === 'missing-left' || difference.reason === 'missing-right'), true);
});

test('loadDocxEntriesFromBuffer normalizes image relationship IDs and media filenames by content', async () => {
  const leftDocx = await buildZipBuffer({
    'word/document.xml': '<w:document><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId7" Type="image" Target="media/image-a.png"/></Relationships>',
    'word/media/image-a.png': Buffer.from('same-image-bytes'),
  });
  const rightDocx = await buildZipBuffer({
    'word/document.xml': '<w:document><w:drawing><a:blip r:embed="rId99"/></w:drawing></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId99" Type="image" Target="media/image-z.png"/></Relationships>',
    'word/media/image-z.png': Buffer.from('same-image-bytes'),
  });

  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromBuffer(leftDocx),
    loadDocxEntriesFromBuffer(rightDocx),
  ]);

  assert.deepEqual(compareDocxEntryMaps(leftEntries, rightEntries), []);
});

test('loadDocxEntriesFromBuffer ignores Mermaid raster PNG byte drift while preserving embed structure', async () => {
  const leftDocx = await buildZipBuffer({
    'word/document.xml': '<w:document><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Mermaid 1"/><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Mermaid 1" descr="Mermaid diagram 1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId7" Type="image" Target="media/image-a.png"/></Relationships>',
    'word/media/image-a.png': Buffer.from('left-mermaid-raster'),
  });
  const rightDocx = await buildZipBuffer({
    'word/document.xml': '<w:document><w:p><w:r><w:drawing><wp:inline><wp:docPr id="9" name="Mermaid 9"/><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="9" name="Mermaid 9" descr="Mermaid diagram 1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId99"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId99" Type="image" Target="media/image-z.png"/></Relationships>',
    'word/media/image-z.png': Buffer.from('right-mermaid-raster'),
  });

  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromBuffer(leftDocx),
    loadDocxEntriesFromBuffer(rightDocx),
  ]);

  assert.deepEqual(compareDocxEntryMaps(leftEntries, rightEntries), []);
});

test('extractMermaidMediaEntries finds Mermaid media targets from current DOCX drawing shape', () => {
  const documentXml = `<w:document><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img" descr="${MERMAID_DOCX_DESCRIPTION_PREFIX}1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="2" name="img" descr="Regular image"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId8"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:document>`;
  const relationshipXml = '<Relationships><Relationship Id="rId7" Type="image" Target="media/mermaid-a.png"/><Relationship Id="rId8" Type="image" Target="media/regular.png"/></Relationships>';

  const result = extractMermaidMediaEntries(documentXml, relationshipXml);

  assert.deepEqual([...result.entries()], [['word/media/mermaid-a.png', { index: 1 }]]);
});

test('extractMermaidMediaEntries ignores non-matching description prefixes', () => {
  const documentXml = '<w:document><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img" descr="Diagram 1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:document>';
  const relationshipXml = '<Relationships><Relationship Id="rId7" Type="image" Target="media/mermaid-a.png"/></Relationships>';

  const result = extractMermaidMediaEntries(documentXml, relationshipXml);

  assert.deepEqual([...result.entries()], []);
});

test('buildRelationshipMap keeps stable occurrence ordering for repeated canonical targets', () => {
  const relXml = '<Relationships><Relationship Id="rId7" Type="image" Target="media/one.png"/><Relationship Id="rId8" Type="image" Target="media/two.png"/></Relationships>';
  const mediaInfo = {
    sourceToCanonical: new Map([
      ['media/one.png', { canonicalPath: 'media/mermaid-1.png' }],
      ['media/two.png', { canonicalPath: 'media/mermaid-1.png' }],
    ]),
  };

  const result = buildRelationshipMap(relXml, mediaInfo);

  assert.equal(result.get('rId7').canonicalTarget, 'media/mermaid-1.png');
  assert.equal(result.get('rId8').canonicalTarget, 'media/mermaid-1.png');
  assert.notEqual(result.get('rId7').canonicalId, result.get('rId8').canonicalId);
  assert.match(result.get('rId7').canonicalId, /-1$/);
  assert.match(result.get('rId8').canonicalId, /-2$/);
});

test('compareDocxEntryMaps still detects missing Mermaid raster count after placeholder canonicalization', async () => {
  const leftEntries = await loadDocxEntriesFromBuffer(await buildZipBuffer({
    'word/document.xml': '<w:document><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img" descr="Mermaid diagram 1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="2" name="img" descr="Mermaid diagram 2"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId8"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId7" Type="image" Target="media/one.png"/><Relationship Id="rId8" Type="image" Target="media/two.png"/></Relationships>',
    'word/media/one.png': Buffer.from('one'),
    'word/media/two.png': Buffer.from('two'),
  }));
  const rightEntries = await loadDocxEntriesFromBuffer(await buildZipBuffer({
    'word/document.xml': '<w:document><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img" descr="Mermaid diagram 1"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:document>',
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId7" Type="image" Target="media/one.png"/></Relationships>',
    'word/media/one.png': Buffer.from('one'),
  }));

  const differences = compareDocxEntryMaps(leftEntries, rightEntries);
  assert.equal(differences.some((difference) => difference.entryPath === 'word/document.xml' || difference.entryPath === 'word/media/mermaid-2.png'), true);
});

test('compareDocxEntryMaps reports missing-left, missing-right, and type mismatches', async () => {
  const leftEntries = new Map([
    ['word/document.xml', { type: 'xml', value: '<w:doc/>', hash: 'a' }],
    ['word/media/image1.png', { type: 'binary', hash: 'hash-a', size: 3 }],
    ['word/media/image2.png', { type: 'xml', value: '<x/>', hash: 'x' }],
  ]);
  const rightEntries = new Map([
    ['word/media/image1.png', { type: 'binary', hash: 'hash-a', size: 3 }],
    ['word/media/image2.png', { type: 'binary', hash: 'hash-b', size: 4 }],
    ['word/settings.xml', { type: 'xml', value: '<w:settings/>', hash: 'b' }],
  ]);

  const differences = compareDocxEntryMaps(leftEntries, rightEntries);
  assert.equal(differences.some((diff) => diff.reason === 'missing-right' && diff.entryPath === 'word/document.xml'), true);
  assert.equal(differences.some((diff) => diff.reason === 'missing-left' && diff.entryPath === 'word/settings.xml'), true);
  assert.equal(differences.some((diff) => diff.reason === 'type-mismatch' && diff.entryPath === 'word/media/image2.png'), true);
});

test('loadDocxEntriesFromBuffer preserves per-entry errors instead of aborting the whole comparison', async () => {
  const entries = await loadDocxEntriesFromBuffer(await buildZipBuffer({
    'word/media/bad.bin': Buffer.from([0xff, 0xfe, 0xfd]),
    'word/document.xml': '<w:document><w:p/></w:document>',
  }));

  assert.equal([...entries.values()].some((entry) => entry.type === 'binary'), true);
  assert.equal(entries.get('word/document.xml').type, 'xml');
});

test('loadDocxEntriesFromFile works on disk-backed DOCX inputs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-test-'));
  const docxPath = path.join(tempDir, 'sample.docx');

  try {
    await fs.writeFile(docxPath, await buildZipBuffer({
      'word/document.xml': '<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:document>',
    }));

    const entries = await loadDocxEntriesFromFile(docxPath);
    assert.equal(entries.get('word/document.xml').type, 'xml');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('formatDifferences includes useful detail for mixed diff reasons', () => {
  const output = formatDifferences([
    { entryPath: 'word/document.xml', reason: 'xml-diff', leftHash: 'aaa', rightHash: 'bbb' },
    { entryPath: 'word/media/image1.png', reason: 'binary-diff', leftHash: 'ccc', rightHash: 'ddd', leftSize: 10, rightSize: 12 },
    { entryPath: 'word/settings.xml', reason: 'missing-left' },
    { entryPath: 'word/media/image2.png', reason: 'type-mismatch', leftType: 'xml', rightType: 'binary' },
  ], 'left.docx', 'right.docx');

  assert.equal(output.includes('xml-diff (aaa vs bbb)'), true);
  assert.equal(output.includes('binary-diff (ccc/10 bytes vs ddd/12 bytes)'), true);
  assert.equal(output.includes('missing-left'), true);
  assert.equal(output.includes('type-mismatch (xml vs binary)'), true);
});