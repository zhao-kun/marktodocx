import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import JSZip from 'jszip';
import { MERMAID_DOCX_DESCRIPTION_PREFIX } from '@markdocx/core';

const XML_ENTRY_PATTERN = /\.(xml|rels)$/i;
const RSID_ATTRIBUTE_PATTERN = /\s+w:rsid[^=]*="[^"]*"/g;
const SETTINGS_RSIDS_PATTERN = /<w:rsids>[\s\S]*?<\/w:rsids>/g;
const RELATIONSHIP_PATTERN = /<Relationship\b([^>]*?)\bId="([^"]+)"([^>]*?)\bTarget="([^"]+)"([^>]*?)\/?>(?:<\/Relationship>)?/g;
const WORD_HEX_COLOR_PATTERN = /(<w:(?:color|shd)\b[^>]*\bw:(?:val|fill|color)=")([0-9A-Fa-f]{3,8})(")/g;
const MERMAID_DRAWING_PATTERN = /<w:drawing\b[\s\S]*?<pic:cNvPr\b[^>]*\bdescr="([^"]*)"[^>]*\/?>[\s\S]*?<a:blip\b[^>]*\br:embed="([^"]+)"/g;
const MERMAID_RASTER_HASH = 'MERMAID_RASTER_PLACEHOLDER';

function normalizeCoreXml(xml) {
  return xml
    .replace(/<dcterms:created[^>]*>[\s\S]*?<\/dcterms:created>/g, '<dcterms:created xsi:type="dcterms:W3CDTF">NORMALIZED</dcterms:created>')
    .replace(/<dcterms:modified[^>]*>[\s\S]*?<\/dcterms:modified>/g, '<dcterms:modified xsi:type="dcterms:W3CDTF">NORMALIZED</dcterms:modified>')
    .replace(/<cp:revision>[^<]*<\/cp:revision>/g, '<cp:revision>NORMALIZED</cp:revision>');
}

function normalizeWordXml(xml) {
  return xml
    .replace(RSID_ATTRIBUTE_PATTERN, '')
    .replace(/\s+w14:paraId="[^"]*"/g, ' w14:paraId="NORMALIZED"')
    .replace(/\s+w14:textId="[^"]*"/g, ' w14:textId="NORMALIZED"')
    .replace(/\s+wp14:anchorId="[^"]*"/g, ' wp14:anchorId="NORMALIZED"')
    .replace(/\s+wp14:editId="[^"]*"/g, ' wp14:editId="NORMALIZED"')
    .replace(/(<wp:docPr\b[^>]*\bid=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(/(<wp:docPr\b[^>]*\bname=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(/(<wp:docPr\b[^>]*\bdescr=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(/(<pic:cNvPr\b[^>]*\bid=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(/(<pic:cNvPr\b[^>]*\bname=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(/(<pic:cNvPr\b[^>]*\bdescr=")([^"]+)(")/g, '$1NORMALIZED$3')
    .replace(WORD_HEX_COLOR_PATTERN, (_, prefix, value, suffix) => `${prefix}${value.toLowerCase()}${suffix}`);
}

function normalizeSettingsXml(xml) {
  return normalizeWordXml(xml).replace(SETTINGS_RSIDS_PATTERN, '<w:rsids>NORMALIZED</w:rsids>');
}

export function normalizeDocxXml(entryPath, xml) {
  const normalizedPath = entryPath.replace(/\\/g, '/');

  if (normalizedPath === 'docProps/core.xml') {
    return normalizeCoreXml(xml);
  }

  if (normalizedPath === 'word/settings.xml') {
    return normalizeSettingsXml(xml);
  }

  if (normalizedPath.startsWith('word/')) {
    return normalizeWordXml(xml);
  }

  return xml;
}

export async function loadDocxEntriesFromBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = new Map();
  const xmlEntries = new Map();
  const binaryEntries = new Map();

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }

    try {
      if (XML_ENTRY_PATTERN.test(entryPath)) {
        xmlEntries.set(entryPath, await entry.async('string'));
        continue;
      }

      binaryEntries.set(entryPath, await entry.async('nodebuffer'));
    } catch (error) {
      entries.set(entryPath, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const mermaidMediaEntries = extractMermaidMediaEntries(
    xmlEntries.get('word/document.xml') || '',
    xmlEntries.get('word/_rels/document.xml.rels') || ''
  );
  const mediaInfo = buildMediaInfo(binaryEntries, mermaidMediaEntries);
  const relationshipMap = buildRelationshipMap(xmlEntries.get('word/_rels/document.xml.rels') || '', mediaInfo);

  for (const [entryPath, xml] of xmlEntries) {
    const normalized = normalizeDocxXml(entryPath, applyRelationshipNormalization(entryPath, xml, relationshipMap));
    entries.set(entryPath, {
      type: 'xml',
      value: normalized,
      hash: sha256(normalized),
    });
  }

  for (const [entryPath, info] of mediaInfo.canonicalEntries) {
    entries.set(entryPath, {
      type: 'binary',
      hash: info.hash,
      size: info.size,
    });
  }

  for (const [entryPath, binaryBuffer] of binaryEntries) {
    if (entryPath.startsWith('word/media/')) {
      continue;
    }

    entries.set(entryPath, {
      type: 'binary',
      hash: sha256(binaryBuffer),
      size: binaryBuffer.length,
    });
  }

  return entries;
}

function buildMediaInfo(binaryEntries, mermaidMediaEntries = new Map()) {
  const canonicalEntries = new Map();
  const sourceToCanonical = new Map();
  const hashCounts = new Map();

  for (const [entryPath, binaryBuffer] of [...binaryEntries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (!entryPath.startsWith('word/media/')) {
      continue;
    }

    const ext = path.extname(entryPath).toLowerCase();
    const mermaidEntry = mermaidMediaEntries.get(entryPath.replace(/\\/g, '/'));
    if (mermaidEntry) {
      const canonicalPath = `word/media/mermaid-${mermaidEntry.index}${ext}`;

      canonicalEntries.set(canonicalPath, {
        hash: MERMAID_RASTER_HASH,
        size: 0,
        ext,
      });
      sourceToCanonical.set(entryPath.replace(/^word\//, ''), {
        canonicalPath: canonicalPath.replace(/^word\//, ''),
        hash: MERMAID_RASTER_HASH,
        ext,
        occurrence: mermaidEntry.index,
      });
      continue;
    }

    const hash = sha256(binaryBuffer);
    const occurrence = (hashCounts.get(hash) || 0) + 1;
    hashCounts.set(hash, occurrence);
    const canonicalPath = `word/media/${hash}-${occurrence}${ext}`;

    canonicalEntries.set(canonicalPath, {
      hash,
      size: binaryBuffer.length,
      ext,
    });
    sourceToCanonical.set(entryPath.replace(/^word\//, ''), {
      canonicalPath: canonicalPath.replace(/^word\//, ''),
      hash,
      ext,
      occurrence,
    });
  }

  return { canonicalEntries, sourceToCanonical };
}

export function extractMermaidMediaEntries(documentXml, relationshipXml) {
  const relationshipTargets = new Map();
  const mermaidMediaEntries = new Map();

  RELATIONSHIP_PATTERN.lastIndex = 0;
  let relationshipMatch;
  while ((relationshipMatch = RELATIONSHIP_PATTERN.exec(relationshipXml)) !== null) {
    relationshipTargets.set(
      relationshipMatch[2],
      relationshipMatch[4].replace(/^\.\//, '').replace(/\\/g, '/').replace(/^word\//, '')
    );
  }

  MERMAID_DRAWING_PATTERN.lastIndex = 0;
  let drawingMatch;
  let mermaidIndex = 0;
  while ((drawingMatch = MERMAID_DRAWING_PATTERN.exec(documentXml)) !== null) {
    const description = drawingMatch[1];
    const relationshipId = drawingMatch[2];
    if (!new RegExp(`^${MERMAID_DOCX_DESCRIPTION_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(description)) {
      continue;
    }

    const target = relationshipTargets.get(relationshipId);
    if (!target) {
      continue;
    }

    mermaidIndex += 1;
    mermaidMediaEntries.set(`word/${target}`.replace(/\/+/g, '/'), { index: mermaidIndex });
  }

  return mermaidMediaEntries;
}

export function buildRelationshipMap(relXml, mediaInfo) {
  const relationCounts = new Map();
  const relationshipMap = new Map();
  RELATIONSHIP_PATTERN.lastIndex = 0;
  let match;

  while ((match = RELATIONSHIP_PATTERN.exec(relXml)) !== null) {
    const relationId = match[2];
    const beforeId = match[1];
    const betweenIdAndTarget = match[3];
    const afterTarget = match[5];
    const target = match[4].replace(/^\.\//, '').replace(/\\/g, '/');
    const typeMatch = `${beforeId} ${betweenIdAndTarget} ${afterTarget}`.match(/\bType="([^"]+)"/);
    const relationType = typeMatch ? typeMatch[1] : 'unknown';
    const media = mediaInfo.sourceToCanonical.get(`word/${target}`.replace(/^word\/word\//, 'word/').replace(/^word\//, ''))
      || mediaInfo.sourceToCanonical.get(target);
    const canonicalTarget = media ? media.canonicalPath : target;
    const countKey = `${relationType}:${canonicalTarget}`;
    const occurrence = (relationCounts.get(countKey) || 0) + 1;
    relationCounts.set(countKey, occurrence);
    const canonicalIdBase = sha256(`${relationType}|${canonicalTarget}`).slice(0, 16);
    relationshipMap.set(relationId, {
      canonicalId: `rel-${canonicalIdBase}-${occurrence}`,
      canonicalTarget,
      relationType,
    });
  }

  return relationshipMap;
}

function applyRelationshipNormalization(entryPath, xml, relationshipMap) {
  if (relationshipMap.size === 0) {
    return xml;
  }

  if (entryPath === 'word/_rels/document.xml.rels') {
    RELATIONSHIP_PATTERN.lastIndex = 0;
    const openTagMatch = xml.match(/^<Relationships[^>]*>/);
    const closeTagMatch = xml.match(/<\/Relationships>\s*$/);
    const openTag = openTagMatch ? openTagMatch[0] : '<Relationships>';
    const closeTag = closeTagMatch ? closeTagMatch[0] : '</Relationships>';
    const normalizedRelationships = [];

    let match;
    while ((match = RELATIONSHIP_PATTERN.exec(xml)) !== null) {
      const mapping = relationshipMap.get(match[2]);
      if (!mapping) {
        normalizedRelationships.push(match[0]);
        continue;
      }

      normalizedRelationships.push(
        `<Relationship${match[1]}Id="${mapping.canonicalId}"${match[3]}Target="${mapping.canonicalTarget}"${match[5]}/>`
      );
    }

    normalizedRelationships.sort((left, right) => left.localeCompare(right));
    return `${openTag}${normalizedRelationships.join('')}${closeTag}`;
  }

  let normalized = xml;
  for (const [relationId, mapping] of relationshipMap.entries()) {
    normalized = normalized
      .replaceAll(`r:embed="${relationId}"`, `r:embed="${mapping.canonicalId}"`)
      .replaceAll(`r:id="${relationId}"`, `r:id="${mapping.canonicalId}"`);
  }
  return normalized;
}

export async function loadDocxEntriesFromFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return loadDocxEntriesFromBuffer(buffer);
}

function sha256(value) {
  const hash = crypto.createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}

export function compareDocxEntryMaps(leftEntries, rightEntries) {
  const differences = [];
  const allPaths = new Set([...leftEntries.keys(), ...rightEntries.keys()]);

  for (const entryPath of [...allPaths].sort()) {
    const left = leftEntries.get(entryPath);
    const right = rightEntries.get(entryPath);

    if (!left) {
      differences.push({ entryPath, reason: 'missing-left' });
      continue;
    }

    if (!right) {
      differences.push({ entryPath, reason: 'missing-right' });
      continue;
    }

    if (left.type !== right.type) {
      differences.push({ entryPath, reason: 'type-mismatch', leftType: left.type, rightType: right.type });
      continue;
    }

    if (left.type === 'error' || right.type === 'error') {
      differences.push({
        entryPath,
        reason: 'entry-error',
        leftMessage: left.message,
        rightMessage: right.message,
      });
      continue;
    }

    if (left.type === 'xml' && left.value !== right.value) {
      differences.push({
        entryPath,
        reason: 'xml-diff',
        leftHash: left.hash,
        rightHash: right.hash,
      });
      continue;
    }

    if (left.type === 'binary' && (left.hash !== right.hash || left.size !== right.size)) {
      differences.push({
        entryPath,
        reason: 'binary-diff',
        leftHash: left.hash,
        rightHash: right.hash,
        leftSize: left.size,
        rightSize: right.size,
      });
    }
  }

  return differences;
}

export async function compareDocxFiles(leftPath, rightPath) {
  const [leftEntries, rightEntries] = await Promise.all([
    loadDocxEntriesFromFile(leftPath),
    loadDocxEntriesFromFile(rightPath),
  ]);

  return compareDocxEntryMaps(leftEntries, rightEntries);
}

export function formatDifferences(differences, leftLabel, rightLabel) {
  if (differences.length === 0) {
    return `${leftLabel} matches ${rightLabel} after normalization.`;
  }

  return [
    `${leftLabel} does not match ${rightLabel} after normalization:`,
    ...differences.map((difference) => {
      if (difference.reason === 'xml-diff') {
        return `- ${difference.entryPath}: xml-diff (${difference.leftHash} vs ${difference.rightHash})`;
      }
      if (difference.reason === 'binary-diff') {
        return `- ${difference.entryPath}: binary-diff (${difference.leftHash}/${difference.leftSize} bytes vs ${difference.rightHash}/${difference.rightSize} bytes)`;
      }
      if (difference.reason === 'type-mismatch') {
        return `- ${difference.entryPath}: type-mismatch (${difference.leftType} vs ${difference.rightType})`;
      }
      if (difference.reason === 'entry-error') {
        return `- ${difference.entryPath}: entry-error (${difference.leftMessage || 'ok'} vs ${difference.rightMessage || 'ok'})`;
      }
      return `- ${difference.entryPath}: ${difference.reason}`;
    }),
  ].join('\n');
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveFromRepoRoot(...parts) {
  return path.resolve(process.cwd(), ...parts);
}