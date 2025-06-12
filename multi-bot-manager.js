const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const path = require('path');
const fs = require('fs').promises;
const qrcode = require('qrcode');
const express = require('express');
const Database = require('./database');
require('dotenv').config();

class MultiBotManager {
    constructor() {
        this.bots = new Map(); // userId -> bot instance
        this.userSessions = new Map(); // userId -> session data
        this.qrCodes = new Map(); // userId -> qr code data
        this.db = new Database();
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.isShuttingDown = false;
        this.sessionBackupInterval = null;
        
        this.initializeDatabase();
        this.setupExpressServer();
        this.startCleanupScheduler();
        this.setupGracefulShutdown();
        this.startSessionBackup();
        this.restoreActiveSessions();
    }

    async initializeDatabase() {
        try {
            const mongoUri = process.env.MONGODB_URI;
            if (!mongoUri) {
                throw new Error('MONGODB_URI environment variable not set');
            }
            await this.db.connect(mongoUri);
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            process.exit(1);
        }
    }

    setupExpressServer() {
        this.app.use(express.json());
        this.app.use(express.static('public'));

        // Serve registration page
        this.app.get('/', (req, res) => {
            res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Registration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
        }
        input {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            backdrop-filter: blur(5px);
        }
        input::placeholder {
            color: rgba(255, 255, 255, 0.7);
        }
        button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(45deg, #25D366, #128C7E);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 20px;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(37, 211, 102, 0.4);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            font-weight: 600;
        }
        .success {
            background: rgba(37, 211, 102, 0.2);
            border: 1px solid rgba(37, 211, 102, 0.5);
        }
        .error {
            background: rgba(255, 82, 82, 0.2);
            border: 1px solid rgba(255, 82, 82, 0.5);
        }
        .qr-container {
            text-align: center;
            margin-top: 20px;
        }
        .qr-code {
            background: white;
            padding: 20px;
            border-radius: 15px;
            display: inline-block;
            margin: 20px 0;
        }
        .bot-info {
            background: rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 15px;
            margin-top: 20px;
        }
        .feature {
            margin: 10px 0;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 WhatsApp Reminder Bot</h1>
        
        <div class="bot-info">
            <h2>🌟 Features</h2>
            <div class="feature">📅 Smart reminder scheduling</div>
            <div class="feature">💊 Medicine reminders with custom frequency</div>
            <div class="feature">🔄 Recurring reminders</div>
            <div class="feature">📱 Natural language date/time parsing</div>
            <div class="feature">✅ Easy management with quick actions</div>
        </div>

        <form id="registrationForm">
            <div class="form-group">
                <label for="name">Your Name</label>
                <input type="text" id="name" name="name" placeholder="Enter your full name" required>
            </div>
            
            <div class="form-group">
                <label for="email">Email (Optional)</label>
                <input type="email" id="email" name="email" placeholder="your@email.com">
            </div>
            
            <button type="submit" id="registerBtn">🚀 Create My Bot</button>
        </form>
        
        <div id="status" class="status" style="display: none;"></div>
        <div id="qrContainer" class="qr-container" style="display: none;"></div>
    </div>

    <script>
        document.getElementById('registrationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const submitBtn = document.getElementById('registerBtn');
            const statusDiv = document.getElementById('status');
            const qrContainer = document.getElementById('qrContainer');
            
            submitBtn.disabled = true;
            submitBtn.textContent = '🔄 Creating your bot...';
            statusDiv.style.display = 'none';
            qrContainer.style.display = 'none';
            
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    statusDiv.className = 'status success';
                    statusDiv.innerHTML = \`
                        <h3>✅ Bot Created Successfully!</h3>
                        <p><strong>Your Bot ID:</strong> \${data.userId}</p>
                        <p>Scan the QR code below with your WhatsApp to connect your personal bot</p>
                    \`;
                    statusDiv.style.display = 'block';
                    
                    // Show QR code
                    qrContainer.innerHTML = \`
                        <h3>📱 Scan this QR Code</h3>
                        <div class="qr-code">
                            <img src="/api/qr/\${data.userId}" alt="QR Code" style="max-width: 300px;">
                        </div>
                        <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
                        <p><strong>⚠️ Keep this page open until connected!</strong></p>
                        <button onclick="checkConnection('\${data.userId}')" style="padding: 10px 20px; margin-top: 15px;">
                            🔍 Check Connection Status
                        </button>
                    \`;
                    qrContainer.style.display = 'block';
                    
                    // Auto-refresh QR code every 30 seconds
                    setInterval(() => {
                        document.querySelector('.qr-code img').src = \`/api/qr/\${data.userId}?t=\${Date.now()}\`;
                    }, 30000);
                    
                } else {
                    throw new Error(data.error || 'Registration failed');
                }
                
            } catch (error) {
                statusDiv.className = 'status error';
                statusDiv.innerHTML = \`
                    <h3>❌ Registration Failed</h3>
                    <p>\${error.message}</p>
                \`;
                statusDiv.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '🚀 Create My Bot';
            }
        });
        
        async function checkConnection(userId) {
            try {
                const response = await fetch(\`/api/status/\${userId}\`);
                const data = await response.json();
                
                if (data.connected) {
                    document.getElementById('qrContainer').innerHTML = \`
                        <div class="status success">
                            <h3>🎉 Successfully Connected!</h3>
                            <p>Your WhatsApp bot is now active and ready to use.</p>
                            <p><strong>Send a message to yourself with "/help" to get started!</strong></p>
                            <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px;">
                                <h4>🚀 Quick Start Commands:</h4>
                                <p>• <strong>/reminder</strong> - Create a new reminder</p>
                                <p>• <strong>/medicine</strong> - Set up medicine reminders</p>
                                <p>• <strong>/list</strong> - View all your reminders</p>
                                <p>• <strong>/help</strong> - See all available commands</p>
                            </div>
                        </div>
                    \`;
                } else {
                    alert('Still waiting for connection. Please scan the QR code with WhatsApp.');
                }
            } catch (error) {
                alert('Error checking connection: ' + error.message);
            }
        }
    </script>
</body>
</html>
            `);
        });

        // API Routes
        this.app.post('/api/register', async (req, res) => {
            try {
                const { name, email } = req.body;
                
                if (!name || name.trim().length < 2) {
                    return res.json({ success: false, error: 'Name is required (min 2 characters)' });
                }
                
                const userId = this.generateUserId();
                
                // Store user info
                await this.db.addUser(userId, name.trim(), 'Asia/Calcutta');
                
                // Create bot instance for this user
                const botInstance = await this.createBotInstance(userId, name.trim());
                
                res.json({ 
                    success: true, 
                    userId: userId,
                    message: 'Bot created successfully! Scan the QR code to connect.'
                });
                
            } catch (error) {
                console.error('Registration error:', error);
                res.json({ success: false, error: 'Internal server error' });
            }
        });

        this.app.get('/api/qr/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const bot = this.bots.get(userId);
                
                if (!bot || !bot.currentQR) {
                    return res.status(404).send('QR code not available');
                }
                
                // Generate QR code image
                const qrCodeData = await qrcode.toBuffer(bot.currentQR, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(qrCodeData);
                
            } catch (error) {
                console.error('QR generation error:', error);
                res.status(500).send('Error generating QR code');
            }
        });

