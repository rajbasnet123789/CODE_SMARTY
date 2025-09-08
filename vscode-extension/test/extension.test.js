const assert = require('assert');
const vscode = require('vscode');
const path = require('path');

suite('Agentic Code Analyzer Extension Tests', () => {
    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('agentic-code-analyzer'));
    });

    test('Should register commands', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('agentic-code-analyzer.analyzeFile'));
        assert.ok(commands.includes('agentic-code-analyzer.analyzeRepo'));
    });

    test('Should activate when opening a Python file', async () => {
        const extension = vscode.extensions.getExtension('agentic-code-analyzer');
        const isActive = extension.isActive;
        
        if (!isActive) {
            // Create a temporary Python file
            const document = await vscode.workspace.openTextDocument({
                content: 'def hello():\n    print("Hello, World!")',
                language: 'python'
            });
            
            await vscode.window.showTextDocument(document);
            
            // Wait a moment for activation
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            assert.ok(extension.isActive, 'Extension should be activated when opening a Python file');
        } else {
            assert.ok(true, 'Extension was already active');
        }
    });

    test('Configuration should be loaded', async () => {
        const config = vscode.workspace.getConfiguration('agentic-code-analyzer');
        assert.notStrictEqual(config.get('apiUrl'), undefined);
        assert.notStrictEqual(config.get('enableRealTimeAnalysis'), undefined);
        assert.notStrictEqual(config.get('analysisDelay'), undefined);
    });
});