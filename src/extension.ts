import * as vscode from 'vscode';

const PROXY_URL = "https://code-learnler-extension-proxy.vercel.app/api/explain";

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new CodeLearnerSidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CodeLearnerSidebarProvider.viewType,
            sidebarProvider
        )
    );

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && sidebarProvider.isVisible()) {
            const fullText = editor.document.getText();
            if (fullText.trim()) {
                sidebarProvider.generateConceptualModel(fullText, editor.document.fileName);
            }
        }
    });

    let explainDisposable = vscode.commands.registerCommand('code-learner.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a file and highlight code to explain.");
            return;
        }

        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim()) {
            vscode.window.showInformationMessage("Please highlight a snippet of code first.");
            return;
        }

        const fullFileContext = editor.document.getText();
        sidebarProvider.explainSnippet(selectedText, fullFileContext);
    });

    let modelDisposable = vscode.commands.registerCommand('code-learner.generateConceptualModel', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a code file to generate a conceptual model.");
            return;
        }

        const fullText = editor.document.getText();
        if (!fullText.trim()) {
            vscode.window.showWarningMessage("File is empty.");
            return;
        }

        sidebarProvider.generateConceptualModel(fullText, editor.document.fileName);
    });

    context.subscriptions.push(explainDisposable, modelDisposable);
}

class CodeLearnerSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeLearner.conceptualModelView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.getText().trim()) {
            this.generateConceptualModel(activeEditor.document.getText(), activeEditor.document.fileName);
        } else {
            webviewView.webview.html = this._getHtmlForWebview("Open an active code file to generate a conceptual model.");
        }
    }

    public isVisible(): boolean {
        return this._view?.visible || false;
    }

    private async ensureSidebarFocused() {
        if (!this._view) {
            await vscode.commands.executeCommand('codeLearner.conceptualModelView.focus');
        } else {
            this._view.show?.(true);
        }
    }

    public async explainSnippet(snippet: string, fullContext: string) {
        await this.ensureSidebarFocused();

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview("Analyzing highlighted code...", true);

            try {
                const response = await fetch(PROXY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ snippet, fullContext })
                });

                if (!response.ok) {
                    const errData: any = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${response.status}`);
                }

                const data: any = await response.json();
                this._view.webview.html = this._getHtmlForWebview(data.explanation || "No explanation returned.", false, undefined, snippet);
            } catch (err: any) {
                this._view.webview.html = this._getHtmlForWebview(`Failed to explain code: ${err.message}`, false);
            }
        }
    }

    public async generateConceptualModel(code: string, fileName: string) {
        await this.ensureSidebarFocused();

        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview("Analyzing active file...", true);

            try {
                const response = await fetch(PROXY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ snippet: code, mode: "conceptual_model" })
                });

                if (!response.ok) {
                    const errData: any = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${response.status}`);
                }

                const data: any = await response.json();
                const fallbackDiagram = `graph TD\n    A["Start Program"] --> B["Process Input"]\n    B --> C["Execute Operations"]\n    C --> D["Display Output"]`;

                this._view.webview.html = this._getHtmlForWebview(data.explanation || "Summary generated.", false, data.mermaid || fallbackDiagram);
            } catch (err: any) {
                this._view.webview.html = this._getHtmlForWebview(`Failed to generate model: ${err.message}`, false);
            }
        }
    }

    private _getHtmlForWebview(content: string, isLoading = false, mermaidCode?: string, activeSnippet?: string): string {
        const formattedContent = renderMarkdownToHtml(content);
        const headerTitle = activeSnippet ? "Code Explanation" : "Conceptual Model & Flowchart";

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <script type="module">
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({ 
                    startOnLoad: true, 
                    theme: 'base',
                    securityLevel: 'loose',
                    themeVariables: {
                        primaryColor: '#2563eb',
                        primaryTextColor: '#ffffff',
                        primaryBorderColor: '#60a5fa',
                        lineColor: '#60a5fa',
                        fontSize: '15px'
                    }
                });
            </script>
            <style>
                html { box-sizing: border-box; }
                *, *:before, *:after { box-sizing: inherit; }
                body {
                    font-family: var(--vscode-font-family, sans-serif);
                    padding: 12px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
                    line-height: 1.5;
                    font-size: 13px;
                    overflow-y: auto;
                }
                .top-tag {
                    font-size: 0.7rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--vscode-symbolIcon-keywordForeground, #ff79c6);
                    margin-bottom: 4px;
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.15));
                }
                .brand-logo {
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #00d2ff, #7f00ff);
                    border-radius: 6px;
                    color: #ffffff;
                    font-weight: 800;
                    font-size: 11px;
                }
                .header h2 { margin: 0; font-size: 1.1rem; font-weight: 700; }
                .card {
                    border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.12));
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                    background-color: var(--vscode-welcomePage-tileBackground, rgba(255, 255, 255, 0.03));
                }
                .diagram-card {
                    border: 1px solid var(--vscode-textLink-foreground, #2563eb);
                    border-radius: 8px;
                    padding: 16px 12px;
                    background-color: #090d16;
                    margin-bottom: 12px;
                }
                .diagram-card svg {
                    width: 100% !important;
                    height: auto !important;
                    display: block;
                    margin: 0 auto;
                }
                pre.code-preview {
                    background: rgba(0, 0, 0, 0.35);
                    padding: 8px;
                    border-radius: 4px;
                    overflow-x: auto;
                    font-family: var(--vscode-editor-font-family, monospace);
                    font-size: 0.85em;
                    margin-top: 6px;
                }
                .section-title {
                    font-size: 1.05rem;
                    font-weight: 700;
                    color: var(--vscode-textLink-foreground, #00d2ff);
                    margin: 14px 0 6px 0;
                }
                .subsection-title {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: var(--vscode-symbolIcon-keywordForeground, #ff79c6);
                    margin: 10px 0 4px 0;
                }
                strong { color: var(--vscode-symbolIcon-keywordForeground, #ff79c6); font-weight: 700; }
                .code-pill {
                    background: var(--vscode-textCodeBlock-background, rgba(255, 255, 255, 0.12));
                    padding: 2px 5px;
                    border-radius: 4px;
                    font-family: var(--vscode-editor-font-family, monospace);
                    color: var(--vscode-textPreformat-foreground, #f1fa8c);
                }
                ul { margin: 4px 0 10px 0; padding-left: 18px; }
                li { margin-bottom: 4px; }
                p { margin: 6px 0; }
            </style>
        </head>
        <body>
            <div class="top-tag">${headerTitle}</div>
            <div class="header">
                <div class="brand-logo">&lt;/&gt;</div>
                <h2>Code Learner</h2>
            </div>

            ${activeSnippet ? `
                <div class="card">
                    <strong style="font-size: 0.75em; text-transform: uppercase; opacity: 0.7;">Selected Snippet:</strong>
                    <pre class="code-preview"><code>${escapeHtml(activeSnippet)}</code></pre>
                </div>
            ` : ''}

            ${isLoading ? `
                <div class="card">
                    <div style="font-style: italic; opacity: 0.85;">${content}</div>
                </div>
            ` : `
                ${mermaidCode ? `
                    <div class="diagram-card">
                        <pre class="mermaid">
${mermaidCode}
                        </pre>
                    </div>
                ` : ''}
                
                <div class="card">
                    ${formattedContent}
                </div>
            `}
        </body>
        </html>`;
    }
}

function renderMarkdownToHtml(markdown: string): string {
    const lines = markdown.split('\n');
    let htmlOutput = '';
    let inList = false;

    for (let rawLine of lines) {
        let line = rawLine.trim();

        if (!line) {
            if (inList) {
                htmlOutput += '</ul>';
                inList = false;
            }
            continue;
        }

        // Clean emojis & strip bullet markers if accidentally placed on bold subheaders (e.g. * **Inputs:**)
        line = line.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
        line = line.replace(/^[\*\-]\s*\*\*(Inputs|Processing|Outputs|Core Concept|Line-by-Line Mechanics|Real-World Analogy|Real-World Use):\*\*/i, '#### $1');

        line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        line = line.replace(/`([^`]+)`/g, '<code class="code-pill">$1</code>');

        if (line.startsWith('####')) {
            if (inList) {
                htmlOutput += '</ul>';
                inList = false;
            }
            const title = line.replace(/^####\s*/, '');
            htmlOutput += `<div class="subsection-title">${title}</div>`;
        } else if (line.startsWith('###')) {
            if (inList) {
                htmlOutput += '</ul>';
                inList = false;
            }
            const title = line.replace(/^###\s*/, '');
            htmlOutput += `<h3 class="section-title">${title}</h3>`;
        } else if (line.startsWith('* ') || line.startsWith('- ')) {
            if (!inList) {
                htmlOutput += '<ul>';
                inList = true;
            }
            const itemText = line.replace(/^[\*\-]\s*/, '');
            htmlOutput += `<li>${itemText}</li>`;
        } else {
            if (inList) {
                htmlOutput += '</ul>';
                inList = false;
            }
            htmlOutput += `<p>${line}</p>`;
        }
    }

    if (inList) {
        htmlOutput += '</ul>';
    }

    return htmlOutput;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function deactivate() {}