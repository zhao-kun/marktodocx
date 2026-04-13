import { convertMarkdownFileInNode } from './packages/runtime-node/src/index.js';

async function run() {
  try {
    const result = await convertMarkdownFileInNode({
      inputPath: './test-markdown/llm_capacity.md',
      outputPath: './test-markdown/llm_capacity.docx'
    });
    console.log('Conversion successful:', result.outputPath);
  } catch (error) {
    console.error('Conversion failed:', error);
    process.exit(1);
  }
}

run();
