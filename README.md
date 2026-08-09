# Code Learner 

**Code Learner** is an absolute beginner’s programming assistant designed to bridge the gap between complex code syntax and plain, intuitive understanding. 

Instead of searching through dense documentation or copy-pasting code into web browsers, **Code Learner** translates highlighted code snippets into plain, jargon-free English directly inside VS Code. Powered by an embedded, lightweight local AI model, it runs 100% offline with **zero configuration, zero API keys, and zero cloud dependencies**.

---

## See It In Action

### 1. Select Your Code
Highlight any line or block of code you want to understand, right-click, and select **Code Learner: Explain This Code**.

![Step 1: Selecting Code in Editor](./assets/preview-step1.png)

---

### 2. Embedded AI Initialization
Code Learner automatically opens a dedicated side-by-side window and initializes its local model. On the first run, it seamlessly prepares the lightweight inference engine locally.

![Step 2: Webview Panel Loading & Initialization](./assets/preview-step2.png)

---

### 3. Clear, Step-by-Step Explanation
Get a clean, beginner-friendly explanation broken down with analogies and plain English—rendered right beside your code.

![Step 3: Side-by-Side Explanation Window](./assets/preview-step3.png)

---

## Features

* **Zero Configuration:** No API keys, server setups, or terminal commands required. Works straight out of the box.
* **100% Private & Offline:** Runs entirely on your local device using an embedded Small Language Model (SLM). Your code never leaves your computer.
* **Dedicated Side Panel:** Opens side-by-side with your code using VS Code's native Webview UI—no intrusive popups or modal blocking.
* **Beginner-Focused Explanations:** Cuts out dense computer science jargon and breaks down logic with clear analogies.
* **Theme Aware:** Automatically matches your VS Code theme (Dark or Light) natively.

---

## How to Use

1. Open any source code file in VS Code.
2. Highlight a function, loop, condition, or snippet.
3. **Right-click** the selection and click **Code Learner: Explain This Code** (or run `Code Learner: Explain This Code` from the Command Palette `Ctrl+Shift+P`).
4. Read your plain-English breakdown in the side window!

---

## Requirements

* VS Code `v1.85.0` or higher.
* ~350MB of free disk space for the initial local AI model weights cache.

---

## License

Distributed under the MIT License.