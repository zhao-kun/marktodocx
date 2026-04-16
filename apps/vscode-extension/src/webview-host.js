const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

function bytesFromBase64(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function createNonce() {
  return crypto.randomBytes(16).toString('base64');
}

class MarktodocxWebviewHost {
  constructor(context) {
    this.context = context;
    this.panel = undefined;
    this.readyPromise = undefined;
    this.resolveReady = undefined;
    this.pendingConversions = new Map();
    this.sequence = 0;
  }

  dispose() {
    this.rejectPendingConversions(new Error('marktodocx webview host was disposed.'));
    this.panel?.dispose();
    this.panel = undefined;
  }

  rejectPendingConversions(error) {
    for (const pending of this.pendingConversions.values()) {
      pending.reject(error);
    }
    this.pendingConversions.clear();
  }

  async convert({ markdown, imageMap, mdRelativeDir, styleOptions, onProgress }) {
    const panel = await this.ensurePanel();

    // VS Code does not allow posting messages to hidden webviews, even with
    // retainContextWhenHidden enabled, so we must reveal the retained panel
    // before each conversion request.
    panel.reveal(panel.viewColumn || vscode.ViewColumn.Beside, true);
    await this.readyPromise;

    const conversionId = `marktodocx-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pendingConversions.set(conversionId, {
        resolve,
        reject,
        onProgress,
      });

      const posted = panel.webview.postMessage({
        type: 'CONVERT',
        conversionId,
        markdown,
        imageMap,
        mdRelativeDir,
        styleOptions,
      });

      if (!posted) {
        this.pendingConversions.delete(conversionId);
        reject(new Error('Unable to send a conversion request to the VS Code webview host.'));
      }
    });
  }

  async ensurePanel() {
    if (this.panel) {
      return this.panel;
    }

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.panel = vscode.window.createWebviewPanel(
      'marktodocx.runtimeHost',
      'marktodocx Runtime',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      }
    );

    this.panel.onDidDispose(() => {
      this.rejectPendingConversions(new Error('marktodocx webview host was closed during conversion.'));
      this.panel = undefined;
      this.readyPromise = undefined;
      this.resolveReady = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'READY') {
        this.resolveReady?.();
        return;
      }

      const pending = this.pendingConversions.get(message?.conversionId);
      if (!pending) {
        return;
      }

      if (message.type === 'PROGRESS') {
        pending.onProgress?.(message.text);
        return;
      }

      if (message.type === 'CONVERT_RESULT') {
        this.pendingConversions.delete(message.conversionId);
        if (message.success) {
          pending.resolve(bytesFromBase64(message.data));
        } else {
          pending.reject(new Error(message.error || 'VS Code webview conversion failed.'));
        }
      }
    });

    this.panel.webview.html = await this.getWebviewHtml(this.panel.webview);
    return this.panel;
  }

  async getWebviewHtml(webview) {
    const scriptUri = await this.resolveWebviewScriptUri(webview);
    const nonce = createNonce();

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      `  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">`,
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '  <title>marktodocx Runtime</title>',
      '</head>',
      '<body>',
      `  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  async resolveWebviewScriptUri(webview) {
    const manifestPath = path.join(this.context.extensionPath, 'dist', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const entry = manifest['webview/index.js'] || Object.values(manifest).find((item) => item.isEntry);

    if (!entry?.file) {
      throw new Error('VS Code webview bundle not found. Run npm run build:vscode-extension before using the extension.');
    }

    return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', entry.file));
  }
}

module.exports = {
  MarktodocxWebviewHost,
};