        this.app.get('/api/status/:userId', (req, res) => {
            const { userId } = req.params;
            const bot = this.bots.get(userId);
            
            res.json({
                connected: bot ? bot.isReady : false,
                phoneNumber: bot ? bot.authenticatedPhoneNumber : null
            });
        });

        // Health check for Railway
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                activeBots: this.bots.size,
                uptime: process.uptime()
            });
        });

        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Multi-bot server running on port ${this.port}`);
            console.log(`🔗 Access at: http://localhost:${this.port}`);
        });
    }

    generateUserId() {
        return 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async createBotInstance(userId, userName) {
        try {
            // Ensure bot_sessions directory exists
            const sessionsDir = path.join(__dirname, 'bot_sessions');
            await fs.mkdir(sessionsDir, { recursive: true });
            
            const authDir = path.join(sessionsDir, userId);
            
            // Create auth directory if it doesn't exist
            await fs.mkdir(authDir, { recursive: true });
            
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            
            const sock = makeWASocket({
                auth: state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: false,
                browser: [`Bot-${userName}`, 'Desktop', '2.0.0'],
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: false
            });

            const botInstance = {
                userId,
                userName,
                sock,
                isReady: false,
                authenticatedPhoneNumber: null,
                currentQR: null,
                userSessions: new Map(),
                autoDeleteMessages: new Map(),
                reminderBot: null
            };

            // Import the reminder bot functionality
            const AdvancedReminderBot = require('./advanced-reminder-bot');
            botInstance.reminderBot = new AdvancedReminderBot(sock, this.db, userId);

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(update, botInstance);
            });
            
            sock.ev.on('messages.upsert', (messageUpdate) => {
                this.handleMessages(messageUpdate, botInstance);
            });

            this.bots.set(userId, botInstance);
            
            console.log(`🤖 Bot instance created for user: ${userId} (${userName})`);
            return botInstance;
            
        } catch (error) {
            console.error(`Failed to create bot instance for ${userId}:`, error);
            throw error;
        }
    }

    handleConnectionUpdate(update, botInstance) {
        const { connection, lastDisconnect, qr } = update;
        
        try {
            if (qr) {
                botInstance.currentQR = qr;
                console.log(`📱 QR code generated for ${botInstance.userId}`);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log(`🔄 Reconnecting bot ${botInstance.userId}...`);
                    setTimeout(() => {
                        this.recreateBotInstance(botInstance.userId);
                    }, 3000);
                } else {
                    console.log(`📴 Bot ${botInstance.userId} logged out`);
                    this.bots.delete(botInstance.userId);
                }
                
                botInstance.isReady = false;
            } 
            
            if (connection === 'open') {
                botInstance.isReady = true;
                botInstance.authenticatedPhoneNumber = botInstance.sock.user?.id?.split(':')[0];
                botInstance.currentQR = null;
                
                console.log(`🎉 Bot ${botInstance.userId} is ready! Phone: ${botInstance.authenticatedPhoneNumber}`);
                
                // Send welcome message to the user
                this.sendWelcomeMessage(botInstance);
            }

        } catch (error) {
            console.error(`Connection update error for ${botInstance.userId}:`, error.message);
        }
    }

    async sendWelcomeMessage(botInstance) {
        try {
            const welcomeMessage = `🎉 *WELCOME TO YOUR BOT!*

✅ *Your personal WhatsApp reminder bot is now active!*

👋 *Hello ${botInstance.userName}!*
🤖 *Bot ID:* ${botInstance.userId}
📱 *Connected:* ${botInstance.authenticatedPhoneNumber}

🚀 *QUICK START*

Try these commands:
• */reminder* - Create a new reminder
• */medicine* - Set up medicine reminders  
• */list* - View all your reminders
• */help* - See all available commands

🎯 *Your bot is completely private and only responds to you!*

💡 *Type /help to see the full feature list*`;

            const userJid = botInstance.authenticatedPhoneNumber + '@s.whatsapp.net';
            await botInstance.sock.sendMessage(userJid, { text: welcomeMessage });
            
        } catch (error) {
            console.error(`Error sending welcome message to ${botInstance.userId}:`, error);
        }
    }

    async recreateBotInstance(userId) {
        try {
            const oldBot = this.bots.get(userId);
            if (oldBot) {
                this.bots.delete(userId);
            }
            
            // Get user info from database
            const userInfo = await this.db.getUserInfo(userId);
            if (userInfo) {
                await this.createBotInstance(userId, userInfo.name);
            }
        } catch (error) {
            console.error(`Failed to recreate bot instance for ${userId}:`, error);
        }
    }

    handleMessages(messageUpdate, botInstance) {
        try {
            if (!botInstance.isReady || !botInstance.reminderBot) return;
            
            // Delegate message handling to the reminder bot
            botInstance.reminderBot.handleMessages(messageUpdate);
            
        } catch (error) {
            console.error(`Message handling error for ${botInstance.userId}:`, error.message);
        }
    }

    startCleanupScheduler() {
        // Clean up inactive bots every hour
        setInterval(() => {
            this.cleanupInactiveBots();
        }, 60 * 60 * 1000); // 1 hour

        // Clean up inactive user data every 24 hours (users inactive for 60+ days)
        setInterval(() => {
            this.cleanupInactiveUserData();
        }, 24 * 60 * 60 * 1000); // 24 hours

        console.log('🧹 Bot cleanup scheduler started');
        console.log('🗑️ Inactive user data cleanup scheduler started (60+ days inactive)');
    }

    cleanupInactiveBots() {
        const now = Date.now();
        const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [userId, bot] of this.bots.entries()) {
            if (!bot.isReady && (now - bot.lastActivity > inactiveThreshold)) {
                console.log(`🧹 Cleaning up inactive bot: ${userId}`);
                this.bots.delete(userId);
            }
        }
    }

    // Automatic cleanup of inactive user data (60+ days inactive)
    async cleanupInactiveUserData() {
        try {
            console.log('🗑️ Starting automatic cleanup of inactive user data...');
            
            const cleanupResult = await this.db.bulkCleanupInactiveUsers(60); // 60 days
            
            if (cleanupResult.totalProcessed > 0) {
                console.log(`
╔═══════════════════════════════════════╗
║        📊 CLEANUP COMPLETED           ║
╚═══════════════════════════════════════╝

🗑️ *Automatic Data Cleanup Results:*

📋 **Summary:**
• Total users processed: ${cleanupResult.totalProcessed}
• Successfully cleaned: ${cleanupResult.summary.successful}
• Failed cleanups: ${cleanupResult.summary.failed}
• Reminders deleted: ${cleanupResult.summary.totalRemindersDeleted}
• Sessions deleted: ${cleanupResult.summary.totalSessionsDeleted}

💾 **Database Storage Optimized!**
• Freed up space from inactive users (60+ days)
• All active users and data preserved
• System performance improved

🔄 *Next cleanup: 24 hours*`);

                // Get database statistics after cleanup
                const dbStats = await this.db.getDatabaseStats();
                console.log(`
📊 **Updated Database Statistics:**
• Active users: ${dbStats.users.active}
• Inactive users: ${dbStats.users.inactive}
• Total reminders: ${dbStats.reminders.total}
• Pending reminders: ${dbStats.reminders.pending}
• Active sessions: ${dbStats.sessions.recent}`);

            } else {
                console.log('✅ No inactive users found for cleanup (all users active within 60 days)');
            }

        } catch (error) {
            console.error('❌ Error during inactive user data cleanup:', error.message);
        }
    }

    // Session backup and restore for seamless deployments
    async startSessionBackup() {
        // Backup session data every 30 seconds
        this.sessionBackupInterval = setInterval(async () => {
            await this.backupActiveSessions();
        }, 30000);

        console.log('💾 Session backup scheduler started');
    }

    async backupActiveSessions() {
        try {
            const activeUsers = [];
            
            for (const [userId, bot] of this.bots.entries()) {
                if (bot.isReady && bot.authenticatedPhoneNumber) {
                    activeUsers.push({
                        userId,
                        userName: bot.userName,
                        phoneNumber: bot.authenticatedPhoneNumber,
                        isReady: bot.isReady,
                        lastBackup: new Date()
                    });
                }
            }

            // Store in database for persistence across deployments
            if (activeUsers.length > 0) {
                await this.db.updateActiveUserSessions(activeUsers);
            }
        } catch (error) {
            console.error('Error backing up sessions:', error);
        }
    }

    async restoreActiveSessions() {
        try {
            console.log('🔄 Restoring active sessions from previous deployment...');
            
            const activeSessions = await this.db.getActiveUserSessions();
            
            for (const session of activeSessions) {
                if (!this.bots.has(session.userId)) {
                    console.log(`🔄 Restoring bot session for user: ${session.userId}`);
                    await this.createBotInstance(session.userId, session.userName);
                }
            }
            
            console.log(`✅ Restored ${activeSessions.length} active bot sessions`);
        } catch (error) {
            console.error('Error restoring sessions:', error);
        }
    }

    setupGracefulShutdown() {
        // Handle deployment signals gracefully
        process.on('SIGTERM', async () => {
            console.log('🔄 Received SIGTERM - performing graceful shutdown for deployment...');
            await this.gracefulShutdownForDeployment();
        });

        process.on('SIGINT', async () => {
            console.log('🔄 Received SIGINT - performing graceful shutdown...');
            await this.gracefulShutdownForDeployment();
        });

        // Cleanup on exit
        process.on('exit', async () => {
            if (this.sessionBackupInterval) {
                clearInterval(this.sessionBackupInterval);
            }
        });
    }

    async gracefulShutdownForDeployment() {
        console.log('💾 Backing up all active sessions before shutdown...');
        this.isShuttingDown = true;

        try {
            // Final backup of all sessions
            await this.backupActiveSessions();
            
            // Give time for sessions to be saved
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            console.log('✅ Session backup completed - ready for new deployment');
            
            // Close database connection
            await this.db.close();
            
        } catch (error) {
            console.error('Error during graceful shutdown:', error);
        } finally {
            process.exit(0);
        }
    }

    // Enhanced connection handling for deployments
    async handleConnectionUpdate(update, botInstance) {
        const { connection, lastDisconnect, qr } = update;
        
        try {
            if (qr) {
                botInstance.currentQR = qr;
                console.log(`📱 QR code generated for ${botInstance.userId}`);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect && !this.isShuttingDown) {
                    console.log(`🔄 Reconnecting bot ${botInstance.userId}...`);
                    setTimeout(() => {
                        this.recreateBotInstance(botInstance.userId);
                    }, 3000);
                } else if (this.isShuttingDown) {
                    console.log(`📴 Bot ${botInstance.userId} - graceful shutdown in progress`);
                } else {
                    console.log(`📴 Bot ${botInstance.userId} logged out`);
                    this.bots.delete(botInstance.userId);
                    // Mark as inactive in database
                    await this.db.deactivateUser(botInstance.userId);
                }
                
                botInstance.isReady = false;
            } 
            
            if (connection === 'open') {
                botInstance.isReady = true;
                botInstance.authenticatedPhoneNumber = botInstance.sock.user?.id?.split(':')[0];
                botInstance.currentQR = null;
                
                console.log(`🎉 Bot ${botInstance.userId} is ready! Phone: ${botInstance.authenticatedPhoneNumber}`);
                
                // Update database with active status
                await this.db.addUser(botInstance.userId, botInstance.userName, 'Asia/Calcutta');
                
                // Send welcome message only for new connections (not restored sessions)
                if (!this.isRestoredSession(botInstance.userId)) {
                    this.sendWelcomeMessage(botInstance);
                } else {
                    console.log(`🔄 Restored session for ${botInstance.userId} - skipping welcome message`);
                }
            }

        } catch (error) {
            console.error(`Connection update error for ${botInstance.userId}:`, error.message);
        }
    }

    isRestoredSession(userId) {
        // Check if this is a restored session from previous deployment
        return this.bots.has(userId) && this.bots.get(userId).isRestored;
    }

    // Graceful shutdown
    async shutdown() {
        console.log('📴 Shutting down multi-bot manager...');
        
        for (const [userId, bot] of this.bots.entries()) {
            try {
                if (bot.sock) {
                    await bot.sock.logout();
                }
            } catch (error) {
                console.error(`Error shutting down bot ${userId}:`, error);
            }
        }
        
        await this.db.close();
        process.exit(0);
    }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    if (global.multiBotManager) {
        await global.multiBotManager.shutdown();
    } else {
        process.exit(0);
    }
});

process.on('SIGTERM', async () => {
    if (global.multiBotManager) {
        await global.multiBotManager.shutdown();
    } else {
        process.exit(0);
    }
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error.message);
});

// Start the multi-bot manager
console.log('🚀 Starting Multi-Bot WhatsApp Manager...');
global.multiBotManager = new MultiBotManager();

module.exports = MultiBotManager;
