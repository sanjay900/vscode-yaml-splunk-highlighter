import * as vscode from 'vscode';

export const previewEvalCommand = 'vscode-yaml-splunk-highlighter.previewConsolidationEval';
export const previewFullSearchCommand = 'vscode-yaml-splunk-highlighter.previewFullSearch';

export class CodelensProvider implements vscode.CodeLensProvider {
	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (document.languageId !== 'yaml') {
			return [];
		}

		const lines = document.getText().split(/\r?\n/);
		const searchLine = lines.findIndex(line => /^search\s*:/.test(line));
		if (searchLine < 0) {
			return [];
		}

		const lensLine = this.getLensLine(lines, searchLine);
		const position = new vscode.Position(lensLine, 0);
		const range = new vscode.Range(position, position);
		const codeLenses = [new vscode.CodeLens(range)];
		codeLenses[0].command = {
			title: 'Show full SPL',
			command: previewFullSearchCommand,
			arguments: [document.uri]
		};

		const consolidationLine = lines.find(line => /^consolidation\s*:/.test(line));
		const consolidationValue = consolidationLine?.replace(/^consolidation\s*:\s*/, '').trim().toLowerCase();
		if (consolidationValue && !['false', 'null', '[]'].includes(consolidationValue)) {
			const evalCodeLens = new vscode.CodeLens(range);
			evalCodeLens.command = {
				title: 'Show generated eval',
				command: previewEvalCommand,
				arguments: [document.uri]
			};
			codeLenses.push(evalCodeLens);
		}
		return codeLenses;
	}

	private getLensLine(lines: string[], searchLine: number): number {
		for (let line = searchLine + 1; line < lines.length; line++) {
			if (/^[A-Za-z_][\w.-]*\s*:/.test(lines[line])) {
				return line;
			}
		}
		return lines.length - 1;
	}
}
