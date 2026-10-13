# VSCode Splunk highlighter for yaml files and js files

Highlights inline `search:` and `definition:` values, and folded or literal YAML blocks starting with those keys, using the `arcsector.vscode-splunk-search-syntax` extension.

```yaml
search: Processes.parent_process_name=msiexec.exe Processes.process_name=windbg.exe
```

YAML searches show a **Show full SPL** CodeLens below the search. Select it to open the generated `search` value from the saved-search configuration in a read-only SPL preview, including generated evals and finalization macros without conf escaping. Consolidated child searches preview their scheduled parent search; consolidation parents include all their children. Consolidated searches also show **Show generated eval**. Both use the project's `utils/preview_consolidation_eval.py` helper and require its Python dependencies. The extension prefers a project `.venv`/`venv`; configure `vscode-yaml-splunk-highlighter.pythonPath` to override the interpreter and `vscode-yaml-splunk-highlighter.searchPackage` to choose the package variant (default `CSA_Package`).

Highlights any spl templated code blocks
```js
spl`
| test
`
```

Make sure you are NOT using the `Dark (Visual Studio)` theme
