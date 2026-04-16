const vscode = require('vscode');

const { convertMarkdownToDocx } = require('./convert');
const { MarktodocxWebviewHost } = require('./webview-host');

function activate(context) {
  const webviewHost = new MarktodocxWebviewHost(context);
  context.subscriptions.push(webviewHost);

  context.subscriptions.push(
    vscode.commands.registerCommand('marktodocx.convertToDocx', async (resourceUri) => {
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