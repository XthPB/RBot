const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const moment = require('moment');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
require('dotenv').config();

const Database = require('./database');

class AdvancedReminderBot {
    constructor() {
        this.db = new Database();
        this.userSessions = new Map();
        this.authenticatedPhoneNumber = null;
        this.isReady = false;
        this.sock = null;
        
        this.initializeDatabase();
        this.initializeBot();
        this.startReminderScheduler();
        this.startCleanupScheduler();
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

    async initializeBot() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
            
            this.sock = makeWASocket({
                auth: state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['Advanced Reminder Bot', 'Desktop', '2.0.0'],
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: false
            });

            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

        } catch (error) {
            console.error('❌ Failed to initialize bot:', error.message);
            setTimeout(() => this.initializeBot(), 5000);
        }
    }

    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        try {
            if (qr) {
                console.log('\n📱 Please scan the QR code with your WhatsApp:');
                qrcode.generate(qr, { small: true });
                console.log('📱 Scan the QR code above to continue\n');
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log('🔄 Connection lost, reconnecting...');
                    setTimeout(() => this.initializeBot(), 3000);
                } else {
                    console.log('📴 Logged out, please restart the bot');
                    process.exit(0);
                }
                
                this.isReady = false;
            } 
            
            if (connection === 'open') {
                this.isReady = true;
                this.authenticatedPhoneNumber = this.sock.user?.id?.split(':')[0];
                
                console.log('🎉 Advanced WhatsApp Reminder Bot is ready!');
                console.log(`📱 Authenticated as: ${this.authenticatedPhoneNumber}`);
                console.log('💬 Send "/help" to yourself to see all commands\n');
            }

        } catch (error) {
            console.error('Connection update error:', error.message);
        }
    }

    async handleMessages(messageUpdate) {
        try {
            if (!this.isReady) return;
            
            const message = messageUpdate.messages[0];
            if (!message || !message.message) return;

            const messageText = this.extractMessageText(message);
            const chatId = message.key.remoteJid;
            const senderPhoneNumber = chatId.split('@')[0];
            const isGroupChat = chatId.endsWith('@g.us');
            
            // Skip bot's own messages (they start with "RBot")
            if (!messageText || messageText.startsWith('RBot')) {
                return;
            }

            // Handle both individual chats and group chats
            let userNumber;
            if (isGroupChat) {
                // In group chats, use the sender's phone number
                userNumber = message.key.participant?.split('@')[0] || senderPhoneNumber;
            } else {
                // In individual chats, use the chat phone number
                userNumber = senderPhoneNumber;
            }

            console.log(`💬 User ${userNumber} message: "${messageText}" ${isGroupChat ? '(group)' : '(private)'}`);
            
            // Handle different flows
            if (messageText.startsWith('/')) {
                await this.handleCommands(message, messageText, userNumber, chatId);
            } else if (this.userSessions.has(userNumber)) {
                await this.handleSessionFlow(message, messageText, userNumber, chatId);
            } else {
                // Handle reminder responses (done, reschedule, delete)
                await this.handleReminderResponse(message, messageText, userNumber, chatId);
            }

        } catch (error) {
            console.error('Message handling error:', error.message);
        }
    }

    extractMessageText(message) {
        return message.message?.conversation || 
               message.message?.extendedTextMessage?.text || 
               '';
    }

    async handleCommands(message, messageText, userNumber, chatId) {
        const command = messageText.toLowerCase().split(' ')[0];
        
        switch (command) {
            case '/reminder':
            case '/new':
                await this.startReminderFlow(message, userNumber, chatId);
                break;
            case '/list':
            case '/view':
                await this.listReminders(message, userNumber, chatId);
                break;
            case '/delete':
                await this.startDeleteFlow(message, userNumber, chatId);
                break;
            case '/clear':
            case '/erase':
                await this.startClearFlow(message, userNumber, chatId);
                break;
            case '/help':
                await this.showHelp(message, chatId);
                break;
            case '/cancel':
                await this.cancelCurrentFlow(message, userNumber, chatId);
                break;
            default:
                await this.sendBotMessage(chatId, 
                    `❓ Unknown command: ${command}\n\nType /help to see all available commands.`);
        }
    }

    async startReminderFlow(message, userNumber) {
        this.userSessions.delete(userNumber);
        
        this.userSessions.set(userNumber, {
            flow: 'reminder',
            step: 'activity',
            data: {},
            startTime: Date.now()
        });

        const welcomeMessage = `
╔═══════════════════════════════════════╗
║            🔔 CREATE REMINDER          ║
╚═══════════════════════════════════════╝

✨ *Step 1 of 3: What should I remind you about?*

📋 *Examples:*
┌─────────────────────────────────────┐
│ • Call doctor for appointment       │
│ • Submit quarterly report           │
│ • Pick up groceries on way home     │
│ • Team standup meeting              │
│ • Take evening medication           │
└─────────────────────────────────────┘

💬 *Type your reminder activity:*`;

        await this.sendBotMessage(message.key.remoteJid, welcomeMessage);
    }

    async handleSessionFlow(message, messageText, userNumber) {
        const session = this.userSessions.get(userNumber);
        if (!session) return;

        // Session timeout (15 minutes)
        if (Date.now() - session.startTime > 15 * 60 * 1000) {
            this.userSessions.delete(userNumber);
            await this.sendBotMessage(message.key.remoteJid, 
                '⏰ Session expired due to inactivity. Type /reminder to start again.');
            return;
        }

        try {
            switch (session.flow) {
                case 'reminder':
                    await this.handleReminderStep(message, messageText, session, userNumber);
                    break;
                case 'delete':
                    await this.handleDeleteStep(message, messageText, session, userNumber);
                    break;
                case 'clear':
                    await this.handleClearStep(message, messageText, session, userNumber);
                    break;
                case 'reschedule':
                    await this.handleRescheduleStep(message, messageText, session, userNumber);
                    break;
            }
        } catch (error) {
            console.error('Session flow error:', error.message);
            this.userSessions.delete(userNumber);
        }
    }

    async handleReminderStep(message, messageText, session, userNumber) {
        switch (session.step) {
            case 'activity':
                if (messageText.trim().length < 5) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please enter a more detailed reminder (at least 5 characters).');
                    return;
                }

                session.data.activity = messageText.trim();
                session.step = 'date';

                const dateMessage = `
✅ *Activity saved:* "${messageText}"

╔═══════════════════════════════════════╗
║            📅 SELECT DATE              ║
╚═══════════════════════════════════════╝

✨ *Step 2 of 3: When should I remind you?*

📋 *Smart date formats:*
┌─────────────────────────────────────┐
│ • today, tomorrow                   │
│ • next monday, next friday          │
│ • january 20, march 15              │
│ • 2025-06-10, 15/06/2025           │
└─────────────────────────────────────┘

📅 *Type the date:*`;

                await this.sendBotMessage(message.key.remoteJid, dateMessage);
                break;

            case 'date':
                const parsedDate = this.parseDate(messageText);
                
                if (!parsedDate) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        `❌ Couldn't understand date: "${messageText}"\n\n🔄 Please try formats like:\n• today, tomorrow\n• next monday\n• january 20\n• 2025-06-10`);
                    return;
                }

                if (parsedDate.isBefore(moment(), 'day')) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please choose a future date. Can\'t set reminders in the past!');
                    return;
                }

                session.data.date = parsedDate;
                session.step = 'time';

                const timeMessage = `
✅ *Date saved:* ${parsedDate.format('dddd, MMMM Do, YYYY')}

╔═══════════════════════════════════════╗
║             🕐 SELECT TIME             ║
╚═══════════════════════════════════════╝

✨ *Step 3 of 3: What time should I remind you?*

📋 *Time formats:*
┌─────────────────────────────────────┐
│ • 9 AM, 2:30 PM, 11:45 PM          │
│ • 09:00, 14:30, 23:45              │
│ • noon, midnight                    │
└─────────────────────────────────────┘

🕐 *Type the time:*`;

                await this.sendBotMessage(message.key.remoteJid, timeMessage);
                break;

            case 'time':
                const parsedTime = this.parseTime(messageText, session.data.date);
                
                if (!parsedTime) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        `❌ Couldn't understand time: "${messageText}"\n\n🔄 Please try formats like:\n• 9 AM, 2:30 PM\n• 14:30, 09:00\n• noon, midnight`);
                    return;
                }

                if (parsedTime.isBefore(moment())) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please choose a future time. Can\'t set reminders in the past!');
                    return;
                }

                session.data.dateTime = parsedTime;
                session.step = 'confirm';

                const confirmMessage = `
╔═══════════════════════════════════════╗
║            ✨ CONFIRMATION             ║
╚═══════════════════════════════════════╝

🎯 *Review your reminder:*

📝 *Task:* ${session.data.activity}
📅 *Date:* ${parsedTime.format('dddd, MMMM Do, YYYY')}
🕐 *Time:* ${parsedTime.format('h:mm A')}
⏱️ *Scheduled:* ${parsedTime.fromNow()}

╔═══════════════════════════════════════╗
║              📝 HOW IT WORKS           ║
╚═══════════════════════════════════════╝

🤖 *I will send you a WhatsApp message* at the scheduled time with:
• Your reminder task
• Options to reschedule or mark as done
• Quick actions for future reminders

✅ *Type "yes" to save this reminder*
❌ *Type "no" to cancel*`;

                await this.sendBotMessage(message.key.remoteJid, confirmMessage);
                break;

            case 'confirm':
                const response = messageText.toLowerCase().trim();
                
                if (response === 'yes' || response === 'y') {
                    await this.saveReminder(message, session, userNumber);
                } else if (response === 'no' || response === 'n') {
                    this.userSessions.delete(userNumber);
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Reminder cancelled. Type /reminder to create a new one.');
                } else {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '🤔 Please respond with "yes" to save or "no" to cancel.');
                }
                break;
        }
    }

    async saveReminder(message, session, userNumber) {
        try {
            const { activity, dateTime } = session.data;
            
            const reminderId = await this.db.addReminder(
                userNumber,
                'User',
                activity,
                dateTime.format('YYYY-MM-DD HH:mm:ss'),
                message.key.remoteJid
            );

            const successMessage = `
╔═══════════════════════════════════════╗
║              🎉 SUCCESS!               ║
╚═══════════════════════════════════════╝

✅ *Reminder created successfully!*

📝 *Task:* ${activity}
🆔 *ID:* #${reminderId}
📅 *Scheduled:* ${dateTime.format('dddd, MMMM Do [at] h:mm A')}
⏱️ *That's:* ${dateTime.fromNow()}

╔═══════════════════════════════════════╗
║            🚀 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

• /reminder - Create another reminder
• /list - View all your reminders
• /delete - Remove a specific reminder
• /help - See all commands`;

            await this.sendBotMessage(message.key.remoteJid, successMessage);
            this.userSessions.delete(userNumber);
            
            console.log(`✅ Reminder saved: "${activity}" for ${dateTime.format('MMM D [at] h:mm A')}`);

        } catch (error) {
            console.error('Save reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to save reminder. Please try again.');
        }
    }

    async listReminders(message, userNumber) {
        try {
            const reminders = await this.db.getUserReminders(userNumber, 20);
            
            if (reminders.length === 0) {
                await this.sendBotMessage(message.key.remoteJid, `
╔═══════════════════════════════════════╗
║            📝 NO REMINDERS             ║
╚═══════════════════════════════════════╝

🤷‍♂️ *You don't have any reminders yet.*

💡 *Get started:*
• Type /reminder to create your first one
• Type /help to see all commands`);
                return;
            }

            let listMessage = `
╔═══════════════════════════════════════╗
║           📋 YOUR REMINDERS            ║
╚═══════════════════════════════════════╝

📊 *Total: ${reminders.length} reminder${reminders.length > 1 ? 's' : ''}*

`;

            const pendingReminders = reminders.filter(r => !r.is_sent);
            const sentReminders = reminders.filter(r => r.is_sent);

            if (pendingReminders.length > 0) {
                listMessage += `⏳ *PENDING (${pendingReminders.length}):*\n\n`;
                pendingReminders.forEach((reminder, index) => {
                    const reminderTime = moment(reminder.reminder_time);
                    const timeFromNow = reminderTime.fromNow();
                    
                    listMessage += `🔸 *#${reminder.id}* ${reminder.message}\n`;
                    listMessage += `   📅 ${reminderTime.format('MMM D, YYYY [at] h:mm A')}\n`;
                    listMessage += `   ⏰ ${timeFromNow}\n\n`;
                });
            }

            if (sentReminders.length > 0) {
                listMessage += `✅ *COMPLETED (${sentReminders.length}):*\n\n`;
                sentReminders.slice(0, 5).forEach((reminder, index) => {
                    const reminderTime = moment(reminder.reminder_time);
                    
                    listMessage += `🔹 *#${reminder.id}* ${reminder.message}\n`;
                    listMessage += `   📅 ${reminderTime.format('MMM D, YYYY [at] h:mm A')}\n\n`;
                });
                
                if (sentReminders.length > 5) {
                    listMessage += `   ... and ${sentReminders.length - 5} more\n\n`;
                }
            }

            listMessage += `
╔═══════════════════════════════════════╗
║            🚀 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

• /reminder - Create new reminder
• /delete - Remove specific reminder by ID
• /clear - Remove all reminders`;
            
            await this.sendBotMessage(message.key.remoteJid, listMessage);

        } catch (error) {
            console.error('List reminders error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to retrieve reminders.');
        }
    }

    async startDeleteFlow(message, userNumber) {
        const reminders = await this.db.getUserReminders(userNumber, 10);
        
        if (reminders.length === 0) {
            await this.sendBotMessage(message.key.remoteJid, 
                '📝 No reminders to delete. Create one with /reminder first.');
            return;
        }

        this.userSessions.set(userNumber, {
            flow: 'delete',
            step: 'select',
            data: { reminders },
            startTime: Date.now()
        });

        let deleteMessage = `
╔═══════════════════════════════════════╗
║           🗑️ DELETE REMINDER           ║
╚═══════════════════════════════════════╝

📋 *Select reminder to delete:*

`;

        reminders.forEach((reminder, index) => {
            const reminderTime = moment(reminder.reminder_time);
            const status = reminder.is_sent ? '✅' : '⏳';
            
            deleteMessage += `${status} *#${reminder.id}* ${reminder.message}\n`;
            deleteMessage += `   📅 ${reminderTime.format('MMM D [at] h:mm A')}\n\n`;
        });

        deleteMessage += `💬 *Type the ID number* (e.g., "${reminders[0].id}") to delete\n❌ *Type "cancel"* to abort`;

        await this.sendBotMessage(message.key.remoteJid, deleteMessage);
    }

    async handleDeleteStep(message, messageText, session, userNumber) {
        if (messageText.toLowerCase() === 'cancel') {
            this.userSessions.delete(userNumber);
            await this.sendBotMessage(message.key.remoteJid, '❌ Delete operation cancelled.');
            return;
        }

        const reminderId = parseInt(messageText.trim());
        const reminder = session.data.reminders.find(r => r.id === reminderId);

        if (!reminder) {
            await this.sendBotMessage(message.key.remoteJid, 
                `❌ Reminder #${reminderId} not found. Please enter a valid ID from the list.`);
            return;
        }

        try {
            await this.db.deleteReminder(reminderId);
            
            await this.sendBotMessage(message.key.remoteJid, `
╔═══════════════════════════════════════╗
║           ✅ DELETED SUCCESS            ║
╚═══════════════════════════════════════╝

🗑️ *Reminder #${reminderId} deleted successfully*

📝 *Deleted:* ${reminder.message}
📅 *Was scheduled:* ${moment(reminder.reminder_time).format('MMM D [at] h:mm A')}

💡 *Type /list to see remaining reminders*`);
            
            this.userSessions.delete(userNumber);
            console.log(`🗑️ Reminder deleted: #${reminderId} - "${reminder.message}"`);

        } catch (error) {
            console.error('Delete reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to delete reminder. Please try again.');
        }
    }

    async startClearFlow(message, userNumber) {
        const reminders = await this.db.getUserReminders(userNumber);
        
        if (reminders.length === 0) {
            await this.sendBotMessage(message.key.remoteJid, 
                '📝 No reminders to clear. Your list is already empty.');
            return;
        }

        this.userSessions.set(userNumber, {
            flow: 'clear',
            step: 'confirm',
            data: { count: reminders.length },
            startTime: Date.now()
        });

        const clearMessage = `
╔═══════════════════════════════════════╗
║           ⚠️ CLEAR ALL REMINDERS       ║
╚═══════════════════════════════════════╝

🚨 *WARNING: This will delete ALL your reminders!*

📊 *You have ${reminders.length} reminder${reminders.length > 1 ? 's' : ''}:*
• Pending reminders will be cancelled
• Completed reminders will be removed
• This action cannot be undone

⚠️ *Are you absolutely sure?*

✅ *Type "DELETE ALL"* to confirm (case sensitive)
❌ *Type anything else* to cancel`;

        await this.sendBotMessage(message.key.remoteJid, clearMessage);
    }

    async handleClearStep(message, messageText, session, userNumber) {
        if (messageText.trim() === 'DELETE ALL') {
            try {
                await this.db.clearAllReminders(userNumber);
                
                await this.sendBotMessage(message.key.remoteJid, `
╔═══════════════════════════════════════╗
║           🧹 ALL CLEARED               ║
╚═══════════════════════════════════════╝

✅ *Successfully deleted all ${session.data.count} reminders*

🎯 *Your reminder list is now clean*
💡 *Type /reminder to create a new one*`);
                
                console.log(`🧹 All reminders cleared for user: ${userNumber}`);

            } catch (error) {
                console.error('Clear all reminders error:', error.message);
                await this.sendBotMessage(message.key.remoteJid, 
                    '❌ Failed to clear reminders. Please try again.');
            }
        } else {
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Clear operation cancelled. Your reminders are safe.');
        }
        
        this.userSessions.delete(userNumber);
    }

    async showHelp(message) {
        const helpMessage = `
╔═══════════════════════════════════════╗
║          🤖 REMINDER BOT HELP          ║
╚═══════════════════════════════════════╝

🎯 *I help you remember important tasks by sending WhatsApp messages at scheduled times.*

╔═══════════════════════════════════════╗
║            📋 COMMANDS                 ║
╚═══════════════════════════════════════╝

🔸 */reminder* or */new*
   Create a new reminder

🔸 */list* or */view*
   View all your reminders

🔸 */delete*
   Delete a specific reminder by ID

🔸 */clear* or */erase*
   Delete ALL reminders (with confirmation)

🔸 */help*
   Show this help menu

🔸 */cancel*
   Cancel current operation

╔═══════════════════════════════════════╗
║            🚀 HOW IT WORKS             ║
╚═══════════════════════════════════════╝

1️⃣ *Create:* Use /reminder to set up a task
2️⃣ *Schedule:* Choose date and time
3️⃣ *Relax:* I'll message you at the right time
4️⃣ *Respond:* Mark done, reschedule, or snooze

💡 *Pro tip:* Use natural language like "tomorrow at 2 PM" or "next monday at 9 AM"`;

        await this.sendBotMessage(message.key.remoteJid, helpMessage);
    }

    async cancelCurrentFlow(message, userNumber) {
        if (this.userSessions.has(userNumber)) {
            this.userSessions.delete(userNumber);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Current operation cancelled. Type /help to see available commands.');
        } else {
            await this.sendBotMessage(message.key.remoteJid, 
                '💡 No active operation to cancel. Type /help to see available commands.');
        }
    }

    async sendBotMessage(jid, text) {
        try {
            if (!this.sock || !this.isReady) {
                console.log('⚠️ Bot not ready, message not sent');
                return;
            }
            
            // Prefix all bot messages with "RBot" for easy filtering
            const botMessage = `RBot ${text}`;
            await this.sock.sendMessage(jid, { text: botMessage });
            console.log('📤 Bot message sent successfully');
        } catch (error) {
            console.error('Send message error:', error.message);
        }
    }

    // Enhanced date parsing with more formats
    parseDate(dateString) {
        const input = dateString.toLowerCase().trim();
        
        // Relative dates
        if (input === 'today') return moment();
        if (input === 'tomorrow') return moment().add(1, 'day');
        if (input === 'day after tomorrow') return moment().add(2, 'days');
        
        // Next weekdays
        const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < weekdays.length; i++) {
            if (input.includes(`next ${weekdays[i]}`)) {
                return moment().day(i + 7);
            }
            if (input === weekdays[i]) {
                const nextDay = moment().day(i);
                return nextDay.isBefore(moment()) ? nextDay.add(7, 'days') : nextDay;
            }
        }
        
        // Date formats
        const formats = [
            'YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY',
            'MMMM D', 'MMM D', 'MMMM D, YYYY', 'MMM D, YYYY',
            'D MMMM', 'D MMM', 'D MMMM YYYY', 'D MMM YYYY'
        ];
        
        for (const format of formats) {
            const parsed = moment(dateString, format, true);
            if (parsed.isValid()) {
                if (!format.includes('YYYY')) {
                    parsed.year(moment().year());
                    if (parsed.isBefore(moment(), 'day')) {
                        parsed.add(1, 'year');
                    }
                }
                return parsed;
            }
        }
        
        return null;
    }

    // Enhanced time parsing
    parseTime(timeString, date) {
        const input = timeString.toLowerCase().trim();
        
        // Special cases
        if (input === 'noon') return date.clone().hour(12).minute(0).second(0);
        if (input === 'midnight') return date.clone().hour(0).minute(0).second(0);
        if (input === 'morning') return date.clone().hour(9).minute(0).second(0);
        if (input === 'afternoon') return date.clone().hour(14).minute(0).second(0);
        if (input === 'evening') return date.clone().hour(18).minute(0).second(0);
        if (input === 'night') return date.clone().hour(21).minute(0).second(0);
        
        // Time formats
        const timeFormats = [
            'h:mm A', 'h A', 'ha', 'h:mm a', 'h a',
            'HH:mm', 'H:mm', 'HH', 'H'
        ];
        
        for (const format of timeFormats) {
            const timeOnly = moment(timeString, format, true);
            if (timeOnly.isValid()) {
                return date.clone()
                    .hour(timeOnly.hour())
                    .minute(timeOnly.minute())
                    .second(0)
                    .millisecond(0);
            }
        }
        
        return null;
    }

    startReminderScheduler() {
        cron.schedule('* * * * *', async () => {
            try {
                if (!this.isReady) return;
                
                const pendingReminders = await this.db.getPendingReminders();
                
                for (const reminder of pendingReminders) {
                    await this.sendReminderNotification(reminder);
                    await this.db.markReminderAsSent(reminder.id);
                }
            } catch (error) {
                console.error('Scheduler error:', error.message);
            }
        });

        console.log('⏰ Reminder scheduler started');
    }

    startCleanupScheduler() {
        // Clean up old completed reminders every day at 2 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                const cutoffDate = moment().subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');
                await this.db.cleanupOldReminders(cutoffDate);
                console.log('🧹 Old reminders cleaned up');
            } catch (error) {
                console.error('Cleanup error:', error.message);
            }
        });

        console.log('🧹 Cleanup scheduler started');
    }

    async sendReminderNotification(reminder) {
        try {
            const reminderMessage = `
╔═══════════════════════════════════════╗
║              🔔 REMINDER!              ║
╚═══════════════════════════════════════╝

⏰ *It's time for your reminder!*

📝 *Task:* ${reminder.message}
🆔 *ID:* #${reminder.id}
🕐 *Scheduled:* ${moment(reminder.reminder_time).format('h:mm A')}
📅 *Set on:* ${moment(reminder.created_at).format('MMM D, YYYY')}

╔═══════════════════════════════════════╗
║            🎯 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

Reply with:
• *"done"* - Mark as completed
• *"reschedule"* - Set new date and time
• *"delete"* - Remove this reminder

💡 *Or type /reminder to create a new one*`;

            await this.sendBotMessage(reminder.chat_id, reminderMessage);
            console.log(`🔔 Reminder sent: #${reminder.id} - "${reminder.message}"`);
        } catch (error) {
            console.error('Send reminder error:', error.message);
        }
    }

    async handleReminderResponse(message, messageText, userNumber) {
        const response = messageText.toLowerCase().trim();
        
        // Only handle specific reminder responses
        if (!['done', 'reschedule', 'delete'].includes(response)) {
            return; // Ignore other messages
        }

        try {
            // Get the most recent sent reminder for this user
            const recentReminders = await this.db.getUserReminders(userNumber, 5);
            const lastSentReminder = recentReminders.find(r => r.is_sent);
            
            if (!lastSentReminder) {
                await this.sendBotMessage(message.key.remoteJid, 
                    '❌ No recent reminder found to respond to.');
                return;
            }

            switch (response) {
                case 'done':
                    await this.handleDoneResponse(message, lastSentReminder, userNumber);
                    break;
                case 'reschedule':
                    await this.startRescheduleFlow(message, lastSentReminder, userNumber);
                    break;
                case 'delete':
                    await this.handleDeleteResponse(message, lastSentReminder, userNumber);
                    break;
            }
        } catch (error) {
            console.error('Handle reminder response error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Something went wrong processing your response.');
        }
    }

    async handleDoneResponse(message, reminder, userNumber) {
        try {
            // Just acknowledge completion, reminder stays marked as sent
            const doneMessage = `
╔═══════════════════════════════════════╗
║              ✅ COMPLETED              ║
╚═══════════════════════════════════════╝

🎉 *Great job! Task completed:*

📝 *Task:* ${reminder.message}
🆔 *ID:* #${reminder.id}
⏰ *Completed:* ${moment().format('MMM D [at] h:mm A')}

💪 *Keep up the good work!*

💡 *Type /reminder to create your next task*`;

            await this.sendBotMessage(message.key.remoteJid, doneMessage);
            console.log(`✅ Reminder completed: #${reminder.id} - "${reminder.message}"`);
        } catch (error) {
            console.error('Handle done response error:', error.message);
        }
    }

    async startRescheduleFlow(message, reminder, userNumber) {
        // Start reschedule session
        this.userSessions.set(userNumber, {
            flow: 'reschedule',
            step: 'date',
            data: { 
                originalReminder: reminder,
                activity: reminder.message 
            },
            startTime: Date.now()
        });

        const rescheduleMessage = `
╔═══════════════════════════════════════╗
║            📅 RESCHEDULE REMINDER      ║
╚═══════════════════════════════════════╝

🔄 *Rescheduling:* ${reminder.message}

✨ *Step 1 of 2: When should I remind you instead?*

📋 *Smart date formats:*
┌─────────────────────────────────────┐
│ • today, tomorrow                   │
│ • next monday, next friday          │
│ • january 20, march 15              │
│ • 2025-06-10, 15/06/2025           │
└─────────────────────────────────────┘

📅 *Type the new date:*`;

        await this.sendBotMessage(message.key.remoteJid, rescheduleMessage);
    }

    async handleDeleteResponse(message, reminder, userNumber) {
        try {
            await this.db.deleteReminder(reminder.id, userNumber);
            
            const deleteMessage = `
╔═══════════════════════════════════════╗
║              🗑️ DELETED                ║
╚═══════════════════════════════════════╝

✅ *Reminder deleted successfully:*

📝 *Task:* ${reminder.message}
🆔 *ID:* #${reminder.id}
🗑️ *Deleted:* ${moment().format('MMM D [at] h:mm A')}

💡 *Type /reminder to create a new one*`;

            await this.sendBotMessage(message.key.remoteJid, deleteMessage);
            console.log(`🗑️ Reminder deleted via response: #${reminder.id} - "${reminder.message}"`);
        } catch (error) {
            console.error('Handle delete response error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to delete reminder. Please try again.');
        }
    }

    async handleRescheduleStep(message, messageText, session, userNumber) {
        switch (session.step) {
            case 'date':
                const parsedDate = this.parseDate(messageText);
                
                if (!parsedDate) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        `❌ Couldn't understand date: "${messageText}"\n\n🔄 Please try formats like:\n• today, tomorrow\n• next monday\n• january 20\n• 2025-06-10`);
                    return;
                }

                if (parsedDate.isBefore(moment(), 'day')) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please choose a future date. Can\'t reschedule to the past!');
                    return;
                }

                session.data.date = parsedDate;
                session.step = 'time';

                const timeMessage = `
✅ *New date saved:* ${parsedDate.format('dddd, MMMM Do, YYYY')}

╔═══════════════════════════════════════╗
║             🕐 SELECT TIME             ║
╚═══════════════════════════════════════╝

✨ *Step 2 of 2: What time should I remind you?*

📋 *Time formats:*
┌─────────────────────────────────────┐
│ • 9 AM, 2:30 PM, 11:45 PM          │
│ • 09:00, 14:30, 23:45              │
│ • noon, midnight                    │
└─────────────────────────────────────┘

🕐 *Type the new time:*`;

                await this.sendBotMessage(message.key.remoteJid, timeMessage);
                break;

            case 'time':
                const parsedTime = this.parseTime(messageText, session.data.date);
                
                if (!parsedTime) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        `❌ Couldn't understand time: "${messageText}"\n\n🔄 Please try formats like:\n• 9 AM, 2:30 PM\n• 14:30, 09:00\n• noon, midnight`);
                    return;
                }

                if (parsedTime.isBefore(moment())) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please choose a future time. Can\'t reschedule to the past!');
                    return;
                }

                // Update the reminder in database
                try {
                    await this.db.updateReminderTime(
                        session.data.originalReminder.id, 
                        parsedTime.format('YYYY-MM-DD HH:mm:ss')
                    );

                    const successMessage = `
╔═══════════════════════════════════════╗
║            🔄 RESCHEDULED              ║
╚═══════════════════════════════════════╝

✅ *Reminder rescheduled successfully!*

📝 *Task:* ${session.data.activity}
🆔 *ID:* #${session.data.originalReminder.id}
📅 *New schedule:* ${parsedTime.format('dddd, MMMM Do [at] h:mm A')}
⏱️ *That's:* ${parsedTime.fromNow()}

🎯 *I'll remind you at the new time!*

💡 *Type /list to see all your reminders*`;

                    await this.sendBotMessage(message.key.remoteJid, successMessage);
                    this.userSessions.delete(userNumber);
                    
                    console.log(`🔄 Reminder rescheduled: #${session.data.originalReminder.id} to ${parsedTime.format('MMM D [at] h:mm A')}`);

                } catch (error) {
                    console.error('Reschedule save error:', error.message);
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Failed to reschedule reminder. Please try again.');
                }
                break;
        }
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down Advanced Reminder Bot...');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error.message);
});

console.log('🚀 Starting Advanced WhatsApp Reminder Bot...');
new AdvancedReminderBot();
