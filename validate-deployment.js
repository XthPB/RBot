const Database = require('./database');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class DeploymentValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
    }

    async validate() {
        console.log('🔍 Validating Multi-Bot WhatsApp Deployment...\n');

        await this.checkEnvironmentVariables();
        await this.checkDependencies();
        await this.checkDatabaseConnection();
        await this.checkFileStructure();
        await this.checkConfiguration();

        this.showResults();
        return this.errors.length === 0;
    }

    async checkEnvironmentVariables() {
        console.log('📋 Checking Environment Variables...');
        
        const requiredVars = ['MONGODB_URI'];
        const optionalVars = ['PORT', 'NODE_ENV', 'BOT_NAME'];

        for (const varName of requiredVars) {
            if (!process.env[varName]) {
                this.errors.push(`❌ Missing required environment variable: ${varName}`);
            } else {
                this.passed.push(`✅ Environment variable ${varName} is set`);
            }
        }

        for (const varName of optionalVars) {
            if (!process.env[varName]) {
                this.warnings.push(`⚠️ Optional environment variable ${varName} not set`);
            } else {
                this.passed.push(`✅ Optional environment variable ${varName} is set`);
            }
        }

        // Validate MongoDB URI format
        if (process.env.MONGODB_URI) {
            if (!process.env.MONGODB_URI.startsWith('mongodb')) {
                this.errors.push('❌ MONGODB_URI must start with mongodb:// or mongodb+srv://');
            } else {
                this.passed.push('✅ MONGODB_URI format is valid');
            }
        }
    }

    async checkDependencies() {
        console.log('\n📦 Checking Dependencies...');
        
        try {
            const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
            const requiredDeps = [
                '@whiskeysockets/baileys',
                'mongoose',
                'moment',
                'node-cron',
                'express',
                'qrcode',
                'pino',
                'dotenv'
            ];

            for (const dep of requiredDeps) {
                if (packageJson.dependencies[dep]) {
                    this.passed.push(`✅ Dependency ${dep} is included`);
                } else {
                    this.errors.push(`❌ Missing required dependency: ${dep}`);
                }
            }

            // Check if start script is correct
            if (packageJson.scripts.start === 'node multi-bot-manager.js') {
                this.passed.push('✅ Start script points to multi-bot-manager.js');
            } else {
                this.errors.push('❌ Start script should be "node multi-bot-manager.js"');
            }

        } catch (error) {
            this.errors.push('❌ Could not read package.json');
        }
    }

    async checkDatabaseConnection() {
        console.log('\n🗄️ Checking Database Connection...');
        
        if (!process.env.MONGODB_URI) {
            this.errors.push('❌ Cannot test database - MONGODB_URI not set');
            return;
        }

        try {
            const db = new Database();
            await db.connect(process.env.MONGODB_URI);
            this.passed.push('✅ Database connection successful');
            await db.close();
        } catch (error) {
            this.errors.push(`❌ Database connection failed: ${error.message}`);
        }
    }

    async checkFileStructure() {
        console.log('\n📁 Checking File Structure...');
        
        const requiredFiles = [
            'multi-bot-manager.js',
            'advanced-reminder-bot.js',
            'database.js',
            'package.json',
            'railway.toml',
            '.env'
        ];

        const requiredDirs = [
            'bot_sessions'
        ];

        for (const file of requiredFiles) {
            try {
                await fs.access(file);
                this.passed.push(`✅ Required file exists: ${file}`);
            } catch (error) {
                this.errors.push(`❌ Missing required file: ${file}`);
            }
        }

        for (const dir of requiredDirs) {
            try {
                const stats = await fs.stat(dir);
                if (stats.isDirectory()) {
                    this.passed.push(`✅ Required directory exists: ${dir}`);
                } else {
                    this.errors.push(`❌ ${dir} exists but is not a directory`);
                }
            } catch (error) {
                this.errors.push(`❌ Missing required directory: ${dir}`);
            }
        }
    }

    async checkConfiguration() {
        console.log('\n⚙️ Checking Configuration...');
        
        try {
            // Check railway.toml
            const railwayConfig = await fs.readFile('railway.toml', 'utf8');
            if (railwayConfig.includes('healthcheckPath = "/health"')) {
                this.passed.push('✅ Railway health check configured');
            } else {
                this.warnings.push('⚠️ Railway health check not configured');
            }

            if (railwayConfig.includes('startCommand = "npm start"')) {
                this.passed.push('✅ Railway start command configured');
            } else {
                this.errors.push('❌ Railway start command not configured correctly');
            }

            // Check .gitignore
            const gitignore = await fs.readFile('.gitignore', 'utf8');
            if (gitignore.includes('bot_sessions/')) {
                this.passed.push('✅ Bot sessions directory ignored in git');
            } else {
                this.warnings.push('⚠️ Bot sessions directory not ignored in git');
            }

            if (gitignore.includes('.env')) {
                this.passed.push('✅ Environment file ignored in git');
            } else {
                this.errors.push('❌ Environment file not ignored in git');
            }

        } catch (error) {
            this.warnings.push('⚠️ Could not check all configuration files');
        }
    }

    showResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 DEPLOYMENT VALIDATION RESULTS');
        console.log('='.repeat(60));

        if (this.passed.length > 0) {
            console.log('\n🎉 PASSED CHECKS:');
            this.passed.forEach(check => console.log(`  ${check}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS:');
            this.warnings.forEach(warning => console.log(`  ${warning}`));
        }

        if (this.errors.length > 0) {
            console.log('\n❌ ERRORS (MUST FIX):');
            this.errors.forEach(error => console.log(`  ${error}`));
        }

        console.log('\n' + '='.repeat(60));
        
        if (this.errors.length === 0) {
            console.log('🎉 VALIDATION PASSED! Ready for deployment.');
            console.log('\n🚀 Next steps:');
            console.log('1. Commit all changes to git');
            console.log('2. Push to your GitHub repository');
            console.log('3. Deploy to Railway');
            console.log('4. Set environment variables in Railway dashboard');
            console.log('5. Test the deployment URL');
        } else {
            console.log(`❌ VALIDATION FAILED! ${this.errors.length} error(s) must be fixed.`);
            console.log('\n🔧 Fix the errors above and run validation again.');
        }

        console.log('='.repeat(60));
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new DeploymentValidator();
    validator.validate().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = DeploymentValidator;
