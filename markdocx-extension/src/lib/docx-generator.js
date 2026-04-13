import { buildHtmlDocument, generateDocx as generateDocxBytes } from '@markdocx/core';

function bytesToBase64(bytes) {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 1) {
		binary += String.fromCharCode(bytes[index]);
	}
	return btoa(binary);
}

export { buildHtmlDocument };

export async function generateDocx(...args) {
	const bytes = await generateDocxBytes(...args);
	return bytesToBase64(bytes);
}
