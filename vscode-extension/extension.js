const vscode = require('vscode');
const axios = require('axios');
const path = require('path');

// Store diagnostics collection for showing errors/warnings
let diagnosticCollection;

// Store debounce timeout for real-time analysis
let analysisTimeout = null;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Agentic Code Analyzer extension is now active');

    // Create a diagnostic collection for code issues
    diagnosticCollection = vscode.languages.createDiagnosticCollection('agentic-code-analyzer');
    context.subscriptions.push(diagnosticCollection);

    // Register commands
    const analyzeFileCommand = vscode.commands.registerCommand('agentic-code-analyzer.analyzeFile', analyzeCurrentFile);
    const analyzeRepoCommand = vscode.commands.registerCommand('agentic-code-analyzer.analyzeRepo', analyzeRepository);
    const fixConceptualErrorsCommand = vscode.commands.registerCommand('agentic-code-analyzer.fixConceptualErrors', fixConceptualErrors);
    
    context.subscriptions.push(analyzeFileCommand);
    context.subscriptions.push(analyzeRepoCommand);

    // Register real-time analysis if enabled
    const config = vscode.workspace.getConfiguration('agentic-code-analyzer');
    if (config.get('enableRealTimeAnalysis')) {
        // Listen for document changes
        const changeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
            if (analysisTimeout) {
                clearTimeout(analysisTimeout);
            }

            const document = event.document;
            // Only analyze supported file types
            if (isSupportedLanguage(document.languageId)) {
                const delay = config.get('analysisDelay') || 1000;
                analysisTimeout = setTimeout(() => {
                    analyzeDocument(document);
                }, delay);
            }
        });

        // Listen for document opening
        const openSubscription = vscode.workspace.onDidOpenTextDocument(document => {
            if (isSupportedLanguage(document.languageId)) {
                analyzeDocument(document);
            }
        });

        context.subscriptions.push(changeSubscription);
        context.subscriptions.push(openSubscription);
    }

    // If a document is already open, analyze it
    if (vscode.window.activeTextEditor) {
        const document = vscode.window.activeTextEditor.document;
        if (isSupportedLanguage(document.languageId)) {
            analyzeDocument(document);
        }
    }
}

/**
 * Check if the language is supported by our analyzer
 * @param {string} languageId 
 * @returns {boolean}
 */
function isSupportedLanguage(languageId) {
    return ['python', 'java', 'c', 'cpp'].includes(languageId);
}

/**
 * Fix conceptual errors in the current file
 */
async function fixConceptualErrors() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found');
        return;
    }

    const document = editor.document;
    if (!isSupportedLanguage(document.languageId)) {
        vscode.window.showInformationMessage(`Language ${document.languageId} is not supported for conceptual error detection`);
        return;
    }

    // Show the document is being analyzed
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing code for conceptual errors...",
        cancellable: false
    }, async (progress) => {
        await analyzeDocument(document, true, true);
        return new Promise(resolve => setTimeout(resolve, 0));
    });
}

/**
 * Analyze the current active file
 */
async function analyzeCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found');
        return;
    }

    const document = editor.document;
    await analyzeDocument(document, true);
}

/**
 * Detect C/C++ conceptual errors using pattern matching as fallback when server is unavailable
 * @param {string} code The code to analyze
 * @param {vscode.TextDocument} document The document containing the code
 * @returns {vscode.Diagnostic[]} Array of diagnostics for conceptual errors
 */
