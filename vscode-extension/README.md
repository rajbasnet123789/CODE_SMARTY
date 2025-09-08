# Agentic Code Analyzer

A VS Code extension that provides real-time code analysis and suggestions powered by AI. This extension integrates with the Agentic AI Code Fixer & Repo Analyzer backend to analyze your code as you type and provide intelligent suggestions for improvements.

## Features

- **Real-time Code Analysis**: Get immediate feedback on your code as you write
- **Static Analysis Integration**: View errors and warnings from tools like flake8 and mypy for Python code
- **Runtime Execution**: Test your code in a sandboxed environment to catch runtime errors
- **AI-Powered Suggestions**: Receive intelligent suggestions to improve your code's quality and efficiency
- **Repository Analysis**: Analyze entire GitHub repositories to identify issues and potential improvements
- **Multi-language Support**: Works with Python, Java, C, and C++ code

## Requirements

- VS Code 1.60.0 or newer
- An active instance of the Agentic AI Code Fixer & Repo Analyzer backend (default: http://localhost:8000)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Agentic Code Analyzer"
4. Click Install

### Manual Installation

1. Download the VSIX file from the releases
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Click on the "..." menu in the top-right corner
5. Select "Install from VSIX..."
6. Choose the downloaded VSIX file

## Setup

1. Make sure the Agentic AI Code Fixer & Repo Analyzer backend is running
2. Open VS Code settings (File > Preferences > Settings)
3. Search for "Agentic Code Analyzer"
4. Configure the API URL if needed (default: http://localhost:8000)
5. Enable/disable real-time analysis as preferred

## Usage

### Analyzing the Current File

- Open a file in a supported language (Python, Java, C, C++)
- The extension will automatically analyze your code as you type (if real-time analysis is enabled)
- Issues and suggestions will appear as underlined text in the editor
- Hover over the underlined text to see the issue details and suggestions
- You can also manually trigger analysis by:
  - Right-clicking in the editor and selecting "Analyze Current File" from the context menu
  - Opening the command palette (Ctrl+Shift+P) and running "Agentic Code Analyzer: Analyze Current File"

### Analyzing a GitHub Repository

- Open the command palette (Ctrl+Shift+P)
- Run "Agentic Code Analyzer: Analyze GitHub Repository"
- Enter the GitHub repository URL when prompted
- Wait for the analysis to complete
- View the comprehensive results in the output panel

## Configuration

The extension can be configured through VS Code settings:

- **API URL**: The URL of the Agentic AI Code Fixer & Repo Analyzer backend
- **Real-Time Analysis**: Enable or disable automatic analysis as you type
- **Analysis Delay**: The delay in milliseconds before triggering analysis after typing

## How It Works

1. The extension monitors your code as you type
2. After a configurable delay, it sends the code to the Agentic AI Code Fixer & Repo Analyzer backend
3. The backend analyzes the code using:
   - Static analysis tools (flake8, mypy for Python)
   - Sandboxed execution in Docker
   - AI models for intelligent suggestions
4. The results are displayed in VS Code as diagnostics and suggestions

## Troubleshooting

- **No analysis results**: Ensure the backend server is running and accessible at the configured URL
- **Analysis timeout**: For large files or repositories, the analysis might take longer than expected
- **Missing suggestions**: Make sure the file is in a supported language (Python, Java, C, C++)

## License

This extension is licensed under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.