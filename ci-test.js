#!/usr/bin/env node

// Simple CI-friendly test script for GitHub Actions
console.log('🔍 Running CI-friendly validation tests...');

const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, condition) {
    if (condition) {
        console.log(`✅ ${name}`);
        passed++;
    } else {
        console.log(`❌ ${name}`);
        failed++;
    }
}

// Test 1: Check if package.json exists and has correct main entry
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    test('package.json exists', true);
    test('main entry points to multi-bot-manager.js', packageJson.main === 'multi-bot-manager.js');
    test('start script is correct', packageJson.scripts.start === 'node multi-bot-manager.js');
    
    // Check key dependencies
    const deps = packageJson.dependencies || {};
    test('@whiskeysockets/baileys dependency exists', '@whiskeysockets/baileys' in deps);
    test('express dependency exists', 'express' in deps);
    test('mongoose dependency exists', 'mongoose' in deps);
    test('qrcode dependency exists', 'qrcode' in deps);
    
} catch (error) {
    test('package.json is valid JSON', false);
    failed++;
}

// Test 2: Check if core files exist
const requiredFiles = [
    'multi-bot-manager.js',
    'advanced-reminder-bot.js', 
    'database.js',
    'railway.toml'
];

requiredFiles.forEach(file => {
    test(`${file} exists`, fs.existsSync(file));
});

// Test 3: Check if bot_sessions directory exists
try {
    const stats = fs.statSync('bot_sessions');
    test('bot_sessions directory exists', stats.isDirectory());
} catch (error) {
    test('bot_sessions directory exists', false);
}

// Test 4: Check railway.toml configuration
try {
    const railwayConfig = fs.readFileSync('railway.toml', 'utf8');
    test('Railway start command configured', railwayConfig.includes('startCommand = "npm start"'));
    test('Railway health check configured', railwayConfig.includes('healthcheckPath = "/health"'));
} catch (error) {
    test('railway.toml readable', false);
    failed++;
}

// Test 5: Check .gitignore
try {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    test('.env is ignored in git', gitignore.includes('.env'));
    test('bot_sessions is ignored in git', gitignore.includes('bot_sessions'));
} catch (error) {
    test('.gitignore readable', false);
    failed++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed === 0) {
    console.log('🎉 All tests passed! Ready for deployment.');
    process.exit(0);
} else {
    console.log(`❌ ${failed} test(s) failed. Please fix the issues above.`);
    process.exit(1);
}