function detectCConceptualErrors(code, document) {
    const diagnostics = [];
    
    // Find line numbers for key patterns
    const findLineNumber = (pattern) => {
        for (let i = 0; i < document.lineCount; i++) {
            if (pattern.test(document.lineAt(i).text)) {
                return i;
            }
        }
        return 0; // Default to first line if not found
    };
    
    // Detect NULL pointer dereference
    const nullPtrPattern = /\w+\s*=\s*NULL\s*;/;
    const nullPtrDerefPattern = /\*\w+\s*=|\w+\s*->/;
    if (nullPtrPattern.test(code) && nullPtrDerefPattern.test(code)) {
        const line = findLineNumber(nullPtrDerefPattern);
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Conceptual issue: Potential NULL pointer dereference detected",
            vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'Agentic Code Analyzer (conceptual)';
        diagnostic.code = {
            value: 'fix-conceptual',
            target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
        };
        diagnostics.push(diagnostic);
    }
    
    // Detect memory leaks (malloc without free)
    if (/malloc\(.*\)/.test(code) && !/free\s*\(/.test(code)) {
        const line = findLineNumber(/malloc\(.*\)/);
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Conceptual issue: Potential memory leak - malloc used without corresponding free",
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Agentic Code Analyzer (conceptual)';
        diagnostic.code = {
            value: 'fix-conceptual',
            target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
        };
        diagnostics.push(diagnostic);
    }
    
    // Detect uninitialized variables
    const uninitVarPattern = /(int|float|double|char|long)\s+(\w+)\s*;(?!\s*\2\s*=)/;
    const matches = code.match(new RegExp(uninitVarPattern, 'g'));
    if (matches) {
        const line = findLineNumber(uninitVarPattern);
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Conceptual issue: Potentially uninitialized variables detected",
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Agentic Code Analyzer (conceptual)';
        diagnostic.code = {
            value: 'fix-conceptual',
            target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
        };
        diagnostics.push(diagnostic);
    }
    
    // Detect buffer overflow risks
    const bufferPattern = /(strcpy|strcat)\s*\(\s*\w+\s*,/;
    if (bufferPattern.test(code) && !/(strn(cpy|cat))/.test(code)) {
        const line = findLineNumber(bufferPattern);
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Conceptual issue: Potential buffer overflow risk - using strcpy/strcat without bounds checking",
            vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'Agentic Code Analyzer (conceptual)';
        diagnostic.code = {
            value: 'fix-conceptual',
            target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
        };
        diagnostics.push(diagnostic);
    }
    
    // Detect infinite loops
    const infiniteLoopPattern = /for\s*\(\s*.*;\s*;/;
    if (infiniteLoopPattern.test(code)) {
        const line = findLineNumber(infiniteLoopPattern);
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Conceptual issue: Potential infinite loop - missing loop condition",
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Agentic Code Analyzer (conceptual)';
        diagnostic.code = {
            value: 'fix-conceptual',
            target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
        };
        diagnostics.push(diagnostic);
    }
    
    return diagnostics;
}

/**
 * Analyze a document and display results
 * @param {vscode.TextDocument} document 
 * @param {boolean} showNotification Whether to show a notification when analysis is complete
 * @param {boolean} focusOnConceptual Whether to focus on conceptual errors (for C/C++ code)
 */
async function analyzeDocument(document, showNotification = false, focusOnConceptual = false) {
    // Get the code from the document
    const code = document.getText();
    if (!code.trim()) {
        diagnosticCollection.set(document.uri, []);
        return;
    }

    // For C/C++ files, apply fallback pattern detection immediately for faster feedback
    if ((document.languageId === 'c' || document.languageId === 'cpp') && 
        (focusOnConceptual || vscode.workspace.getConfiguration('agentic-code-analyzer').get('enableFallbackDetection'))) {
        const fallbackDiagnostics = detectCConceptualErrors(code, document);
        if (fallbackDiagnostics.length > 0) {
            // Apply fallback diagnostics immediately (will be replaced by server response if available)
            diagnosticCollection.set(document.uri, fallbackDiagnostics);
        }
    }

    // Show progress indicator
    if (showNotification) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: focusOnConceptual ? "Analyzing code for conceptual errors..." : "Analyzing code...",
            cancellable: false
        }, async (progress) => {
            await performAnalysis(document, code, focusOnConceptual);
            return new Promise(resolve => setTimeout(resolve, 0));
        });
    } else {
        await performAnalysis(document, code, focusOnConceptual);
    }
}

/**
 * Perform the actual analysis by calling the API
 * @param {vscode.TextDocument} document 
 * @param {string} code 
 * @param {boolean} focusOnConceptual Whether to focus on conceptual errors
 */
