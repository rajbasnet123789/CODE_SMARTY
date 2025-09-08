#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const packageJson = require('./package.json');
const extensionName = packageJson.name;
const version = packageJson.version;
const outDir = path.join(__dirname, 'dist');

console.log(`Building ${extensionName} v${version}...`);

// Create output directory if it doesn't exist
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`Created output directory: ${outDir}`);
}

try {
    // Install dependencies
    console.log('Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    
    // Run linting if available
    if (packageJson.scripts.lint) {
        console.log('Running linting...');
        execSync('npm run lint', { stdio: 'inherit' });
    }
    
    // Run tests if available
    if (packageJson.scripts.test) {
        console.log('Running tests...');
        try {
            execSync('npm test', { stdio: 'inherit' });
        } catch (e) {
            console.error('Tests failed, but continuing with build');
        }
    }
    
    // Package the extension
    console.log('Packaging extension...');
    const vsixPath = path.join(outDir, `${extensionName}-${version}.vsix`);
    execSync(`npx vsce package -o "${vsixPath}"`, { stdio: 'inherit' });
    
    console.log(`\nBuild completed successfully!`);
    console.log(`VSIX package created at: ${vsixPath}`);
    
    // Instructions for installation
    console.log('\nTo install the extension:');
    console.log('1. Open VS Code');
    console.log('2. Go to Extensions view (Ctrl+Shift+X)');
    console.log('3. Click "..." at the top-right of the Extensions view');
    console.log('4. Select "Install from VSIX..."');
    console.log(`5. Choose the file: ${vsixPath}`);
    
} catch (error) {
    console.error(`\nBuild failed: ${error.message}`);
    process.exit(1);
}