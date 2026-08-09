import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let selectionTimeout: NodeJS.Timeout | undefined = undefined;

// Paste your live Vercel URL here
const PROXY_URL = "https://code-learnler-extension-proxy.vercel.app/api/explain";

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('code-learner.explainCode', async () => {
        runExplanation();
    });

    let selectionListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (!currentPanel || !event.textEditor) return;

        const selectedText = event.textEditor.document.getText(event.selections[0]);
        if (!selectedText.trim()) return;

        if (selectionTimeout) clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(() => {
            runExplanation();
        }, 400);
    });

    context.subscriptions.push(disposable, selectionListener);
}

async function runExplanation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) {
        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent("Please highlight a snippet of code.", "", false);
        }
        return;
    }

    const columnToShowIn = vscode.ViewColumn.Beside;

    if (currentPanel) {
        currentPanel.reveal(columnToShowIn, true);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'codeLearner',
            'Code Learner',
            columnToShowIn,
            { enableScripts: true }
        );

        currentPanel.onDidDispose(() => {
            currentPanel = undefined;
        });
    }

    currentPanel.webview.html = getWebviewContent("Thinking...", selectedText, true);

    try {
        const response = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snippet: selectedText })
        });

        if (!response.ok) {
            const errData: any = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const explanation = data.explanation || "No explanation returned.";

        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent(explanation, selectedText, false);
        }

    } catch (err: any) {
        console.error("Code Learner Error:", err);
        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent(
                `Connection Error: ${err.message}`, 
                selectedText,
                false
            );
        }
    }
}

function getWebviewContent(explanation: string, snippet: string, isLoading: boolean): string {
    const formattedExplanation = formatMarkdownToHtml(explanation);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 18px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
                line-height: 1.6;
            }
            .header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 20px;
            }
            .header-icon {
                width: 24px;
                height: 24px;
                fill: none;
                stroke: var(--vscode-symbolIcon-keywordForeground, var(--vscode-foreground));
                stroke-width: 1.5;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            h2 {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
            }
            pre {
                background: var(--vscode-textCodeBlock-background);
                padding: 12px;
                border-radius: 6px;
                overflow-x: auto;
                font-family: var(--vscode-editor-font-family);
                font-size: 0.9em;
                border: 1px solid var(--vscode-widget-border, transparent);
            }
            .card {
                border: 1px solid var(--vscode-widget-border);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
                background-color: var(--vscode-welcomePage-tileBackground, transparent);
            }
            .loading-text {
                font-style: italic;
                opacity: 0.8;
            }
            strong {
                color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-foreground));
            }
        </style>
    </head>
    <body>
        <div class="header">
            <svg class="header-icon" viewBox="0 0 24 24">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
            <h2>Code Learner</h2>
        </div>
        <div class="card">
            <strong style="font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8;">Selected Snippet:</strong>
            <pre><code>${escapeHtml(snippet)}</code></pre>
        </div>
        <div class="card">
            ${isLoading ? `<div class="loading-text">⚡ ${explanation}</div>` : formattedExplanation}
        </div>
    </body>
    </html>`;
}

function formatMarkdownToHtml(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--vscode-textCodeBlock-background);padding:2px 4px;border-radius:3px;">$1</code>')
        .replace(/\n/g, '<br/>');
}

function escapeHtml(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function deactivate() {}