async function performAnalysis(document, code, focusOnConceptual = false) {
    try {
        const config = vscode.workspace.getConfiguration('agentic-code-analyzer');
        const apiUrl = config.get('apiUrl');

        const response = await axios.post(`${apiUrl}/analyze`, {
            code: code,
            focus_conceptual: focusOnConceptual
        });

        if (response.status === 200) {
            const result = response.data;
            displayResults(document, result, focusOnConceptual);
            
            // Only show notification if active editor matches the analyzed document
            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === document) {
                const languageDisplay = result.language.charAt(0).toUpperCase() + result.language.slice(1);
                if (focusOnConceptual) {
                    vscode.window.showInformationMessage(`Conceptual analysis complete: ${languageDisplay} code`);
                } else {
                    vscode.window.showInformationMessage(`Analysis complete: ${languageDisplay} code`);
                }
            }
        }
    } catch (error) {
        console.error('Analysis error:', error);
        if (error.response) {
            vscode.window.showErrorMessage(`Analysis failed: ${error.response.data.detail || error.message}`);
        } else {
            vscode.window.showErrorMessage(`Analysis failed: ${error.message}. Make sure the Agentic Code Analyzer server is running.`);
        }
    }
}

/**
 * Display analysis results in the editor
 * @param {vscode.TextDocument} document 
 * @param {Object} result 
 * @param {boolean} focusOnConceptual Whether to focus on conceptual errors
 */
