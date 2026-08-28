import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const provider = new CodeLearnerViewProvider(context.extensionUri);

    // Register provider using the updated view ID matching package.json
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CodeLearnerViewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // 1. Explain Selected Code
    const explainCodeCommand = vscode.commands.registerCommand(
        'code-learner.explainCode',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('Open a code file to start learning!');
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText.trim()) {
                vscode.window.showInformationMessage('Please highlight some code first!');
                return;
            }

            const languageId = editor.document.languageId;
            await provider.handleExplainCode(selectedText, languageId);
        }
    );

    // 2. Generate File Conceptual Model
    const generateModelCommand = vscode.commands.registerCommand(
        'code-learner.generateConceptualModel',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('Open a code file to generate a model!');
                return;
            }

            const fullText = editor.document.getText();
            if (!fullText.trim()) {
                vscode.window.showInformationMessage('The active file is empty.');
                return;
            }

            const languageId = editor.document.languageId;
            await provider.handleGenerateConceptualModel(fullText, languageId);
        }
    );

    // 3. Add Quick Inline Note
    const addQuickCommentCommand = vscode.commands.registerCommand(
        'code-learner.addQuickComment',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText.trim()) {
                vscode.window.showInformationMessage('Highlight code to generate an explanatory note.');
                return;
            }

            const comment = await provider.generateQuickComment(selectedText, editor.document.languageId);
            if (comment) {
                editor.edit((editBuilder: vscode.TextEditorEdit) => {
                    editBuilder.insert(selection.start, `${comment}\n`);
                });
            }
        }
    );

    // 4. Show Examples & Mini-Projects
    const getExamplesCommand = vscode.commands.registerCommand(
        'code-learner.getExamplesAndProjects',
        async () => {
            const editor = vscode.window.activeTextEditor;
            const languageId = editor ? editor.document.languageId : 'python';
            const codeContext = editor ? editor.document.getText(editor.selection) : '';

            await provider.handleGetExamplesAndProjects(languageId, codeContext);
        }
    );

    // 5. Explain Error (Diagnostic Command)
    const explainErrorCommand = vscode.commands.registerCommand(
        'code-learner.explainError',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('Open a code file to analyze errors!');
                return;
            }

            const document = editor.document;
            const position = editor.selection.active;
            const diagnostics = vscode.languages.getDiagnostics(document.uri);

            // Filter for errors at current cursor position or active selection
            let activeErrors = diagnostics.filter(d => 
                d.severity === vscode.DiagnosticSeverity.Error && 
                d.range.contains(position)
            );

            // Fallback: If no error is directly under cursor, pick the first error in the file
            if (activeErrors.length === 0) {
                activeErrors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            }

            if (activeErrors.length === 0) {
                vscode.window.showInformationMessage('No active errors detected in this file.');
                return;
            }

            const targetDiagnostic = activeErrors[0];
            const errorMessage = targetDiagnostic.message;
            const errorLine = targetDiagnostic.range.start.line;

            // Extract surrounding context (10 lines above & below the error)
            const startLine = Math.max(0, errorLine - 10);
            const endLine = Math.min(document.lineCount - 1, errorLine + 10);
            const codeContext = document.getText(
                new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
            );

            await provider.handleExplainError(errorMessage, codeContext, document.languageId);
        }
    );

    // Notebook Execution Failure Listener
    const notebooksApi = (vscode as Record<string, any>).notebooks;
    if (notebooksApi && typeof notebooksApi.onDidChangeNotebookCellExecutionState === 'function') {
        notebooksApi.onDidChangeNotebookCellExecutionState(async (event: any) => {
            if (event.state === 1 || event.state === 'Idle') {
                const cell = event.cell;
                if (!cell || !Array.isArray(cell.outputs)) {
                    return;
                }

                const errorOutput = cell.outputs.find((o: any) =>
                    o.items && Array.isArray(o.items) && o.items.some((item: any) => item.mime === 'application/vnd.code.notebook.error')
                );

                if (errorOutput) {
                    const errorItem = errorOutput.items.find(
                        (item: any) => item.mime === 'application/vnd.code.notebook.error'
                    );

                    if (errorItem) {
                        const errorText = new TextDecoder().decode(errorItem.data);
                        const cellCode = cell.document ? cell.document.getText() : '';
                        await provider.handleNotebookError(cellCode, errorText);
                    }
                }
            }
        });
    }

    context.subscriptions.push(
        explainCodeCommand,
        generateModelCommand,
        addQuickCommentCommand,
        getExamplesCommand,
        explainErrorCommand
    );
}

