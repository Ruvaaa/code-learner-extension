import * as vscode from 'vscode';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let selectionTimeout: NodeJS.Timeout | undefined = undefined;

// Replace with your free Hugging Face token (https://huggingface.co/settings/tokens)
const HF_TOKEN = "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";

export function activate(context: vscode.ExtensionContext) {
    // 1. Command handler (manual trigger via Ctrl+Shift+P)
    let disposable = vscode.commands.registerCommand('code-learner.explainCode', async () => {
        runExplanation();
    });

    // 2. Event listener: Auto-update Webview when highlighting new code snippets
    let selectionListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (!currentPanel || !event.textEditor) return;

        const selectedText = event.textEditor.document.getText(event.selections[0]);
        if (!selectedText.trim()) return;

        // Debounce selection updates (400ms) to avoid spamming the API while dragging selection
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
        if (!HF_TOKEN || HF_TOKEN === "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") {
            throw new Error("Missing Hugging Face Token! Please set HF_TOKEN in src/extension.ts");
        }

        // Modern HF Router API (OpenAI Chat Completions Compatible)
        const response = await fetch("https://router.huggingface.co/hf-inference/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${HF_TOKEN.trim()}`
            },
            body: JSON.stringify({
                model: "Qwen/Qwen2.5-Coder-7B-Instruct",
                messages: [
                    {
                        role: "system",
                        content: `You are a fun, clear programming tutor for absolute beginners.
You MUST output EXACTLY 3 sections using these emojis:

💡 **What This Code Does**: Plain English step-by-step breakdown.
🧠 **Easy Way to Remember**: A simple real-world analogy.
🚀 **Real-World Use Case**: Where developers use this pattern.

Example Output:
💡 **What This Code Does**: Checks if option 1 was picked.
🧠 **Easy Way to Remember**: Like pressing '1' on an elevator button.
🚀 **Real-World Use Case**: Interactive command-line tools and menus.`
                    },
                    {
                        role: "user",
                        content: `Explain this code snippet:\n\`\`\`\n${selectedText}\n\`\`\``
                    }
                ],
                max_tokens: 300,
                temperature: 0.5
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const data: any = await response.json();
        const explanation = data.choices?.[0]?.message?.content || "No explanation returned.";

        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent(explanation, selectedText, false);
        }

    } catch (err: any) {
        console.error("Code Learner API Error:", err);
        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent(
                `API Error: ${err.message}`, 
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