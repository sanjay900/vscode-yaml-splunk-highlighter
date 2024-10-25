import * as vscode from 'vscode';

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

	private codeLenses: vscode.CodeLens[] = [];
	private regex: RegExp;
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor() {
		this.regex = /search: >/g;

		vscode.workspace.onDidChangeConfiguration((_) => {
			this._onDidChangeCodeLenses.fire();
		});
		if (vscode.workspace.workspaceFolders) {
			console.log(vscode.workspace.workspaceFolders[0])
		}
	}

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
		this.codeLenses = [];
		const regex = new RegExp(this.regex);
		const text = document.getText();
		let matches;
		while ((matches = regex.exec(text)) !== null) {
			const line = document.lineAt(document.positionAt(matches.index).line);
			this.codeLenses.push(new vscode.CodeLens(line.range));
		}
		return this.codeLenses;
	}

	public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
		codeLens.command = {
			title: "Run on splunk instance",
			tooltip: "Tooltip provided by sample extension",
			command: "vscode-yaml-splunk-highlighter.codelensAction",
			arguments: ["Argument 1", false]
		};
		return codeLens;
	}
}