export class CodeLearnerViewProvider implements vscode.WebviewViewProvider {
    // UPDATED: Points to the updated view ID in package.json to guarantee dedicated Activity Bar placement
    public static readonly viewType = 'codeLearner.mainSidebarView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, '<p>Highlight code and right-click to start learning!</p>');
    }

    public async handleExplainCode(code: string, languageId: string) {
        this.showLoading('Explaining code in plain English...', code);
        const response = await this.queryAiProxy({
            mode: 'explain',
            snippet: code,
            code,
            languageId
        });
        await this.renderMarkdownResponse(response, code);
    }

    public async handleGenerateConceptualModel(code: string, languageId: string) {
        this.showLoading('Generating visual conceptual model...'); 
        const response = await this.queryAiProxy({
            mode: 'conceptual_model',
            snippet: code,
            code,
            languageId
        });
        await this.renderMarkdownResponse(response); 
    }

    public async generateQuickComment(code: string, languageId: string): Promise<string | null> {
        this.showLoading('Generating inline comment...', code);
        const response = await this.queryAiProxy({
            mode: 'quick_comment',
            snippet: code,
            code,
            languageId
        });

        const cleanNote = response
            .split('\n')
            .map(line => line.replace(/^#+\s*/, '').replace(/^\*\s*/, '').trim())
            .filter(Boolean)
            .join(' | ');

        return cleanNote ? `# Note: ${cleanNote}` : null;
    }

    public async handleGetExamplesAndProjects(languageId: string, codeContext: string) {
        this.showLoading('Finding related examples & mini-projects...', codeContext);
        const response = await this.queryAiProxy({
            mode: 'examples_and_projects',
            snippet: codeContext,
            code: codeContext,
            languageId
        });
        await this.renderMarkdownResponse(response, codeContext);
    }

    public async handleExplainError(errorMessage: string, codeContext: string, languageId: string) {
        this.showLoading('Analyzing error diagnostics...', codeContext);
        const response = await this.queryAiProxy({
            mode: 'explain_error',
            error: errorMessage,
            snippet: codeContext,
            code: codeContext,
            languageId
        });
        await this.renderMarkdownResponse(response, codeContext);
    }

    public async handleNotebookError(code: string, errorText: string) {
        this.showLoading('Analyzing notebook execution error...', code);
        const response = await this.queryAiProxy({
            mode: 'notebook_error',
            snippet: code,
            code,
            error: errorText,
            languageId: 'python'
        });
        await this.renderMarkdownResponse(response, code);
    }

    private async queryAiProxy(payload: Record<string, any>): Promise<string> {
        try {
            const response = await fetch('https://code-learnler-extension-proxy.vercel.app/api/explain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return `**Error ${response.status}:** ${errorData.error || errorData.message || 'Server rejected the request.'}`;
            }

            const data = (await response.json()) as { result?: string; message?: string; text?: string; explanation?: string };
            return data.result || data.explanation || data.message || data.text || 'No response generated.';
        } catch (err: any) {
            return `**Connection Error:** ${err.message || 'Unable to connect to assistant backend.'}`;
        }
    }

    private showLoading(message: string, snippetCode?: string) {
        if (this._view) {
            this._view.show?.(true);
            const loadingHtml = `<div class="loading"><div class="spinner"></div><p>${message}</p></div>`;
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, loadingHtml, snippetCode);
        }
    }

    private async renderMarkdownResponse(markdownText: string, snippetCode?: string) {
        if (this._view) {
            try {
                const { marked } = await import('marked');
                const htmlContent = await marked.parse(markdownText);
                this._view.webview.html = this._getHtmlForWebview(this._view.webview, htmlContent, snippetCode);
            } catch {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview, `<pre>${markdownText}</pre>`, snippetCode);
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, bodyContent: string, snippetCode?: string) {
        const snippetBlock = snippetCode && snippetCode.trim() ? `
            <div class="card snippet-card">
                <div class="card-label">SELECTED SNIPPET:</div>
                <pre><code>${snippetCode.trim()}</code></pre>
            </div>
        ` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            padding: 14px;
            background-color: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
            line-height: 1.6;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
        }

        .header-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-weight: bold;
            font-size: 13px;
            padding: 4px 8px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .header-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
            margin: 0;
        }

        .section-label {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1px;
            color: var(--vscode-textLink-foreground);
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, var(--vscode-activityBar-border, transparent));
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 14px;
        }

        .snippet-card {
            background-color: var(--vscode-editor-background);
            border-radius: 10px;
        }

        .card-label {
            font-size: 10px;
            font-weight: 700;
            color: var(--vscode-textPreformat-foreground, var(--vscode-textLink-foreground));
            letter-spacing: 0.8px;
            margin-bottom: 6px;
        }

        pre, code {
            font-family: var(--vscode-editor-font-family, "Fira Code", monospace);
            background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
            border-radius: 6px;
            padding: 3px 6px;
            color: var(--vscode-textPreformat-foreground, var(--vscode-editor-foreground));
        }

        pre {
            padding: 10px;
            overflow-x: auto;
            border: 1px solid var(--vscode-widget-border, transparent);
            margin: 4px 0;
        }

        pre code {
            padding: 0;
            background: transparent;
        }

        h1, h2, h3, h4 {
            color: var(--vscode-textLink-foreground);
            margin-top: 16px;
            margin-bottom: 8px;
            font-weight: 700;
        }

        h1 { font-size: 18px; color: var(--vscode-foreground); }
        h2 { font-size: 15px; }
        h3 { font-size: 13px; }

        ul {
            padding-left: 18px;
            margin: 8px 0;
        }

        li {
            margin-bottom: 8px;
        }

        li strong, p strong {
            color: var(--vscode-foreground);
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 30px;
            color: var(--vscode-descriptionForeground);
        }

        .spinner {
            border: 3px solid var(--vscode-activityBar-inactiveForeground, rgba(255,255,255,0.2));
            border-top: 3px solid var(--vscode-progressBar-background, var(--vscode-textLink-foreground));
            border-radius: 50%;
            width: 26px;
            height: 26px;
            animation: spin 0.8s linear infinite;
            margin-bottom: 12px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="section-label">CODE EXPLANATION</div>
    <div class="header">
        <div class="header-badge">&lt;/&gt;</div>
        <div class="header-title">Code Learner</div>
    </div>

    ${snippetBlock}

    <div class="card">
        ${bodyContent}
    </div>
</body>
</html>`;
    }
}

export function deactivate() {}