function displayResults(document, result, focusOnConceptual = false) {
    const diagnostics = [];

    // Parse the suggestions to create diagnostics
    const suggestions = result.suggestions || '';
    const issues = result.issues || {};
    const language = result.language || 'unknown';

    // Process Python-specific issues
    if (language === 'python') {
        // Add flake8 issues
        if (issues.flake8 && issues.flake8 !== 'No issues') {
            const flake8Issues = issues.flake8.split('\n');
            for (const issue of flake8Issues) {
                try {
                    // Parse flake8 output format: file:line:col: error
                    const match = issue.match(/.*:(\d+):(\d+):\s+(.+)/);
                    if (match) {
                        const line = parseInt(match[1]) - 1;
                        const column = parseInt(match[2]);
                        const message = match[3];
                        
                        const range = new vscode.Range(line, column, line, column + 1);
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            message,
                            vscode.DiagnosticSeverity.Warning
                        );
                        diagnostic.source = 'Agentic Code Analyzer (flake8)';
                        diagnostics.push(diagnostic);
                    }
                } catch (e) {
                    console.error('Error parsing flake8 issue:', e);
                }
            }
        }

        // Add mypy issues
        if (issues.mypy && issues.mypy !== 'No issues') {
            const mypyIssues = issues.mypy.split('\n');
            for (const issue of mypyIssues) {
                try {
                    // Parse mypy output format: file:line: error
                    const match = issue.match(/.*:(\d+):\s+(.+)/);
                    if (match) {
                        const line = parseInt(match[1]) - 1;
                        const message = match[2];
                        
                        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            message,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.source = 'Agentic Code Analyzer (mypy)';
                        diagnostics.push(diagnostic);
                    }
                } catch (e) {
                    console.error('Error parsing mypy issue:', e);
                }
            }
        }
    }

    // Process C/C++ specific issues
    if (language === 'c' || language === 'cpp') {
        // Add cppcheck issues
        if (issues.cppcheck && issues.cppcheck !== 'No issues') {
            const cppcheckIssues = issues.cppcheck.split('\n');
            for (const issue of cppcheckIssues) {
                try {
                    // Parse cppcheck output format
                    const match = issue.match(/.*:(\d+):(\d+):\s+(.+)/);
                    if (match) {
                        const line = parseInt(match[1]) - 1;
                        const column = parseInt(match[2]);
                        const message = match[3];
                        
                        const range = new vscode.Range(line, column, line, column + 1);
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            message,
                            vscode.DiagnosticSeverity.Warning
                        );
                        diagnostic.source = 'Agentic Code Analyzer (cppcheck)';
                        diagnostics.push(diagnostic);
                    }
                } catch (e) {
                    console.error('Error parsing cppcheck issue:', e);
                }
            }
        }

        // Add clang analyzer issues
        if (issues.clang_analyze && issues.clang_analyze !== 'No issues') {
            const clangIssues = issues.clang_analyze.split('\n');
            for (const issue of clangIssues) {
                try {
                    // Parse clang output format
                    const match = issue.match(/.*:(\d+):(\d+):\s+(.+)/);
                    if (match) {
                        const line = parseInt(match[1]) - 1;
                        const column = parseInt(match[2]);
                        const message = match[3];
                        
                        const range = new vscode.Range(line, column, line, column + 1);
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            message,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.source = 'Agentic Code Analyzer (clang)';
                        diagnostics.push(diagnostic);
                    }
                } catch (e) {
                    console.error('Error parsing clang issue:', e);
                }
            }
        }

        // Add conceptual errors (special handling for C/C++)
        if (issues.conceptual_errors && issues.conceptual_errors !== 'No conceptual issues detected') {
            const conceptualIssues = issues.conceptual_errors.split('\n');
            
            // Set severity to Error for conceptual issues
            const severity = focusOnConceptual ? 
                vscode.DiagnosticSeverity.Error : 
                vscode.DiagnosticSeverity.Warning;
                
            for (let i = 0; i < conceptualIssues.length; i++) {
                const issue = conceptualIssues[i];
                
                // Try to find the line number by analyzing the issue text
                let line = 0;
                
                // Look for patterns like "line X" or "at line X"
                const lineMatch = issue.match(/(?:at\s+line|line)\s+(\d+)/i);
                if (lineMatch) {
                    line = parseInt(lineMatch[1]) - 1;
                } else {
                    // If no line number found, try to infer from issue type
                    if (issue.includes("uninitialized variable")) {
                        // Try to extract variable name and find its declaration
                        const varMatch = issue.match(/variable[s]?:\s*([a-zA-Z0-9_,\s]+)/);
                        if (varMatch) {
                            const varName = varMatch[1].split(',')[0].trim();
                            // Find variable declaration
                            for (let j = 0; j < document.lineCount; j++) {
                                const text = document.lineAt(j).text;
                                if (text.match(new RegExp(`\\b(int|float|double|char)\\s+${varName}\\b`))) {
                                    line = j;
                                    break;
                                }
                            }
                        }
                    } else if (issue.includes("memory leak")) {
                        // Find malloc calls
                        for (let j = 0; j < document.lineCount; j++) {
                            if (document.lineAt(j).text.includes("malloc")) {
                                line = j;
                                break;
                            }
                        }
                    } else if (issue.includes("NULL pointer")) {
                        // Find NULL assignments
                        for (let j = 0; j < document.lineCount; j++) {
                            if (document.lineAt(j).text.match(/\w+\s*=\s*NULL/)) {
                                line = j;
                                break;
                            }
                        }
                    }
                }
                
                try {
                    // Handle case where line number exceeds document length
                    if (line >= document.lineCount) {
                        line = 0;
                    }
                    
                    const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Conceptual issue: ${issue}`,
                        severity
                    );
                    diagnostic.source = 'Agentic Code Analyzer (conceptual)';
                    diagnostic.code = {
                        value: 'fix-conceptual',
                        target: vscode.Uri.parse('command:agentic-code-analyzer.fixConceptualErrors')
                    };
                    diagnostics.push(diagnostic);
                } catch (e) {
                    console.error('Error creating conceptual issue diagnostic:', e);
                }
            }
        }
    }

    // Add runtime issues for all languages
    if (result.runtime && result.runtime !== 'No output' && !result.runtime.includes('successfully')) {
        const firstLine = document.lineAt(0);
        const lastLine = document.lineAt(document.lineCount - 1);
        const range = new vscode.Range(firstLine.range.start, lastLine.range.end);
        
        const diagnostic = new vscode.Diagnostic(
            range,
            `Runtime issues detected: ${result.runtime.substring(0, 200)}${result.runtime.length > 200 ? '...' : ''}`,
            vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'Agentic Code Analyzer (runtime)';
        diagnostics.push(diagnostic);
    }

    // Add AI suggestions as information-level diagnostics
    if (suggestions && suggestions.length > 0) {
        // Extract code-specific suggestions from the AI response
        const suggestionLines = suggestions.split('\n');
        let inCodeBlock = false;
        let codeBlockLines = [];
        
        for (let i = 0; i < suggestionLines.length; i++) {
            const line = suggestionLines[i];
            
            // Look for specific patterns that indicate important suggestions
            if (line.includes('SUGGESTION:') || 
                line.includes('CONCEPTUAL ISSUE:') || 
                line.includes('RECOMMENDATION:') ||
                line.match(/^[0-9]+\.\s+/) && (
                    line.toLowerCase().includes('error') || 
                    line.toLowerCase().includes('issue') || 
                    line.toLowerCase().includes('bug')
                )) {
                
                // Find an appropriate line to attach this suggestion to
                let targetLine = 0;
                // Extract line numbers from suggestion if present
                const lineMatch = line.match(/line\s+(\d+)/i);
                if (lineMatch) {
                    targetLine = Math.min(parseInt(lineMatch[1]) - 1, document.lineCount - 1);
                }
                
                const range = new vscode.Range(targetLine, 0, targetLine, document.lineAt(targetLine).text.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    line.trim(),
                    vscode.DiagnosticSeverity.Information
                );
                diagnostic.source = 'Agentic Code Analyzer (suggestion)';
                diagnostics.push(diagnostic);
            }
        }
    }

    // Set the diagnostics for the current document
    diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Analyze a GitHub repository
 */
async function analyzeRepository() {
    const repoUrl = await vscode.window.showInputBox({
        prompt: 'Enter GitHub repository URL',
        placeHolder: 'https://github.com/username/repo or username/repo'
    });

    if (!repoUrl) {
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Analyzing repository: ${repoUrl}`,
        cancellable: false
    }, async (progress) => {
        try {
            const config = vscode.workspace.getConfiguration('agentic-code-analyzer');
            const apiUrl = config.get('apiUrl');

            progress.report({ message: 'Cloning and analyzing repository...' });
            
            const response = await axios.post(`${apiUrl}/analyze_repo`, {
                repo_url: repoUrl
            });

            if (response.status === 200) {
                const result = response.data;
                const fileCount = Object.keys(result).length;
                
                // Create a new output channel to display results
                const channel = vscode.window.createOutputChannel('Agentic Code Analysis Results');
                channel.show();
                
                channel.appendLine(`# Analysis Results for ${repoUrl}`);
                channel.appendLine(`Analyzed ${fileCount} files\n`);
                
                // Group files by language for better organization
                const filesByLanguage = {};
                
                for (const [filePath, fileResult] of Object.entries(result)) {
                    const lang = fileResult.language || 'unknown';
                    if (!filesByLanguage[lang]) {
                        filesByLanguage[lang] = [];
                    }
                    filesByLanguage[lang].push({path: filePath, result: fileResult});
                }
                
                // Display results grouped by language
                for (const [language, files] of Object.entries(filesByLanguage)) {
                    const capitalizedLang = language.charAt(0).toUpperCase() + language.slice(1);
                    channel.appendLine(`# ${capitalizedLang} Files (${files.length})\n`);
                    
                    for (const {path, result} of files) {
                        channel.appendLine(`## ${path}`);
                        
                        // Show conceptual errors first for C/C++ files
                        if ((language === 'c' || language === 'cpp') && 
                            result.issues && 
                            result.issues.conceptual_errors && 
                            result.issues.conceptual_errors !== 'No conceptual issues detected') {
                            channel.appendLine('\n### Conceptual Issues:');
                            channel.appendLine(result.issues.conceptual_errors);
                        }
                        
                        // Show other issues
                        if (result.issues && Object.keys(result.issues).length > 0) {
                            channel.appendLine('\n### Technical Issues:');
                            for (const [tool, issues] of Object.entries(result.issues)) {
                                if (issues && 
                                    issues !== 'No issues' && 
                                    tool !== 'conceptual_errors') {
                                    channel.appendLine(`\n#### ${tool}:`);
                                    channel.appendLine(issues);
                                }
                            }
                        }
                        
                        if (result.runtime && result.runtime !== 'No output') {
                            channel.appendLine('\n### Runtime Output:');
                            channel.appendLine(result.runtime);
                        }
                        
                        if (result.suggestions) {
                            channel.appendLine('\n### AI Suggestions:');
                            channel.appendLine(result.suggestions);
                        }
                        
                        channel.appendLine('\n---\n');
                    }
                }
                
                // Show a notification with summary information
                vscode.window.showInformationMessage(
                    `Repository analysis complete. Analyzed ${fileCount} files across ${Object.keys(filesByLanguage).length} languages.`
                );
                
                // Create a summary at the beginning of the output
                const summaryChannel = vscode.window.createOutputChannel('Agentic Code Analysis Summary');
                summaryChannel.show();
                
                summaryChannel.appendLine(`# Analysis Summary for ${repoUrl}`);
                summaryChannel.appendLine(`Total files analyzed: ${fileCount}\n`);
                
                // Count issues by type and language
                const issueCounts = {};
                const conceptualIssues = [];
                
                for (const [filePath, fileResult] of Object.entries(result)) {
                    const lang = fileResult.language || 'unknown';
                    
                    if (!issueCounts[lang]) {
                        issueCounts[lang] = {
                            syntax: 0,
                            conceptual: 0,
                            runtime: 0
                        };
                    }
                    
                    // Count issues
                    if (fileResult.issues) {
                        // Conceptual issues for C/C++
                        if (fileResult.issues.conceptual_errors && 
                            fileResult.issues.conceptual_errors !== 'No conceptual issues detected') {
                            issueCounts[lang].conceptual += fileResult.issues.conceptual_errors.split('\n').length;
                            
                            // Store conceptual issues for highlighting
                            const issues = fileResult.issues.conceptual_errors.split('\n');
                            for (const issue of issues) {
                                conceptualIssues.push({
                                    file: filePath,
                                    issue: issue
                                });
                            }
                        }
                        
                        // Count other issues
                        for (const [tool, issues] of Object.entries(fileResult.issues)) {
                            if (issues && issues !== 'No issues' && tool !== 'conceptual_errors') {
                                issueCounts[lang].syntax += issues.split('\n').length;
                            }
                        }
                    }
                    
                    // Count runtime issues
                    if (fileResult.runtime && 
                        fileResult.runtime !== 'No output' && 
                        !fileResult.runtime.includes('successfully')) {
                        issueCounts[lang].runtime += 1;
                    }
                }
                
                // Display issue summary
                summaryChannel.appendLine(`## Issues by Language\n`);
                for (const [lang, counts] of Object.entries(issueCounts)) {
                    const capitalizedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
                    summaryChannel.appendLine(`### ${capitalizedLang}`);
                    summaryChannel.appendLine(`- Syntax/Compiler Issues: ${counts.syntax}`);
                    summaryChannel.appendLine(`- Conceptual Issues: ${counts.conceptual}`);
                    summaryChannel.appendLine(`- Runtime Issues: ${counts.runtime}`);
                    summaryChannel.appendLine(``);
                }
                
                // Highlight significant conceptual issues
                if (conceptualIssues.length > 0) {
                    summaryChannel.appendLine(`## Top Conceptual Issues to Address\n`);
                    
                    // Show up to 10 conceptual issues
                    const displayCount = Math.min(conceptualIssues.length, 10);
                    for (let i = 0; i < displayCount; i++) {
                        const issue = conceptualIssues[i];
                        summaryChannel.appendLine(`- ${issue.file}: ${issue.issue}`);
                    }
                }
            }
        } catch (error) {
            console.error('Repository analysis error:', error);
            if (error.response) {
                vscode.window.showErrorMessage(`Repository analysis failed: ${error.response.data.detail || error.message}`);
            } else {
                vscode.window.showErrorMessage(`Repository analysis failed: ${error.message}. Make sure the Agentic Code Analyzer server is running.`);
            }
        }
        
        return new Promise(resolve => setTimeout(resolve, 0));
    });
}

/**
 * Deactivate the extension
 */
function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};
