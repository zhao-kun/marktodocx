import { inlineLocalImages } from '@markdocx/core';

import { createBrowserRuntime } from './dom-native.js';

export function inlineImagesFromMap(html, imageMap = {}, mdRelativeDir = '', runtime = createBrowserRuntime()) {
  return inlineLocalImages(html, imageMap, mdRelativeDir, runtime);
}
