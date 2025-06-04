const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🤖 WhatsApp Reminder Bot Setup\n');
console.log('This script will help you configure your bot for deployment.\n');

async function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupBot() {
    try {
        console.log('📋 Please provide the following information:\n');

        const mongoUri = await question('MongoDB Atlas Connection String (from MongoDB Atlas): ');
        
        if (!mongoUri || !mongoUri.includes('mongodb')) {
            console.log('❌ Invalid MongoDB URI. Please check your connection string.');
            process.exit(1);
        }

        const botName = await question('Bot Name (default: ReminderBot): ') || 'ReminderBot';
        const timezone = await question('Timezone (default: Asia/Calcutta): ') || 'Asia/Calcutta';

        // Create .env file
        const envContent = `# MongoDB Atlas Connection String
MONGODB_URI=${mongoUri}

# Bot Configuration
BOT_NAME=${botName}
TIMEZONE=${timezone}
`;

        fs.writeFileSync('.env', envContent);
        console.log('\n✅ .env file created successfully!');

        // Display next steps
        console.log('\n🚀 Setup Complete! Next steps:\n');
        console.log('1. Test locally:');
        console.log('   npm install');
        console.log('   npm start');
        console.log('');
        console.log('2. Deploy to cloud:');
        console.log('   - Push to GitHub');
        console.log('   - Deploy on Railway/Render/Heroku');
        console.log('   - Add the same environment variables');
        console.log('');
        console.log('3. Scan QR code with WhatsApp');
        console.log('');
        console.log('📖 For detailed deployment instructions, see DEPLOYMENT.md');
        console.log('');
        console.log('✨ Your WhatsApp reminder bot is ready!');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    } finally {
        rl.close();
    }
}

setupBot();
