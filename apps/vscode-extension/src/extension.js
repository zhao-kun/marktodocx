const vscode = require('vscode');

const { convertMarkdownToDocx } = require('./convert');
const { MarkdocxWebviewHost } = require('./webview-host');

function activate(context) {
  const webviewHost = new MarkdocxWebviewHost(context);
  context.subscriptions.push(webviewHost);

  context.subscriptions.push(
    vscode.commands.registerCommand('markdocx.convertToDocx', async (resourceUri) => {
      await convertMarkdownToDocx({
        context,
        resourceUri,
        vscodeApi: vscode,
        webviewHost,
      });
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};