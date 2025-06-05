const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const moment = require('moment');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

class AdvancedReminderBot {
    constructor(sock, db, userId) {
        this.sock = sock;
        this.db = db;
        this.userId = userId;
        this.userSessions = new Map();
        this.autoDeleteMessages = new Map();
        this.isReady = false;
        this.authenticatedPhoneNumber = null;
        this.startTime = Date.now();
        
        if (this.sock) {
            this.isReady = true;
            this.authenticatedPhoneNumber = this.sock.user?.id?.split(':')[0];
        }
        
        this.startReminderScheduler();
        this.startAutoDeleteScheduler();
        this.startRenewalChecker();
    }

    // Method to update socket connection (used by multi-bot-manager)
    updateSocket(sock) {
        this.sock = sock;
        if (sock) {
            this.isReady = true;
            this.authenticatedPhoneNumber = sock.user?.id?.split(':')[0];
        } else {
            this.isReady = false;
            this.authenticatedPhoneNumber = null;
        }
    }

    // Method for standalone initialization (if used independently)
    static async createStandaloneBot(authDir = './baileys_auth') {
        const Database = require('./database');
        const db = new Database();
        
        try {
            const mongoUri = process.env.MONGODB_URI;
            if (!mongoUri) {
                throw new Error('MONGODB_URI environment variable not set');
            }
            await db.connect(mongoUri);
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        const sock = makeWASocket({
            auth: state,
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['Advanced Reminder Bot', 'Desktop', '2.0.0'],
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            markOnlineOnConnect: false
        });

        const bot = new AdvancedReminderBot(sock, db, 'standalone');

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (update) => {
            bot.handleConnectionUpdate(update);
        });
        sock.ev.on('messages.upsert', (messageUpdate) => {
            bot.handleMessages(messageUpdate);
        });

        return bot;
    }

    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        try {
            if (qr) {
                console.log(`\n📱 QR Code for ${this.userId}:`);
                qrcode.generate(qr, { small: true });
                console.log(`📱 User ${this.userId} - Scan the QR code above\n`);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log(`🔄 Connection lost for ${this.userId}, will reconnect...`);
                } else {
                    console.log(`📴 User ${this.userId} logged out`);
                }
                
                this.isReady = false;
                this.authenticatedPhoneNumber = null;
            } 
            
