import fs from 'node:fs/promises';
import path from 'node:path';

import { normalizeStyleOptions } from '@marktodocx/core/style-options';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, overlay) {
  if (!isPlainObject(base)) {
    return clone(isPlainObject(overlay) ? overlay : {});
  }

  const result = clone(base);
  if (!isPlainObject(overlay)) {
    return result;
  }

  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }

  return result;
}

function setDeepValue(target, dottedPath, value) {
  const keys = dottedPath.split('.').map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0) {
    throw new TypeError('Style assignment path must not be empty');
  }

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!isPlainObject(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[keys.at(-1)] = value;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }
  return trimmed;
}

function toStyleOptionsShape(value) {
  if (!isPlainObject(value)) {
    throw new TypeError('style JSON must evaluate to an object');
  }

  if (Object.hasOwn(value, 'preset') || Object.hasOwn(value, 'overrides')) {
    return value;
  }

  return { overrides: value };
}

export function parseStyleAssignments(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return {};
  }

  const overrides = {};
  for (const segment of input.split(';')) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) {
      continue;
    }

    const equalsIndex = trimmedSegment.indexOf('=');
    if (equalsIndex <= 0) {
      throw new TypeError(`Invalid style assignment: ${trimmedSegment}`);
    }

    const dottedPath = trimmedSegment.slice(0, equalsIndex).trim();
    const rawValue = trimmedSegment.slice(equalsIndex + 1);
    if (!dottedPath) {
      throw new TypeError(`Invalid style assignment path: ${trimmedSegment}`);
    }

    setDeepValue(overrides, dottedPath, parseScalar(rawValue));
  }

  return overrides;
}

export async function parseStyleJsonInput(input, { cwd = process.cwd() } = {}) {
  if (typeof input !== 'string' || input.trim() === '') {
    return {};
  }

  const trimmed = input.trim();
  const source = trimmed.startsWith('{')
    ? trimmed
    : await fs.readFile(path.resolve(cwd, trimmed), 'utf8');

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse style JSON: ${message}`);
  }

  return toStyleOptionsShape(parsed);
}

export function applyMarginPreset(styleOptions, marginPreset) {
  if (typeof marginPreset !== 'string' || marginPreset.trim() === '') {
    return styleOptions;
  }

  return mergeDeep(styleOptions, {
    overrides: {
      page: {
        marginPreset: marginPreset.trim(),
      },
    },
  });
}

export async function resolveNodeStyleOptions({
  cwd = process.cwd(),
  env = process.env,
  stylePreset,
  marginPreset,
  styleJson,
  styleSet = [],
} = {}) {
  let styleOptions = {};

  const envStylePreset = env.MARKTODOCX_STYLE_PRESET;
  const envStyleJson = env.MARKTODOCX_STYLE_JSON;
  const envMarginPreset = env.MARKTODOCX_MARGIN_PRESET;
  const envStyleSet = env.MARKTODOCX_STYLE_SET;

  if (typeof envStylePreset === 'string' && envStylePreset.trim() !== '') {
    styleOptions = mergeDeep(styleOptions, { preset: envStylePreset.trim() });
  }

  if (typeof envStyleJson === 'string' && envStyleJson.trim() !== '') {
    styleOptions = mergeDeep(styleOptions, await parseStyleJsonInput(envStyleJson, { cwd }));
  }

  styleOptions = applyMarginPreset(styleOptions, envMarginPreset);

  if (typeof envStyleSet === 'string' && envStyleSet.trim() !== '') {
    styleOptions = mergeDeep(styleOptions, { overrides: parseStyleAssignments(envStyleSet) });
  }

  if (typeof stylePreset === 'string' && stylePreset.trim() !== '') {
    styleOptions = mergeDeep(styleOptions, { preset: stylePreset.trim() });
  }

  if (typeof styleJson === 'string' && styleJson.trim() !== '') {
    styleOptions = mergeDeep(styleOptions, await parseStyleJsonInput(styleJson, { cwd }));
  }

  styleOptions = applyMarginPreset(styleOptions, marginPreset);

  for (const assignmentGroup of styleSet) {
    styleOptions = mergeDeep(styleOptions, { overrides: parseStyleAssignments(assignmentGroup) });
  }

  return normalizeStyleOptions(styleOptions);
}