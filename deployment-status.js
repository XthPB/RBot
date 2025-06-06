#!/usr/bin/env node

/**
 * Deployment Status Monitor
 * Helps track seamless deployment progress and session persistence
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DeploymentMonitor {
    constructor() {
        this.startTime = new Date();
        this.logFile = path.join(__dirname, 'deployment.log');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        console.log(`🔍 ${message}`);
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            console.warn('Warning: Could not write to log file');
        }
    }

    async checkGitStatus() {
        try {
            const status = execSync('git status --porcelain', { encoding: 'utf8' });
            const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
            
            if (status.trim()) {
                this.log(`Git Status: Uncommitted changes detected on branch '${branch}'`);
                console.log('📝 Uncommitted files:');
                console.log(status);
            } else {
                this.log(`Git Status: Clean working directory on branch '${branch}'`);
            }
            
            return { clean: !status.trim(), branch };
        } catch (error) {
            this.log(`Git Status: Error checking git status - ${error.message}`);
            return { clean: false, branch: 'unknown' };
        }
    }

    async checkHealthEndpoint() {
        try {
            // Try to check local health endpoint
            const response = await fetch('http://localhost:3000/health');
            if (response.ok) {
                const health = await response.json();
                this.log(`Health Check: ✅ Local server healthy - ${health.activeBots} active bots, uptime: ${Math.floor(health.uptime)}s`);
                return health;
            } else {
                this.log(`Health Check: ❌ Local server returned status ${response.status}`);
                return null;
            }
        } catch (error) {
            this.log(`Health Check: ❌ Local server not reachable - ${error.message}`);
            return null;
        }
    }

    checkProjectStructure() {
        const requiredFiles = [
            'multi-bot-manager.js',
            'database.js',
            'package.json',
            'railway.toml',
            '.github/workflows/auto-deploy.yml',
            'SEAMLESS_DEPLOYMENT_GUIDE.md'
        ];

        const missingFiles = [];
        const presentFiles = [];

        requiredFiles.forEach(file => {
            if (fs.existsSync(path.join(__dirname, file))) {
                presentFiles.push(file);
            } else {
                missingFiles.push(file);
            }
        });

        if (missingFiles.length === 0) {
            this.log(`Project Structure: ✅ All required files present (${presentFiles.length} files)`);
        } else {
            this.log(`Project Structure: ⚠️ Missing files: ${missingFiles.join(', ')}`);
        }

        return { present: presentFiles, missing: missingFiles };
    }

    checkEnvironmentVariables() {
        const requiredEnvVars = ['MONGODB_URI', 'PORT'];
        const optional = ['NODE_ENV'];
        
        const missing = [];
        const present = [];

        requiredEnvVars.forEach(varName => {
            if (process.env[varName]) {
                present.push(varName);
            } else {
                missing.push(varName);
            }
        });

        if (missing.length === 0) {
            this.log(`Environment: ✅ All required variables set (${present.length} required)`);
        } else {
            this.log(`Environment: ❌ Missing variables: ${missing.join(', ')}`);
        }

        // Check optional variables
        optional.forEach(varName => {
            if (process.env[varName]) {
                this.log(`Environment: 📝 Optional variable ${varName} = ${process.env[varName]}`);
            }
        });

        return { present, missing };
    }

    async performFullCheck() {
        console.log('🚀 Starting Deployment Status Check...\n');
        this.log('=== Deployment Status Check Started ===');

        // 1. Check project structure
        console.log('📁 Checking project structure...');
        const structure = this.checkProjectStructure();

        // 2. Check environment variables
        console.log('\n🔧 Checking environment variables...');
        const env = this.checkEnvironmentVariables();

        // 3. Check git status
        console.log('\n📊 Checking git status...');
        const git = await this.checkGitStatus();

        // 4. Check local health endpoint
        console.log('\n🏥 Checking health endpoint...');
        const health = await this.checkHealthEndpoint();

        // 5. Summary
        console.log('\n📋 DEPLOYMENT READINESS SUMMARY');
        console.log('================================');

        const issues = [];
        
        if (structure.missing.length > 0) {
            issues.push(`Missing files: ${structure.missing.join(', ')}`);
        }
        
        if (env.missing.length > 0) {
            issues.push(`Missing env vars: ${env.missing.join(', ')}`);
        }
        
        if (!git.clean) {
            issues.push('Uncommitted changes in git');
        }

        if (git.branch !== 'main' && git.branch !== 'master') {
            issues.push(`Not on main/master branch (currently on: ${git.branch})`);
        }

        if (issues.length === 0) {
            console.log('✅ Ready for seamless deployment!');
            console.log('\n🚀 To deploy, run: npm run deploy:seamless');
            this.log('Status: Ready for deployment');
        } else {
            console.log('❌ Issues found:');
            issues.forEach(issue => console.log(`   • ${issue}`));
            console.log('\n🔧 Please fix these issues before deploying.');
            this.log(`Status: Not ready - ${issues.length} issues found`);
        }

        if (health) {
            console.log(`\n📊 Current Status: ${health.activeBots} active bots running locally`);
        }

        const duration = Date.now() - this.startTime.getTime();
        this.log(`=== Check completed in ${duration}ms ===`);
        
        console.log(`\n📝 Full log saved to: ${this.logFile}`);
    }

    static showUsage() {
        console.log(`
🚀 Deployment Status Monitor

Usage:
  node deployment-status.js              Run full deployment readiness check
  node deployment-status.js --help       Show this help
  node deployment-status.js --health     Check health endpoint only
  node deployment-status.js --git        Check git status only

Examples:
  npm run validate                       Run deployment validation
  node deployment-status.js --health     Quick health check
        `);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const monitor = new DeploymentMonitor();

    if (args.includes('--help') || args.includes('-h')) {
        DeploymentMonitor.showUsage();
        return;
    }

    if (args.includes('--health')) {
        console.log('🏥 Checking health endpoint only...');
        await monitor.checkHealthEndpoint();
        return;
    }

    if (args.includes('--git')) {
        console.log('📊 Checking git status only...');
        await monitor.checkGitStatus();
        return;
    }

    // Run full check by default
    await monitor.performFullCheck();
}

// Handle both direct execution and module import
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Error running deployment status check:', error.message);
        process.exit(1);
    });
}

module.exports = DeploymentMonitor;
