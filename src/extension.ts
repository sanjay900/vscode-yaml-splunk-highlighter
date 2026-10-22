import { execFile } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import {
	commands,
	ExtensionContext,
	languages,
	TextDocumentContentProvider,
	Uri,
	ViewColumn,
	window,
	workspace
} from 'vscode';
import {
	CodelensProvider,
	previewEvalCommand,
	previewEvalTestCommand,
	previewFullSearchCommand,
	previewSigmaEvalCommand,
	previewSigmaFullSearchCommand
} from './CodelensProvider';

const previewScheme = 'splunk-consolidation-eval';

class EvalPreviewContentProvider implements TextDocumentContentProvider {
	private readonly contents = new Map<string, string>();
	private nextId = 0;

	public provideTextDocumentContent(uri: Uri): string {
		const content = this.contents.get(uri.toString());
		if (content === undefined) {
			throw new Error(`No generated eval is available for ${uri.toString()}`);
		}
		return content;
	}

	public createDocument(sourceUri: Uri, content: string, suffix: string): Uri {
		const previewUri = Uri.from({
			scheme: previewScheme,
			path: `/${path.basename(sourceUri.fsPath)}.${suffix}.spl`,
			query: String(this.nextId++)
		});
		this.contents.set(previewUri.toString(), content);
		return previewUri;
	}

	public deleteDocument(uri: Uri): void {
		this.contents.delete(uri.toString());
	}
}

function findPreviewScript(sourcePath: string, scriptName: string): { root: string; script: string } | undefined {
	let directory = path.dirname(sourcePath);
	while (true) {
		const script = path.join(directory, 'utils', scriptName);
		if (existsSync(script)) {
			return { root: directory, script };
		}

		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}
		directory = parent;
	}
}

function runPreview(
	pythonPath: string,
	script: string,
	sourcePath: string,
	cwd: string,
	args: string[]
): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			pythonPath,
			[script, sourcePath, ...args],
			{ cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error((stderr || error.message).trim()));
					return;
				}
				const output = stdout.trim();
				if (!output) {
					reject(new Error('The eval preview helper returned no output.'));
					return;
				}
				resolve(output);
			}
		);
	});
}

function isWithinDirectory(filePath: string, directory: string): boolean {
	const relativePath = path.relative(directory, filePath);
	return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function activate(context: ExtensionContext): void {
	const codelensProvider = new CodelensProvider();
	const previewProvider = new EvalPreviewContentProvider();
	const showPreview = async (
		sourceUri: Uri,
		kind: 'eval' | 'full-spl' | 'eval-test' | 'sigma-eval' | 'sigma-full-spl'
	): Promise<void> => {
		const isSigma = kind.startsWith('sigma-');
		const fullSearch = kind.endsWith('full-spl');
		const testEval = kind === 'eval-test';
		const preview = findPreviewScript(
			sourceUri.fsPath,
			isSigma ? 'preview_sigma_search.py' : 'preview_consolidation_eval.py'
		);
		if (!preview) {
			await window.showErrorMessage(`Could not find the ${isSigma ? 'Sigma' : 'consolidation'} SPL preview helper in this project.`);
			return;
		}

		const hasUnsavedYaml = workspace.textDocuments.some(document =>
			document.isDirty &&
			document.languageId === 'yaml' &&
			document.uri.scheme === 'file' &&
			isWithinDirectory(document.uri.fsPath, preview.root)
		);
		if (hasUnsavedYaml) {
			await window.showWarningMessage('Save the YAML files in this project before previewing the generated SPL.');
			return;
		}

		const configuredPythonPath = workspace.getConfiguration('vscode-yaml-splunk-highlighter').get<string>('pythonPath', '').trim();
		const configuration = workspace.getConfiguration('vscode-yaml-splunk-highlighter');
		const packageName = configuration.get<string>('searchPackage', 'CSA_Package').trim();
		const sigmaBackendMode = configuration.get<string>('sigmaBackendMode', 'raw').trim();
		const localPythonPaths = process.platform === 'win32'
			? [path.join(preview.root, '.venv', 'Scripts', 'python.exe'), path.join(preview.root, 'venv', 'Scripts', 'python.exe')]
			: [path.join(preview.root, '.venv', 'bin', 'python'), path.join(preview.root, 'venv', 'bin', 'python')];
		const pythonPath = configuredPythonPath || localPythonPaths.find(existsSync) || 'python3';
		const args = isSigma
			? ['--mode', fullSearch ? 'full' : 'eval', '--backend-mode', sigmaBackendMode]
			: (fullSearch || testEval ? [testEval ? '--test-eval' : '--full-search', '--package', packageName] : []);
		try {
			const content = await runPreview(
				pythonPath,
				preview.script,
				sourceUri.fsPath,
				preview.root,
				args
			);
			const previewUri = previewProvider.createDocument(
				sourceUri,
				content,
				`${isSigma ? 'sigma-' : ''}${testEval ? 'eval-test' : fullSearch ? 'full-search' : 'generated-eval'}`
			);
			const document = await workspace.openTextDocument(previewUri);
			if ((await languages.getLanguages()).includes('splunk_search')) {
				await languages.setTextDocumentLanguage(document, 'splunk_search');
			}
			await window.showTextDocument(document, { preview: false, viewColumn: ViewColumn.Beside });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await window.showErrorMessage(`Could not generate ${testEval ? 'eval test SPL' : fullSearch ? 'full SPL' : 'generated eval'}: ${message}`);
		}
	};

	context.subscriptions.push(
		languages.registerCodeLensProvider({ language: 'yaml' }, codelensProvider),
		workspace.registerTextDocumentContentProvider(previewScheme, previewProvider),
		workspace.onDidCloseTextDocument(document => previewProvider.deleteDocument(document.uri)),
		commands.registerCommand(previewEvalCommand, (sourceUri: Uri) => showPreview(sourceUri, 'eval')),
		commands.registerCommand(previewFullSearchCommand, (sourceUri: Uri) => showPreview(sourceUri, 'full-spl')),
		commands.registerCommand(previewEvalTestCommand, (sourceUri: Uri) => showPreview(sourceUri, 'eval-test')),
		commands.registerCommand(previewSigmaEvalCommand, (sourceUri: Uri) => showPreview(sourceUri, 'sigma-eval')),
		commands.registerCommand(previewSigmaFullSearchCommand, (sourceUri: Uri) => showPreview(sourceUri, 'sigma-full-spl'))
	);
}