            if (connection === 'open') {
                this.isReady = true;
                this.authenticatedPhoneNumber = this.sock.user?.id?.split(':')[0];
                
                console.log(`🎉 Bot ready for user: ${this.userId}`);
                console.log(`📱 Authenticated as: ${this.authenticatedPhoneNumber}`);
            }

        } catch (error) {
            console.error(`Connection update error for ${this.userId}:`, error.message);
        }
    }

    async handleMessages(messageUpdate) {
        try {
            if (!this.sock || !messageUpdate.messages || messageUpdate.messages.length === 0) return;
            
            const message = messageUpdate.messages[0];
            if (!message || !message.message) return;

            const messageText = this.extractMessageText(message);
            const chatId = message.key.remoteJid;
            const senderPhoneNumber = chatId.split('@')[0];
            const isGroupChat = chatId.endsWith('@g.us');
            
            // Skip bot's own messages
            if (!messageText || messageText.startsWith('RBot')) {
                return;
            }

            // Only respond to the authenticated user (owner of this bot instance)
            if (!this.authenticatedPhoneNumber) {
                this.authenticatedPhoneNumber = this.sock.user?.id?.split(':')[0];
            }

            // In group chats, check if the sender is the bot owner
            let userNumber;
            if (isGroupChat) {
                userNumber = message.key.participant?.split('@')[0] || senderPhoneNumber;
            } else {
                userNumber = senderPhoneNumber;
            }

            // Only respond to the bot owner
            if (userNumber !== this.authenticatedPhoneNumber) {
                return;
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
            console.error(`Message handling error for ${this.userId}:`, error.message);
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
            case '/medicine':
                await this.startMedicineReminderFlow(message, userNumber, chatId);
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
                case 'medicine':
                    await this.handleMedicineStep(message, messageText, session, userNumber);
                    break;
                case 'renewal':
                    await this.handleRenewalStep(message, messageText, session, userNumber);
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
            
            console.log(`✅ Reminder saved for ${this.userId}: "${activity}" for ${dateTime.format('MMM D [at] h:mm A')}`);

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

    async startMedicineReminderFlow(message, userNumber) {
        this.userSessions.delete(userNumber);
        
        this.userSessions.set(userNumber, {
            flow: 'medicine',
            step: 'medicine_name',
            data: {},
            startTime: Date.now()
        });

        const medicineMessage = `
╔═══════════════════════════════════════╗
║         💊 MEDICINE REMINDER           ║
╚═══════════════════════════════════════╝

✨ *Step 1 of 4: What medicine should I remind you to take?*

📋 *Examples:*
┌─────────────────────────────────────┐
│ • Vitamin D tablet                  │
│ • Blood pressure medication         │
│ • Insulin injection                 │
│ • Omega 3 capsule                   │
│ • Pain relief tablet                │
└─────────────────────────────────────┘

💊 *Type the medicine name:*`;

        await this.sendBotMessage(message.key.remoteJid, medicineMessage);
    }

    async handleMedicineStep(message, messageText, session, userNumber) {
        switch (session.step) {
            case 'medicine_name':
                if (messageText.trim().length < 3) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please enter a valid medicine name (at least 3 characters).');
                    return;
                }

                session.data.medicineName = messageText.trim();
                session.step = 'frequency';

                const frequencyMessage = `
✅ *Medicine saved:* "${messageText}"

╔═══════════════════════════════════════╗
║            📅 SELECT FREQUENCY         ║
╚═══════════════════════════════════════╝

✨ *Step 2 of 4: How often should I remind you?*

📋 *Frequency options:*
┌─────────────────────────────────────┐
│ 1. daily - Every day                │
│ 2. weekdays - Monday to Friday only │
│ 3. specific - Choose specific days  │
│ 4. once - One-time reminder         │
└─────────────────────────────────────┘

💡 *Type: daily, weekdays, specific, or once*`;

                await this.sendBotMessage(message.key.remoteJid, frequencyMessage);
                break;

            case 'frequency':
                const frequency = messageText.toLowerCase().trim();
                
                if (!['daily', 'weekdays', 'specific', 'once'].includes(frequency)) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Please choose: daily, weekdays, specific, or once');
                    return;
                }

                session.data.frequency = frequency;

                if (frequency === 'specific') {
                    session.step = 'specific_days';
                    
                    const daysMessage = `
✅ *Frequency:* Custom days

╔═══════════════════════════════════════╗
║           📋 SELECT SPECIFIC DAYS      ║
╚═══════════════════════════════════════╝

✨ *Step 3 of 4: Which days of the week?*

📅 *Choose days (separate with commas):*
┌─────────────────────────────────────┐
│ • monday, tuesday, wednesday        │
│ • mon, tue, wed, thu, fri           │
│ • saturday, sunday                  │
│ • all combinations allowed          │
└─────────────────────────────────────┘

💡 *Example: monday, wednesday, friday*`;

                    await this.sendBotMessage(message.key.remoteJid, daysMessage);
                } else {
                    session.step = 'time';
                    await this.askMedicineTime(message, session);
                }
                break;

            case 'specific_days':
                const daysInput = messageText.toLowerCase().trim();
                const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                                 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                
                const inputDays = daysInput.split(',').map(d => d.trim());
                const selectedDays = [];
                
                for (const day of inputDays) {
                    if (validDays.includes(day)) {
                        const fullDay = day.length <= 3 ? 
                            ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][
                                ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(day)
                            ] : day;
                        
                        if (!selectedDays.includes(fullDay)) {
                            selectedDays.push(fullDay);
                        }
                    }
                }

                if (selectedDays.length === 0) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ No valid days found. Please use day names like: monday, tuesday, etc.');
                    return;
                }

                session.data.specificDays = selectedDays;
                session.step = 'time';
                
                const confirmDays = selectedDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
                await this.sendBotMessage(message.key.remoteJid, `✅ *Selected days:* ${confirmDays}`);
                await this.askMedicineTime(message, session);
                break;

            case 'time':
                const timeInput = messageText.trim();
                const times = timeInput.split(',').map(t => t.trim());
                const validTimes = [];

                for (const timeStr of times) {
                    const parsedTime = this.parseTimeOnly(timeStr);
                    if (parsedTime) {
                        validTimes.push(parsedTime);
                    }
                }

                if (validTimes.length === 0) {
                    await this.sendBotMessage(message.key.remoteJid, 
                        `❌ Couldn't understand time: "${timeInput}"\n\n🔄 Please try formats like:\n• 9 AM, 2:30 PM\n• 14:30, 09:00\n• For multiple times: 8 AM, 2 PM, 8 PM`);
                    return;
                }

                session.data.times = validTimes;
                session.step = 'confirm';

                await this.showMedicineConfirmation(message, session);
                break;

            case 'confirm':
                const response = messageText.toLowerCase().trim();
                
                if (response === 'yes' || response === 'y') {
                    await this.saveMedicineReminders(message, session, userNumber);
                } else if (response === 'no' || response === 'n') {
                    this.userSessions.delete(userNumber);
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Medicine reminder cancelled. Type /medicine to create a new one.');
                } else {
                    await this.sendBotMessage(message.key.remoteJid, 
                        '🤔 Please respond with "yes" to save or "no" to cancel.');
                }
                break;
        }
    }

    async askMedicineTime(message, session) {
        const timeMessage = `
╔═══════════════════════════════════════╗
║             🕐 SELECT TIME(S)          ║
╚═══════════════════════════════════════╝

✨ *Step ${session.data.frequency === 'specific' ? '4' : '3'} of 4: What time(s) should I remind you?*

📋 *Time formats:*
┌─────────────────────────────────────┐
│ • Single: 9 AM, 2:30 PM, 22:00     │
│ • Multiple: 8 AM, 2 PM, 8 PM        │
│ • Special: morning, noon, evening    │
└─────────────────────────────────────┘

💡 *For multiple times, separate with commas*
🕐 *Type the time(s):*`;

        await this.sendBotMessage(message.key.remoteJid, timeMessage);
    }

    async showMedicineConfirmation(message, session) {
        const { medicineName, frequency, specificDays, times } = session.data;
        
        let frequencyText = '';
        switch (frequency) {
            case 'daily':
                frequencyText = 'Every day';
                break;
            case 'weekdays':
                frequencyText = 'Monday to Friday only';
                break;
            case 'specific':
                frequencyText = specificDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
                break;
            case 'once':
                frequencyText = 'One-time only';
                break;
        }

        const timesText = times.map(t => moment(t, 'HH:mm').format('h:mm A')).join(', ');

        const confirmMessage = `
╔═══════════════════════════════════════╗
║            ✨ CONFIRMATION             ║
╚═══════════════════════════════════════╝

🎯 *Review your medicine reminder:*

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${frequencyText}
🕐 *Time(s):* ${timesText}
📊 *Total reminders:* ${this.calculateTotalReminders(session.data)}

╔═══════════════════════════════════════╗
║              📝 HOW IT WORKS           ║
╚═══════════════════════════════════════╝

🤖 *I will send WhatsApp reminders* with:
• Medicine name and dosage time
• Options to mark as taken or skip
• Automatic scheduling for recurring reminders

✅ *Type "yes" to save these reminders*
❌ *Type "no" to cancel*`;

        await this.sendBotMessage(message.key.remoteJid, confirmMessage);
    }

    calculateTotalReminders(data) {
        const { frequency, specificDays, times } = data;
        let days = 0;
        
        switch (frequency) {
            case 'daily':
                days = 7;
                break;
            case 'weekdays':
                days = 5;
                break;
            case 'specific':
                days = specificDays.length;
                break;
            case 'once':
                days = 1;
                break;
        }
        
        return `${times.length} time(s) × ${days} day(s) per week`;
    }

    parseTimeOnly(timeString) {
        const input = timeString.toLowerCase().trim();
        
        if (input === 'morning') return '09:00';
        if (input === 'noon') return '12:00';
        if (input === 'afternoon') return '14:00';
        if (input === 'evening') return '18:00';
        if (input === 'night') return '21:00';
        
        const timeFormats = [
            'h:mm A', 'h A', 'ha', 'h:mm a', 'h a',
            'HH:mm', 'H:mm', 'HH', 'H'
        ];
        
        for (const format of timeFormats) {
            const timeOnly = moment(timeString, format, true);
            if (timeOnly.isValid()) {
                return timeOnly.format('HH:mm');
            }
        }
        
        return null;
    }

    async saveMedicineReminders(message, session, userNumber) {
        try {
            const { medicineName, frequency, specificDays, times } = session.data;
            const savedReminders = [];
            
            let targetDays = [];
            
            if (frequency === 'daily') {
                targetDays = [0, 1, 2, 3, 4, 5, 6];
            } else if (frequency === 'weekdays') {
                targetDays = [1, 2, 3, 4, 5];
            } else if (frequency === 'specific') {
                const dayMap = {
                    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
                    'thursday': 4, 'friday': 5, 'saturday': 6
                };
                targetDays = specificDays.map(day => dayMap[day]);
            } else if (frequency === 'once') {
                targetDays = [moment().day()];
            }

            const weeksToCreate = frequency === 'once' ? 1 : 4;
            
            for (let week = 0; week < weeksToCreate; week++) {
                for (const dayOfWeek of targetDays) {
                    for (const time of times) {
                        const reminderDate = moment().startOf('week').add(week, 'weeks').day(dayOfWeek);
                        const [hour, minute] = time.split(':');
                        reminderDate.hour(parseInt(hour)).minute(parseInt(minute)).second(0);
                        
                        if (week === 0 && reminderDate.isBefore(moment())) {
                            continue;
                        }

                        const reminderText = `💊 Take ${medicineName}`;
                        const recurrencePattern = `${medicineName}-${frequency}-${JSON.stringify(targetDays)}-${JSON.stringify(times)}`;
                        
                        const reminderId = await this.db.addReminder(
                            userNumber,
                            'Medicine',
                            reminderText,
                            reminderDate.format('YYYY-MM-DD HH:mm:ss'),
                            message.key.remoteJid,
                            true,
                            recurrencePattern
                        );
                        
                        savedReminders.push({
                            id: reminderId,
                            time: reminderDate.format('ddd MMM D [at] h:mm A')
                        });
                    }
                }
            }

            const successMessage = `
╔═══════════════════════════════════════╗
║              🎉 SUCCESS!               ║
╚═══════════════════════════════════════╝

✅ *${savedReminders.length} medicine reminders created!*

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${this.getFrequencyDescription(session.data)}
🕐 *Times:* ${times.map(t => moment(t, 'HH:mm').format('h:mm A')).join(', ')}

╔═══════════════════════════════════════╗
║           📅 NEXT FEW REMINDERS        ║
╚═══════════════════════════════════════╝

${savedReminders.slice(0, 5).map((r, i) => `${i + 1}. ${r.time}`).join('\n')}
${savedReminders.length > 5 ? `\n... and ${savedReminders.length - 5} more` : ''}

╔═══════════════════════════════════════╗
║            🚀 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

• /medicine - Create another medicine reminder
• /list - View all your reminders
• /delete - Remove specific reminders
• /help - See all commands`;

            await this.sendBotMessage(message.key.remoteJid, successMessage);
            this.userSessions.delete(userNumber);
            
            console.log(`💊 Medicine reminders saved for ${this.userId}: "${medicineName}" - ${savedReminders.length} reminders created`);

        } catch (error) {
            console.error('Save medicine reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to save medicine reminders. Please try again.');
        }
    }

    getFrequencyDescription(data) {
        const { frequency, specificDays } = data;
        
        switch (frequency) {
            case 'daily':
                return 'Every day';
            case 'weekdays':
                return 'Monday to Friday';
            case 'specific':
                return specificDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
            case 'once':
                return 'One-time only';
            default:
                return frequency;
        }
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
            await this.db.deleteReminder(reminderId, userNumber);
            
            await this.sendBotMessage(message.key.remoteJid, `
╔═══════════════════════════════════════╗
║           ✅ DELETED SUCCESS            ║
╚═══════════════════════════════════════╝

🗑️ *Reminder #${reminderId} deleted successfully*

📝 *Deleted:* ${reminder.message}
📅 *Was scheduled:* ${moment(reminder.reminder_time).format('MMM D [at] h:mm A')}

💡 *Type /list to see remaining reminders*`);
            
            this.userSessions.delete(userNumber);
            console.log(`🗑️ Reminder deleted for ${this.userId}: #${reminderId} - "${reminder.message}"`);

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
                    
                    console.log(`🔄 Reminder rescheduled for ${this.userId}: #${session.data.originalReminder.id} to ${parsedTime.format('MMM D [at] h:mm A')}`);

                } catch (error) {
                    console.error('Reschedule save error:', error.message);
                    await this.sendBotMessage(message.key.remoteJid, 
                        '❌ Failed to reschedule reminder. Please try again.');
                }
                break;
        }
    }

    async handleRenewalStep(message, messageText, session, userNumber) {
        const response = messageText.toLowerCase().trim();
        const { recurrencePattern, medicineName, frequency } = session.data;
        
        switch (response) {
            case 'renew':
                await this.renewRecurringReminder(message, session, userNumber);
                break;
            case 'modify':
                await this.startModifyRenewal(message, session, userNumber);
                break;
            case 'stop':
                await this.stopRecurringReminder(message, session, userNumber);
                break;
            case 'later':
                await this.scheduleRenewalReminder(message, session, userNumber);
                break;
            default:
                await this.sendBotMessage(message.key.remoteJid, 
                    '🤔 Please reply with: "renew", "modify", "stop", or "later"');
        }
    }

    async renewRecurringReminder(message, session, userNumber) {
        try {
            const { recurrencePattern, medicineName } = session.data;
            
            // Parse the recurrence pattern to recreate reminders
            const patternParts = recurrencePattern.split('-');
            const frequency = patternParts[1];
            const targetDays = JSON.parse(patternParts[2]);
            const times = JSON.parse(patternParts[3]);
            
            const savedReminders = [];
            
            // Create reminders for next 4 weeks
            for (let week = 0; week < 4; week++) {
                for (const dayOfWeek of targetDays) {
                    for (const time of times) {
                        const reminderDate = moment().startOf('week').add(week + 4, 'weeks').day(dayOfWeek);
                        const [hour, minute] = time.split(':');
                        reminderDate.hour(parseInt(hour)).minute(parseInt(minute)).second(0);
                        
                        const reminderText = `💊 Take ${medicineName}`;
                        
                        const reminderId = await this.db.addReminder(
                            userNumber,
                            'Medicine',
                            reminderText,
                            reminderDate.format('YYYY-MM-DD HH:mm:ss'),
                            message.key.remoteJid,
                            true,
                            recurrencePattern
                        );
                        
                        savedReminders.push({
                            id: reminderId,
                            time: reminderDate.format('ddd MMM D [at] h:mm A')
                        });
                    }
                }
            }

            const successMessage = `
╔═══════════════════════════════════════╗
║            ✅ RENEWAL SUCCESS          ║
╚═══════════════════════════════════════╝

🎉 *${savedReminders.length} new reminders created!*

💊 *Medicine:* ${medicineName}
📅 *Extended for:* 4 more weeks
🔄 *Pattern:* Same as before

╔═══════════════════════════════════════╗
║           📅 NEXT FEW REMINDERS        ║
╚═══════════════════════════════════════╝

${savedReminders.slice(0, 3).map((r, i) => `${i + 1}. ${r.time}`).join('\n')}
... and ${savedReminders.length - 3} more

💡 *I'll check again when you have 5 reminders left!*`;

            await this.sendBotMessage(message.key.remoteJid, successMessage);
            this.userSessions.delete(userNumber);
            
            console.log(`✅ Renewed ${savedReminders.length} reminders for ${medicineName}`);
            
        } catch (error) {
            console.error('Renew reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to renew reminders. Please try creating new ones with /medicine');
        }
    }

    async startModifyRenewal(message, session, userNumber) {
        // Start medicine reminder flow but with modify context
        this.userSessions.set(userNumber, {
            flow: 'medicine',
            step: 'medicine_name',
            data: { 
                isRenewal: true,
                originalPattern: session.data.recurrencePattern,
                medicineName: session.data.medicineName
            },
            startTime: Date.now()
        });

        const modifyMessage = `
╔═══════════════════════════════════════╗
║         🔄 MODIFY & RENEW              ║
╚═══════════════════════════════════════╝

✨ *Let's set up your renewed reminder!*

💊 *Current medicine:* ${session.data.medicineName}

*Step 1 of 4: Keep the same medicine name or enter a new one:*

💡 *Type the medicine name (or press Enter to keep "${session.data.medicineName}"):*`;

        await this.sendBotMessage(message.key.remoteJid, modifyMessage);
    }

    async stopRecurringReminder(message, session, userNumber) {
        try {
            const { recurrencePattern, medicineName } = session.data;
            
            // Delete all future reminders with this pattern
            const deletedCount = await this.db.clearAllReminders(userNumber);
            
            const stopMessage = `
╔═══════════════════════════════════════╗
║           🛑 REMINDER STOPPED          ║
╚═══════════════════════════════════════╝

✅ *Recurring reminder stopped successfully*

💊 *Medicine:* ${medicineName}
🗑️ *Removed:* All future reminders
📊 *Status:* No longer recurring

💡 *You can create new reminders anytime with /medicine*`;

            await this.sendBotMessage(message.key.remoteJid, stopMessage);
            this.userSessions.delete(userNumber);
            
            console.log(`🛑 Stopped recurring reminder for ${medicineName}`);
            
        } catch (error) {
            console.error('Stop recurring reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to stop reminders. Please try /clear to remove all reminders.');
        }
    }

    async scheduleRenewalReminder(message, session, userNumber) {
        try {
            const { medicineName } = session.data;
            
            // Create a one-time reminder to ask again in 24 hours
            const reminderDate = moment().add(24, 'hours');
            const reminderText = `🔄 Renewal reminder: Check if you want to continue ${medicineName} reminders`;
            
            await this.db.addReminder(
                userNumber,
                'System',
                reminderText,
                reminderDate.format('YYYY-MM-DD HH:mm:ss'),
                message.key.remoteJid
            );

            const laterMessage = `
╔═══════════════════════════════════════╗
║           ⏰ REMINDER SCHEDULED        ║
╚═══════════════════════════════════════╝

✅ *I'll ask you again tomorrow*

💊 *Medicine:* ${medicineName}
📅 *Will ask again:* ${reminderDate.format('MMM D [at] h:mm A')}
⏱️ *That's:* ${reminderDate.fromNow()}

💡 *Your current reminders will continue until then*`;

            await this.sendBotMessage(message.key.remoteJid, laterMessage);
            this.userSessions.delete(userNumber);
            
            console.log(`⏰ Scheduled renewal reminder for ${medicineName} in 24 hours`);
            
        } catch (error) {
            console.error('Schedule renewal reminder error:', error.message);
            await this.sendBotMessage(message.key.remoteJid, 
                '❌ Failed to schedule reminder. Please check manually tomorrow.');
        }
    }

    formatFrequency(frequency) {
        switch (frequency) {
            case 'daily': return 'Every day';
            case 'weekdays': return 'Monday to Friday';
            case 'specific': return 'Custom days';
            case 'once': return 'One-time';
            default: return frequency;
        }
    }

    async sendRenewalNotification(userInfo) {
        try {
            const { userNumber, recurrencePattern, remainingCount, chatId, message } = userInfo;
            
            // Parse recurrence pattern to get readable info
            const patternParts = recurrencePattern.split('-');
            const medicineName = patternParts[0];
            const frequency = patternParts[1];
            
            const renewalMessage = `
╔═══════════════════════════════════════╗
║          🔄 REMINDER RENEWAL           ║
╚═══════════════════════════════════════╝

⚠️ *Your recurring reminder is running low!*

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${this.formatFrequency(frequency)}
📊 *Remaining:* Only ${remainingCount} reminder${remainingCount > 1 ? 's' : ''} left

╔═══════════════════════════════════════╗
║           🎯 RENEWAL OPTIONS           ║
╚═══════════════════════════════════════╝

Would you like to continue this reminder?

✅ *Reply "renew"* - Continue for 4 more weeks
🔄 *Reply "modify"* - Change schedule and continue  
❌ *Reply "stop"* - End this recurring reminder
⏰ *Reply "later"* - Ask me again in 24 hours

💡 *This ensures you never miss your ${medicineName}!*`;

            // Set up renewal session
            this.userSessions.set(userNumber, {
                flow: 'renewal',
                step: 'choice',
                data: { 
                    recurrencePattern,
                    medicineName,
                    frequency,
                    originalChatId: chatId
                },
                startTime: Date.now()
            });

            await this.sendBotMessage(chatId, renewalMessage, true);
            console.log(`🔄 Renewal notification sent for ${medicineName} to user ${userNumber}`);
            
        } catch (error) {
            console.error('Send renewal notification error:', error.message);
        }
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
   Create a new one-time reminder

🔸 */medicine*
   Create recurring medicine reminders

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

💡 *This is your personal bot - only you can use it!*`;

        await this.sendBotMessage(message.key.remoteJid, helpMessage);
    }

    async sendBotMessage(jid, text, preserveMessage = false) {
        try {
            if (!this.sock) {
                console.log('⚠️ Bot socket not available');
                return;
            }
            
            const botMessage = `RBot ${text}`;
            const messageInfo = await this.sock.sendMessage(jid, { text: botMessage });
            
            if (!preserveMessage && messageInfo && messageInfo.key) {
                this.scheduleMessageDeletion(jid, messageInfo.key, 10 * 60 * 1000);
            }
            
            console.log(`📤 Bot message sent for ${this.userId}`);
            return messageInfo;
        } catch (error) {
            console.error(`Send message error for ${this.userId}:`, error.message);
        }
    }

    scheduleMessageDeletion(jid, messageKey, delay) {
        const deleteId = `${jid}_${messageKey.id}`;
        
        this.autoDeleteMessages.set(deleteId, {
            jid,
            messageKey,
            deleteTime: Date.now() + delay
        });
        
        setTimeout(async () => {
            try {
                await this.deleteMessage(jid, messageKey);
                this.autoDeleteMessages.delete(deleteId);
            } catch (error) {
                this.autoDeleteMessages.delete(deleteId);
            }
        }, delay);
    }

    async deleteMessage(jid, messageKey) {
        try {
            if (!this.sock) return;
            await this.sock.sendMessage(jid, { delete: messageKey });
        } catch (error) {
            // Silently fail
        }
    }

    startReminderScheduler() {
        cron.schedule('* * * * *', async () => {
            try {
                if (!this.sock) return;
                
                const pendingReminders = await this.db.getPendingReminders();
                
                // Filter reminders for this specific user
                const userReminders = pendingReminders.filter(reminder => 
                    reminder.user_number === this.authenticatedPhoneNumber
                );
                
                for (const reminder of userReminders) {
                    await this.sendReminderNotification(reminder);
                    await this.db.markReminderAsSent(reminder.id);
                }
            } catch (error) {
                console.error(`Scheduler error for ${this.userId}:`, error.message);
            }
        });
    }

    startAutoDeleteScheduler() {
        cron.schedule('*/5 * * * *', () => {
            const now = Date.now();
            for (const [deleteId, deleteInfo] of this.autoDeleteMessages.entries()) {
                if (now > deleteInfo.deleteTime + 60000) {
                    this.autoDeleteMessages.delete(deleteId);
                }
            }
        });
    }

    startRenewalChecker() {
        cron.schedule('0 */6 * * *', async () => {
            try {
                await this.checkAndNotifyLowReminders();
            } catch (error) {
                console.error(`Renewal checker error for ${this.userId}:`, error.message);
            }
        });
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

╔═══════════════════════════════════════╗
║            🎯 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

Reply with:
• *"done"* - Mark as completed
• *"reschedule"* - Set new date and time
• *"delete"* - Remove this reminder`;

            await this.sendBotMessage(reminder.chat_id, reminderMessage, true);
            console.log(`🔔 Reminder sent for ${this.userId}: #${reminder.id}`);
        } catch (error) {
            console.error(`Send reminder error for ${this.userId}:`, error.message);
        }
    }

    // Enhanced date parsing
    parseDate(dateString) {
        const input = dateString.toLowerCase().trim();
        
        if (input === 'today') return moment();
        if (input === 'tomorrow') return moment().add(1, 'day');
        
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
        
        const formats = [
            'YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY',
            'MMMM D', 'MMM D', 'MMMM D, YYYY', 'MMM D, YYYY'
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

    parseTime(timeString, date) {
        const input = timeString.toLowerCase().trim();
        
        if (input === 'noon') return date.clone().hour(12).minute(0).second(0);
        if (input === 'midnight') return date.clone().hour(0).minute(0).second(0);
        
        const timeFormats = ['h:mm A', 'h A', 'HH:mm', 'H:mm'];
        
        for (const format of timeFormats) {
            const timeOnly = moment(timeString, format, true);
            if (timeOnly.isValid()) {
                return date.clone()
                    .hour(timeOnly.hour())
                    .minute(timeOnly.minute())
                    .second(0);
            }
        }
        
        return null;
    }

    // Add other missing methods as needed...
    async handleReminderResponse(message, messageText, userNumber, chatId) {
        const response = messageText.toLowerCase().trim();
        
        if (!['done', 'reschedule', 'delete'].includes(response)) {
            return;
        }

        try {
            const recentReminders = await this.db.getUserReminders(userNumber, 5);
            const lastSentReminder = recentReminders.find(r => r.is_sent);
            
            if (!lastSentReminder) {
                await this.sendBotMessage(chatId, '❌ No recent reminder found to respond to.');
                return;
            }

            switch (response) {
                case 'done':
                    await this.sendBotMessage(chatId, `✅ Great! Marked reminder #${lastSentReminder.id} as completed.`);
                    break;
                case 'delete':
                    await this.db.deleteReminder(lastSentReminder.id, userNumber);
                    await this.sendBotMessage(chatId, `🗑️ Reminder #${lastSentReminder.id} deleted successfully.`);
                    break;
                case 'reschedule':
                    // Start reschedule flow
                    await this.sendBotMessage(chatId, `🔄 Reschedule feature coming soon! For now, please create a new reminder with /reminder`);
                    break;
            }
        } catch (error) {
            console.error('Handle reminder response error:', error.message);
        }
    }

    async cancelCurrentFlow(message, userNumber, chatId) {
        if (this.userSessions.has(userNumber)) {
            this.userSessions.delete(userNumber);
            await this.sendBotMessage(chatId, '❌ Operation cancelled.');
        } else {
            await this.sendBotMessage(chatId, '💡 No active operation to cancel.');
        }
    }

    async checkAndNotifyLowReminders() {
        try {
            if (!this.authenticatedPhoneNumber) return;

            // Check for medicine reminders that are running low (less than 5 remaining)
            const lowReminders = await this.db.getUsersWithLowRecurringReminders(5);
            
            // Filter for this specific user
            const userLowReminders = lowReminders.filter(reminder => 
                reminder.userNumber === this.authenticatedPhoneNumber
            );

            if (userLowReminders.length === 0) return;

            for (const lowReminder of userLowReminders) {
                const { recurrencePattern, remainingCount, message } = lowReminder;
                
                try {
                    // Parse the recurrence pattern to extract medicine info
                    const patternParts = recurrencePattern.split('-');
                    if (patternParts.length >= 2) {
                        const medicineName = patternParts[0];
                        const frequency = patternParts[1];
                        
                        const renewalMessage = `
╔═══════════════════════════════════════╗
║           💊 RENEWAL NOTICE            ║
╚═══════════════════════════════════════╝

⚠️ *Your medicine reminders are running low!*

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${frequency}
📊 *Remaining reminders:* ${remainingCount}

🔄 *Would you like to create more reminders?*

╔═══════════════════════════════════════╗
║            🚀 QUICK ACTIONS            ║
╚═══════════════════════════════════════╝

• Type /medicine to create new medicine reminders
• Type /list to see all your current reminders
• I'll automatically create more reminders soon

💡 *This notification helps ensure you don't miss your medication schedule.*`;

                        await this.sendBotMessage(lowReminder.chatId, renewalMessage, true);
                        console.log(`💊 Renewal notice sent for ${this.userId}: ${medicineName} (${remainingCount} remaining)`);
                    }
                } catch (error) {
                    console.error(`Error sending renewal notice for ${this.userId}:`, error.message);
                }
            }

            // Auto-create new reminders for critically low ones (1-2 remaining)
            const criticalReminders = userLowReminders.filter(r => r.remainingCount <= 2);
            
            for (const criticalReminder of criticalReminders) {
                try {
                    await this.autoRenewMedicineReminders(criticalReminder);
                } catch (error) {
                    console.error(`Error auto-renewing for ${this.userId}:`, error.message);
                }
            }

        } catch (error) {
            console.error(`Check low reminders error for ${this.userId}:`, error.message);
        }
    }

    async autoRenewMedicineReminders(reminderInfo) {
        try {
            const { recurrencePattern, userNumber, chatId } = reminderInfo;
            const patternParts = recurrencePattern.split('-');
            
            if (patternParts.length < 4) return;

            const medicineName = patternParts[0];
            const frequency = patternParts[1];
            const targetDays = JSON.parse(patternParts[2]);
            const times = JSON.parse(patternParts[3]);

            const savedReminders = [];
            const weeksToCreate = 2; // Create 2 more weeks
            
            // Create reminders starting from next week
            for (let week = 1; week <= weeksToCreate; week++) {
                for (const dayOfWeek of targetDays) {
                    for (const time of times) {
                        const reminderDate = moment().startOf('week').add(week, 'weeks').day(dayOfWeek);
                        const [hour, minute] = time.split(':');
                        reminderDate.hour(parseInt(hour)).minute(parseInt(minute)).second(0);
                        
                        // Skip if the time has already passed
                        if (reminderDate.isBefore(moment())) {
                            continue;
                        }

                        const reminderText = `💊 Take ${medicineName}`;
                        
                        const reminderId = await this.db.addReminder(
                            userNumber,
                            'Medicine',
                            reminderText,
                            reminderDate.format('YYYY-MM-DD HH:mm:ss'),
                            chatId,
                            true,
                            recurrencePattern
                        );
                        
                        savedReminders.push({
                            id: reminderId,
                            time: reminderDate.format('ddd MMM D [at] h:mm A')
                        });
                    }
                }
            }

            if (savedReminders.length > 0) {
                const autoRenewalMessage = `
╔═══════════════════════════════════════╗
║           🔄 AUTO-RENEWED              ║
╚═══════════════════════════════════════╝

✅ *Automatically created ${savedReminders.length} new reminders!*

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${frequency}
🕐 *Times:* ${times.map(t => moment(t, 'HH:mm').format('h:mm A')).join(', ')}

🤖 *I noticed you were running low on reminders, so I've automatically created more to keep your medication schedule on track.*

💡 *Type /list to see all your reminders*`;

                await this.sendBotMessage(chatId, autoRenewalMessage, true);
                console.log(`🔄 Auto-renewed ${savedReminders.length} reminders for ${this.userId}: ${medicineName}`);
            }

        } catch (error) {
            console.error(`Auto-renewal error for ${this.userId}:`, error.message);
        }
    }

    // Cleanup method for bot shutdown
    async shutdown() {
        try {
            console.log(`🔄 Shutting down bot for user: ${this.userId}`);
            
            // Clear all timers and scheduled tasks
            this.userSessions.clear();
            this.autoDeleteMessages.clear();
            
            // Close WhatsApp connection gracefully
            if (this.sock) {
                try {
                    await this.sock.logout();
                } catch (error) {
                    // Ignore logout errors
                }
                this.sock = null;
            }
            
            console.log(`✅ Bot shutdown complete for user: ${this.userId}`);
        } catch (error) {
            console.error(`Shutdown error for ${this.userId}:`, error.message);
        }
    }

    // Health check method
    getHealthStatus() {
        return {
            userId: this.userId,
            isReady: this.isReady,
            isConnected: !!this.sock,
            authenticatedUser: this.authenticatedPhoneNumber,
            activeSessions: this.userSessions.size,
            pendingDeletions: this.autoDeleteMessages.size,
            uptime: this.sock ? Date.now() - (this.startTime || Date.now()) : 0
        };
    }
}

module.exports = AdvancedReminderBot;
