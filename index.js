const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const moment = require('moment');
require('dotenv').config();

const Database = require('./database');

class WhatsAppReminderBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.db = new Database();
        this.userSessions = new Map(); // Store user reminder creation sessions
        
        this.initializeDatabase();
        this.initializeBot();
        this.startReminderScheduler();
    }

    async initializeDatabase() {
        try {
            const mongoUri = process.env.MONGODB_URI;
            if (!mongoUri) {
                throw new Error('MONGODB_URI environment variable not set');
            }
            await this.db.connect(mongoUri);
        } catch (error) {
            console.error('Failed to connect to database:', error);
            process.exit(1);
        }
    }

    initializeBot() {
        // Store the authenticated user's phone number
        this.authenticatedPhoneNumber = null;

        // Generate QR code for WhatsApp Web login
        this.client.on('qr', (qr) => {
            console.log('🔄 Please scan the QR code with your WhatsApp mobile app:');
            qrcode.generate(qr, { small: true });
        });

        // Authentication success
        this.client.on('authenticated', () => {
            console.log('✅ Authentication successful!');
        });

        // Authentication failure
        this.client.on('auth_failure', (msg) => {
            console.error('❌ Authentication failed:', msg);
        });

        // Client loading screen
        this.client.on('loading_screen', (percent, message) => {
            console.log('⏳ Loading WhatsApp Web...', percent, message);
        });

        // Bot ready - get authenticated user's phone number
        this.client.on('ready', async () => {
            try {
                const info = this.client.info;
                this.authenticatedPhoneNumber = info.wid.user;
                console.log('✅ WhatsApp Reminder Bot is ready!');
                console.log('📱 Authenticated phone number:', this.authenticatedPhoneNumber);
                console.log('📱 Send any message to yourself to test (try "hello")');
                console.log('🔍 The bot will show debug info for every message received');
            } catch (error) {
                console.error('Error getting phone number:', error);
                // Try alternative method
                try {
                    const me = await this.client.getMe();
                    this.authenticatedPhoneNumber = me.id.user;
                    console.log('📱 Authenticated phone number (alternative method):', this.authenticatedPhoneNumber);
                } catch (altError) {
                    console.error('Failed to get phone number with alternative method:', altError);
                }
            }
        });

        // Handle incoming messages with basic logging first
        this.client.on('message', async (message) => {
            console.log('🔔 RAW MESSAGE EVENT TRIGGERED:', {
                id: message.id,
                type: message.type,
                fromMe: message.fromMe,
                from: message.from,
                body: message.body
            });
            await this.handleMessage(message);
        });

        // Handle disconnection
        this.client.on('disconnected', (reason) => {
            console.log('📴 Client disconnected:', reason);
        });

        // Start the client with error handling
        this.client.initialize().catch(err => {
            console.error('❌ Failed to initialize WhatsApp client:', err);
        });
    }

    async handleMessage(message) {
        const messageBody = message.body.trim();
        const chatId = message.from;
        
        try {
            const contact = await message.getContact();
            const userNumber = contact.number;
            const userName = contact.pushname || contact.name || 'User';
            const chat = await message.getChat();

            // Extract phone number from chatId (format: "1234567890@c.us")
            const chatPhoneNumber = chatId.split('@')[0];

            // Debug logging with phone number comparison
            console.log('📩 Message received:', {
                from: chatId,
                chatPhoneNumber: chatPhoneNumber,
                authenticatedPhoneNumber: this.authenticatedPhoneNumber,
                userNumber: userNumber,
                body: messageBody,
                isFromMe: message.fromMe,
                isGroup: chat.isGroup,
                chatName: chat.name || 'N/A'
            });

            // Skip group messages
            if (chat.isGroup) {
                console.log('⚠️ Ignoring group message');
                return;
            }

            // Check if we have the authenticated phone number
            if (!this.authenticatedPhoneNumber) {
                console.log('⚠️ Authenticated phone number not available yet');
                return;
            }

            // Phone number-based self-chat detection
            // Only process if the chat phone number matches the authenticated phone number
            const isSelfChat = chatPhoneNumber === this.authenticatedPhoneNumber;
            
            console.log('🔍 Phone number check:', {
                chatPhoneNumber,
                authenticatedPhoneNumber: this.authenticatedPhoneNumber,
                isSelfChat
            });

            if (!isSelfChat) {
                console.log('⚠️ Ignoring message - not a self-chat (phone numbers don\'t match)');
                return;
            }

            console.log('✅ Processing self-chat message (phone numbers match!)');

            // Handle different commands and states
            if (messageBody.startsWith('/reminder')) {
                await this.startReminderCreation(message, userNumber, userName, chatId);
            } else if (messageBody.startsWith('/list')) {
                await this.listUserReminders(message, userNumber);
            } else if (messageBody.startsWith('/delete')) {
                await this.deleteReminder(message, userNumber);
            } else if (messageBody.startsWith('/help')) {
                await this.showHelp(message);
            } else if (this.userSessions.has(userNumber)) {
                // User is in middle of creating a reminder
                await this.handleReminderCreationStep(message, userNumber, userName, chatId);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            try {
                await message.reply('❌ Sorry, something went wrong. Please try again.');
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }

    async startReminderCreation(message, userNumber, userName, chatId) {
        // Initialize reminder creation session
        this.userSessions.set(userNumber, {
            step: 'activity',
            data: {},
            chatId: chatId,
            userName: userName
        });

        const modernInterface = `
┌─────────────────────────────────┐
│          🔔 NEW REMINDER          │
└─────────────────────────────────┘

✨ *Step 1/3: What's the task?*

📝 Tell me what you'd like to be reminded about:

┌─────────────────────────────────┐
│  💼 "Team meeting preparation"   │
│  📞 "Call mom"                  │
│  💊 "Take medicine"             │
│  🏃 "Go for a run"              │
│  📚 "Submit assignment"         │
└─────────────────────────────────┘

*Type your reminder activity below* ⬇️`;

        await message.reply(modernInterface);
    }

    async handleReminderCreationStep(message, userNumber, userName, chatId) {
        const session = this.userSessions.get(userNumber);
        const messageBody = message.body.trim();

        switch (session.step) {
            case 'activity':
                session.data.activity = messageBody;
                session.step = 'date';
                await message.reply(`
✅ *Activity:* ${messageBody}

*Step 2: Date*
When should I remind you? Please provide the date.
Examples:
• "today"
• "tomorrow" 
• "2025-01-15"
• "next Monday"
• "January 15"

Type the date:`);
                break;

            case 'date':
                const parsedDate = this.parseDate(messageBody);
                if (!parsedDate) {
                    const dateError = `
❌ *Oops! Date not recognized*

┌─────────────────────────────────┐
│  📅 Try these formats:           │
│  • "today" or "tomorrow"        │
│  • "next Monday"                │
│  • "January 15"                 │
│  • "2025-01-15"                 │
└─────────────────────────────────┘

*Please try again* ⬇️`;
                    await message.reply(dateError);
                    return;
                }
                session.data.date = parsedDate;
                session.step = 'time';
                
                const timeInterface = `
┌─────────────────────────────────┐
│          📅 DATE CONFIRMED        │
└─────────────────────────────────┘

✅ *Selected:* ${parsedDate.format('MMMM D, YYYY')}

⏰ *Step 2/3: What time?*

🕐 Choose your preferred time format:

┌─────────────────────────────────┐
│  🌅 "9:00 AM" or "09:00"        │
│  🌞 "2:30 PM" or "14:30"        │
│  🌙 "8 PM" or "20:00"           │
│  ☀️ "noon" or "midnight"        │
└─────────────────────────────────┘

*Type your time below* ⬇️`;
                
                await message.reply(timeInterface);
                break;

            case 'time':
                const parsedTime = this.parseTime(messageBody, session.data.date);
                if (!parsedTime) {
                    await message.reply(`❌ I couldn't understand that time. Please try again with formats like:
• "9:00 AM"
• "14:30"
• "6 PM"`);
                    return;
                }
                session.data.dateTime = parsedTime;
                session.step = 'confirm';
                await this.showReminderConfirmation(message, session);
                break;

            case 'confirm':
                if (messageBody.toLowerCase() === 'yes' || messageBody.toLowerCase() === 'y') {
                    await this.saveReminder(message, session, userNumber, userName, chatId);
                } else if (messageBody.toLowerCase() === 'no' || messageBody.toLowerCase() === 'n') {
                    this.userSessions.delete(userNumber);
                    await message.reply('❌ Reminder creation cancelled. Type /reminder to start again.');
                } else {
                    await message.reply('Please reply with "yes" or "no" to confirm.');
                }
                break;
        }
    }

    async showReminderConfirmation(message, session) {
        const { activity, dateTime } = session.data;
        const timeUntil = moment(dateTime).fromNow();
        
        const confirmInterface = `
┌─────────────────────────────────┐
│        ⏰ TIME CONFIRMED         │
└─────────────────────────────────┘

✨ *Step 3/3: Final Review*

📋 *REMINDER SUMMARY*
┌─────────────────────────────────┐
│  📝 Task: ${activity}
│  📅 Date: ${dateTime.format('MMM D, YYYY')}
│  🕐 Time: ${dateTime.format('h:mm A')}
│  ⏳ In: ${timeUntil}
└─────────────────────────────────┘

🤔 *Everything look good?*

┌─────────────────────────────────┐
│  ✅ Type "yes" to save          │
│  ❌ Type "no" to cancel         │
└─────────────────────────────────┘`;

        await message.reply(confirmInterface);
    }

    async saveReminder(message, session, userNumber, userName, chatId) {
        try {
            const { activity, dateTime } = session.data;
            
            await this.db.addReminder(
                userNumber,
                userName,
                activity,
                dateTime.format('YYYY-MM-DD HH:mm:ss'),
                chatId
            );

            const successInterface = `
┌─────────────────────────────────┐
│        🎉 SUCCESS! SAVED        │
└─────────────────────────────────┘

✨ *Your reminder is all set!*

📋 *REMINDER DETAILS*
┌─────────────────────────────────┐
│  📝 Task: ${activity}
│  📅 Date: ${dateTime.format('MMM D, YYYY')}
│  🕐 Time: ${dateTime.format('h:mm A')}
│  ⏰ Will remind you ${moment(dateTime).fromNow()}
└─────────────────────────────────┘

🛠️ *Quick Actions*
┌─────────────────────────────────┐
│  📋 /list - View all reminders  │
│  🗑️ /delete [ID] - Remove one   │
│  ➕ /reminder - Create another  │
└─────────────────────────────────┘`;

            await message.reply(successInterface);
            this.userSessions.delete(userNumber);

        } catch (error) {
            console.error('Error saving reminder:', error);
            await message.reply('❌ Failed to save reminder. Please try again.');
        }
    }

    async listUserReminders(message, userNumber) {
        try {
            const reminders = await this.db.getUserReminders(userNumber, 10);
            
            if (reminders.length === 0) {
                await message.reply('📝 You have no reminders set. Type /reminder to create one!');
                return;
            }

            let listText = '*📋 Your Reminders:*\n\n';
            
            reminders.forEach((reminder, index) => {
                const reminderTime = moment(reminder.reminder_time);
                const status = reminder.is_sent ? '✅ Sent' : '⏳ Pending';
                
                listText += `*${reminder.id}.* ${reminder.message}\n`;
                listText += `📅 ${reminderTime.format('MMM D, YYYY [at] h:mm A')}\n`;
                listText += `${status}\n\n`;
            });

            listText += '\n💡 Type /delete [ID] to remove a reminder';
            await message.reply(listText);

        } catch (error) {
            console.error('Error listing reminders:', error);
            await message.reply('❌ Failed to retrieve reminders.');
        }
    }

    async deleteReminder(message, userNumber) {
        const parts = message.body.trim().split(' ');
        if (parts.length < 2) {
            await message.reply('Please specify the reminder ID. Example: /delete 1');
            return;
        }

        const reminderId = parseInt(parts[1]);
        if (isNaN(reminderId)) {
            await message.reply('Please provide a valid reminder ID number.');
            return;
        }

        try {
            const deleted = await this.db.deleteReminder(reminderId, userNumber);
            if (deleted) {
                await message.reply(`✅ Reminder #${reminderId} has been deleted.`);
            } else {
                await message.reply(`❌ Reminder #${reminderId} not found or doesn't belong to you.`);
            }
        } catch (error) {
            console.error('Error deleting reminder:', error);
            await message.reply('❌ Failed to delete reminder.');
        }
    }

    async showHelp(message) {
        const helpText = `
🤖 *WhatsApp Reminder Bot Help*

*Available Commands:*
• /reminder - Create a new reminder
• /list - View all your reminders  
• /delete [ID] - Delete a reminder by ID
• /help - Show this help message

*How to create a reminder:*
1. Type /reminder
2. Follow the step-by-step prompts
3. Provide activity, date, and time
4. Confirm to save

*Example reminder creation:*
1. /reminder
2. "Call dentist"
3. "tomorrow"
4. "2 PM"
5. "yes" to confirm

The bot will automatically send you reminder messages at the scheduled time! 🔔`;

        await message.reply(helpText);
    }

    parseDate(dateString) {
        const input = dateString.toLowerCase().trim();
        
        // Handle relative dates
        if (input === 'today') {
            return moment();
        }
        if (input === 'tomorrow') {
            return moment().add(1, 'day');
        }
        if (input.includes('next monday')) {
            return moment().day(8); // Next Monday
        }
        if (input.includes('next tuesday')) {
            return moment().day(9);
        }
        // Add more day parsing as needed

        // Try parsing various date formats
        const formats = [
            'YYYY-MM-DD',
            'MM-DD-YYYY',
            'DD-MM-YYYY',
            'MMMM D',
            'MMM D',
            'MMMM D, YYYY'
        ];

        for (const format of formats) {
            const parsed = moment(dateString, format, true);
            if (parsed.isValid()) {
                // If no year specified, assume current year
                if (!format.includes('YYYY') && parsed.year() === 2001) {
                    parsed.year(moment().year());
                }
                return parsed;
            }
        }

        return null;
    }

    parseTime(timeString, date) {
        const input = timeString.toLowerCase().trim();
        
        // Handle special cases
        if (input === 'noon' || input === '12 pm') {
            return date.clone().hour(12).minute(0).second(0);
        }
        if (input === 'midnight' || input === '12 am') {
            return date.clone().hour(0).minute(0).second(0);
        }

        // Try parsing various time formats
        const timeFormats = [
            'h:mm A',
            'HH:mm',
            'h A',
            'ha',
            'h:mm a',
            'H:mm'
        ];

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

    startReminderScheduler() {
        // Check for pending reminders every minute
        cron.schedule('* * * * *', async () => {
            try {
                const pendingReminders = await this.db.getPendingReminders();
                
                for (const reminder of pendingReminders) {
                    await this.sendReminder(reminder);
                    await this.db.markReminderAsSent(reminder.id);
                }
            } catch (error) {
                console.error('Error in reminder scheduler:', error);
            }
        });

        console.log('📅 Reminder scheduler started - checking every minute');
    }

    async sendReminder(reminder) {
        try {
            const reminderMessage = `
🔔 *REMINDER*

⏰ ${reminder.message}

Set on: ${moment(reminder.created_at).format('MMM D, YYYY')}
Reminder time: ${moment(reminder.reminder_time).format('h:mm A')}

Have a great day! 😊`;

            await this.client.sendMessage(reminder.chat_id, reminderMessage);
            console.log(`✅ Sent reminder to ${reminder.user_number}: ${reminder.message}`);
        } catch (error) {
            console.error('Error sending reminder:', error);
        }
    }
}

// Start the bot
console.log('🚀 Starting WhatsApp Reminder Bot...');
new WhatsAppReminderBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down WhatsApp Reminder Bot...');
    process.exit(0);
});
