/**
 * Modern Message Formatter for WhatsApp Bot
 * Creates mobile-friendly, responsive message formats
 */

const moment = require('moment-timezone');

class MessageFormatter {
    constructor() {
        this.maxWidth = 35; // Optimal for most mobile screens
        this.emojis = {
            reminder: '⏰',
            medicine: '💊',
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️',
            list: '📋',
            time: '🕐',
            date: '📅',
            task: '📝',
            id: '🆔',
            delete: '🗑️',
            help: '🤖',
            rocket: '🚀',
            check: '✓',
            cross: '✗'
        };
    }

    // Create a compact header
    createHeader(title, emoji = '') {
        const headerEmoji = emoji || this.emojis.reminder;
        return `${headerEmoji} *${title.toUpperCase()}*\n${'─'.repeat(Math.min(title.length + 2, this.maxWidth))}`;
    }

    // Create a simple section
    createSection(content) {
        return `\n${content}\n`;
    }

    // Create a compact list item
    createListItem(text, emoji = '•') {
        return `${emoji} ${text}`;
    }

    // Create action buttons/options
    createActions(actions) {
        return actions.map(action => `▶️ ${action}`).join('\n');
    }

    // Format reminder creation flow messages
    reminderWelcome() {
        return `${this.emojis.reminder} *NEW REMINDER*
${'─'.repeat(15)}

What should I remind you about?

*Examples:*
• Call dentist
• Team meeting
• Buy groceries
• Take medicine

💬 Type your task below:`;
    }

    reminderDatePrompt(activity) {
        return `${this.emojis.check} Task: "${activity}"

${this.emojis.date} *WHEN?*
${'─'.repeat(8)}

*Quick options:*
• today / tomorrow
• next monday
• january 15
• 2025-06-10

📅 Type the date:`;
    }

    reminderTimePrompt(activity, date) {
        return `${this.emojis.check} Task: "${activity}"
${this.emojis.check} Date: ${date}

${this.emojis.time} *WHAT TIME?*
${'─'.repeat(12)}

*Examples:*
• 9 AM
• 2:30 PM
• 14:30
• noon

🕐 Type the time:`;
    }

    reminderConfirmation(activity, dateTime, userTimezone = null) {
        // Use timezone-aware current time for accurate calculation
        const now = userTimezone ? moment.tz(userTimezone) : moment();
        const timeDiff = dateTime.diff(now);
        let timeToGo;
        
        if (timeDiff < 0) {
            timeToGo = 'in the past';
        } else if (timeDiff < 60000) { // Less than 1 minute
            timeToGo = 'in less than 1 minute';
        } else {
            timeToGo = dateTime.fromNow();
        }

        return `${this.emojis.success} *REVIEW REMINDER*
${'─'.repeat(16)}

📝 *Task:* ${activity}
📅 *When:* ${dateTime.format('MMM D, h:mm A')}
⏱️ *In:* ${timeToGo}

*Ready to save?*
✅ Reply "yes" to save
❌ Reply "no" to cancel`;
    }

    reminderSuccess(data) {
        const { activity, dateTime, id, userTimezone } = data;
        
        // Use timezone-aware current time for accurate calculation
        const now = userTimezone ? moment.tz(userTimezone) : moment();
        const timeDiff = dateTime.diff(now);
        let timeToGo;
        
        if (timeDiff < 0) {
            timeToGo = 'in the past';
        } else if (timeDiff < 60000) { // Less than 1 minute
            timeToGo = 'in less than 1 minute';
        } else {
            timeToGo = dateTime.fromNow();
        }
        
        return `${this.emojis.success} *REMINDER SAVED!*
${'─'.repeat(17)}

${this.emojis.id} #${id}
📝 ${activity}
📅 ${dateTime.format('MMM D, h:mm A')}
⏱️ ${timeToGo}

*Quick actions:*
▶️ /reminder - Create another
▶️ /list - View all`;
    }

    // Medicine reminder messages
    medicineWelcome() {
        return `${this.emojis.medicine} *MEDICINE REMINDER*
${'─'.repeat(18)}

What medicine should I remind you about?

*Examples:*
• Vitamin D
• Blood pressure pills
• Insulin
• Pain relief

💊 Type medicine name:`;
    }

    medicineFrequency(medicineName) {
        return `${this.emojis.check} Medicine: "${medicineName}"

📅 *HOW OFTEN?*
${'─'.repeat(12)}

*Choose frequency:*
1️⃣ daily - Every day
2️⃣ weekdays - Mon-Fri only
3️⃣ specific - Custom days
4️⃣ once - One time only

💡 Type: daily, weekdays, specific, or once`;
    }

    medicineTime(medicineName, frequency) {
        return `${this.emojis.check} Medicine: "${medicineName}"
${this.emojis.check} Frequency: ${frequency}

🕐 *WHAT TIME(S)?*
${'─'.repeat(14)}

*Single:* 9 AM, 2:30 PM
*Multiple:* 8 AM, 2 PM, 8 PM

💡 Separate multiple times with commas
⏰ Type time(s):`;
    }

    medicineSuccess(data) {
        const { medicineName, frequency, timesText, count } = data;
        return `${this.emojis.success} *MEDICINE SAVED!*
${'─'.repeat(16)}

💊 ${medicineName}
📅 ${frequency}
🕐 ${timesText}
📊 ${count} reminders created

*Next reminder:* Coming soon!
▶️ /list to see all`;
    }

    // List reminders
    remindersList(reminders, userTimezone = null) {
        if (reminders.length === 0) {
            return `${this.emojis.list} *YOUR REMINDERS*
${'─'.repeat(16)}

No reminders yet!

*Get started:*
▶️ /reminder - Create one
▶️ /help - See commands`;
        }

        const pending = reminders.filter(r => !r.is_sent);
        const completed = reminders.filter(r => r.is_sent);

        let message = `${this.emojis.list} *YOUR REMINDERS*
${'─'.repeat(16)}

📊 Total: ${reminders.length}`;

        if (pending.length > 0) {
            message += `\n\n⏳ *PENDING (${pending.length}):*`;
            pending.slice(0, 5).forEach(r => {
                // Convert UTC time from database to user's timezone
                const time = userTimezone ? 
                    moment.tz(r.reminder_time, 'UTC').tz(userTimezone) : 
                    moment(r.reminder_time);
                message += `\n\n🔸 #${r.id} ${r.message}`;
                message += `\n   📅 ${time.format('MMM D, h:mm A')}`;
                message += `\n   ⏱️ ${time.fromNow()}`;
            });
        }

        if (completed.length > 0) {
            message += `\n\n✅ *COMPLETED (${completed.length}):*`;
            completed.slice(0, 3).forEach(r => {
                // Convert UTC time from database to user's timezone
                const time = userTimezone ? 
                    moment.tz(r.reminder_time, 'UTC').tz(userTimezone) : 
                    moment(r.reminder_time);
                message += `\n\n🔹 #${r.id} ${r.message}`;
                message += `\n   📅 ${time.format('MMM D, h:mm A')}`;
            });
        }

        message += `\n\n*Actions:*
▶️ /reminder - Create new
▶️ /delete - Remove one`;

        return message;
    }

    // Delete flow
    deletePrompt(reminders) {
        let message = `${this.emojis.delete} *DELETE REMINDER*
${'─'.repeat(16)}

*Select ID to delete:*`;

        reminders.slice(0, 5).forEach(r => {
            const time = moment(r.reminder_time);
            const status = r.is_sent ? '✅' : '⏳';
            message += `\n\n${status} #${r.id} ${r.message}`;
            message += `\n   📅 ${time.format('MMM D, h:mm A')}`;
        });

        message += `\n\n💬 Type ID number (e.g. "${reminders[0].id}")`;
        message += `\n❌ Type "cancel" to abort`;

        return message;
    }

    deleteSuccess(reminder) {
        return `${this.emojis.success} *DELETED!*
${'─'.repeat(10)}

🗑️ Reminder #${reminder.id} removed

📝 Was: "${reminder.message}"
📅 Was scheduled: ${moment(reminder.reminder_time).format('MMM D, h:mm A')}

▶️ /list to see remaining`;
    }

    // Help message
    helpMessage() {
        return `${this.emojis.help} *BOT COMMANDS*
${'─'.repeat(14)}

*Create:*
▶️ /reminder - New reminder
▶️ /medicine - Medicine reminders

*Manage:*
▶️ /list - View all
▶️ /delete - Remove specific
▶️ /clear - Remove all

*Other:*
▶️ /help - This menu
▶️ /cancel - Stop current action

💡 This is your personal bot!`;
    }

    // Reminder notification
    reminderNotification(reminder) {
        const time = moment(reminder.reminder_time);
        return `${this.emojis.reminder} *REMINDER TIME!*
${'─'.repeat(16)}

📝 ${reminder.message}
🆔 #${reminder.id}
🕐 ${time.format('h:mm A')}

*Quick actions:*
✅ Reply "done" - Mark complete
🔄 Reply "reschedule" - Change time
🗑️ Reply "delete" - Remove`;
    }

    // Error messages
    errorMessage(type, details = '') {
        const errors = {
            date: `${this.emojis.error} *DATE ERROR*
${'─'.repeat(12)}

Couldn't understand: "${details}"

*Try these formats:*
• today, tomorrow
• next monday
• january 15
• 2025-06-10`,

            time: `${this.emojis.error} *TIME ERROR*
${'─'.repeat(12)}

Couldn't understand: "${details}"

*Try these formats:*
• 9 AM, 2:30 PM
• 14:30, 09:00
• noon, midnight`,

            past: `${this.emojis.error} *PAST DATE/TIME*
${'─'.repeat(16)}

Can't set reminders in the past!
Please choose a future date/time.`,

            general: `${this.emojis.error} *ERROR*
${'─'.repeat(7)}

Something went wrong. Please try again.
${details ? `\nDetails: ${details}` : ''}`
        };

        return errors[type] || errors.general;
    }

    // Success messages
    sessionTimeout() {
        return `${this.emojis.warning} *SESSION TIMEOUT*
${'─'.repeat(17)}

Session expired due to inactivity.

▶️ Type /reminder to start again`;
    }

    cancelled() {
        return `${this.emojis.cross} *CANCELLED*
${'─'.repeat(11)}

Operation cancelled.

▶️ Type /help to see commands`;
    }

    // Utility method to wrap long text
    wrapText(text, maxLength = this.maxWidth) {
        if (text.length <= maxLength) return text;
        
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + word).length <= maxLength) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        
        if (currentLine) lines.push(currentLine);
        return lines.join('\n');
    }

    // Format a compact status
    compactStatus(text, emoji) {
        return `${emoji} ${text}`;
    }

    // Medicine reminder messages
    medicineWelcome() {
        return `${this.emojis.medicine} *MEDICINE REMINDER*
${'─'.repeat(18)}

What medicine should I remind you about?

*Examples:*
• Vitamin D tablet
• Blood pressure pills  
• Insulin injection
• Pain relief tablet

💊 Type medicine name:`;
    }

    medicineFrequency(medicineName) {
        return `${this.emojis.check} Medicine: "${medicineName}"

📅 *HOW OFTEN?*
${'─'.repeat(12)}

*Choose frequency:*
1️⃣ daily - Every day
2️⃣ weekdays - Mon-Fri only
3️⃣ specific - Custom days
4️⃣ once - One time only

💡 Type: daily, weekdays, specific, or once`;
    }

    medicineSpecificDays() {
        return `✅ *Frequency:* Custom days

📋 *WHICH DAYS?*
${'─'.repeat(13)}

*Choose days (separate with commas):*
• monday, tuesday, wednesday
• mon, tue, wed, thu, fri
• saturday, sunday

💡 Example: monday, wednesday, friday`;
    }

    medicineTime(frequency) {
        const step = frequency === 'specific' ? '4' : '3';
        return `🕐 *WHAT TIME(S)?*
${'─'.repeat(14)}

*Step ${step} of 4*

*Examples:*
• Single: 9 AM, 2:30 PM
• Multiple: 8 AM, 2 PM, 8 PM
• Special: morning, noon, evening

💡 Separate multiple times with commas
⏰ Type time(s):`;
    }

    medicineConfirmation(data) {
        const { medicineName, frequency, specificDays, times } = data;
        
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

        return `✨ *CONFIRMATION*
${'─'.repeat(14)}

💊 *Medicine:* ${medicineName}
📅 *Frequency:* ${frequencyText}
🕐 *Time(s):* ${times.join(', ')}

*Ready to save?*
✅ Reply "yes" to save
❌ Reply "no" to cancel`;
    }

    medicineSuccess(data) {
        const { medicineName, frequency, times, count } = data;
        const timesText = times.join(', ');
        
        return `${this.emojis.success} *MEDICINE SAVED!*
${'─'.repeat(16)}

💊 ${medicineName}
📅 ${frequency}
🕐 ${timesText}
📊 ${count} reminders created

*Next reminder:* Coming soon!
▶️ /list to see all`;
    }

    // Delete flow messages
    deletePrompt(reminders) {
        let message = `${this.emojis.delete} *DELETE REMINDER*
${'─'.repeat(16)}

*Select ID to delete:*`;

        reminders.slice(0, 5).forEach(r => {
            const time = moment(r.reminder_time);
            const status = r.is_sent ? '✅' : '⏳';
            message += `\n\n${status} #${r.id} ${r.message}`;
            message += `\n   📅 ${time.format('MMM D, h:mm A')}`;
        });

        message += `\n\n💬 Type ID number (e.g. "${reminders[0].id}")`;
        message += `\n❌ Type "cancel" to abort`;

        return message;
    }

    deleteSuccess(reminder) {
        return `${this.emojis.success} *DELETED!*
${'─'.repeat(10)}

🗑️ Reminder #${reminder.id} removed

📝 Was: "${reminder.message}"
📅 Was scheduled: ${moment(reminder.reminder_time).format('MMM D, h:mm A')}

▶️ /list to see remaining`;
    }

    // Clear flow messages
    clearPrompt(count) {
        return `⚠️ *CLEAR ALL REMINDERS*
${'─'.repeat(20)}

🚨 *WARNING: This will delete ALL your reminders!*

📊 *You have ${count} reminder${count > 1 ? 's' : ''}*
• Pending reminders will be cancelled
• Completed reminders will be removed
• This action cannot be undone

⚠️ *Are you absolutely sure?*

✅ Type "DELETE ALL" to confirm
❌ Type anything else to cancel`;
    }

    clearSuccess(count) {
        return `🧹 *ALL CLEARED*
${'─'.repeat(13)}

✅ Successfully deleted all ${count} reminders

🎯 Your reminder list is now clean
💡 Type /reminder to create a new one`;
    }

    clearCancelled() {
        return `❌ *CLEAR CANCELLED*
${'─'.repeat(16)}

Your reminders are safe.
▶️ /list to view all reminders`;
    }

    // Reschedule flow messages
    rescheduleDate() {
        return `🔄 *RESCHEDULE DATE*
${'─'.repeat(16)}

*Step 1 of 2: Pick new date*

*Examples:*
• today, tomorrow
• next monday
• january 15
• 2025-06-10

📅 Type the new date:`;
    }

    rescheduleTime(date) {
        return `✅ New date: ${date.format('MMM D, YYYY')}

🕐 *RESCHEDULE TIME*
${'─'.repeat(16)}

*Step 2 of 2: Pick new time*

*Examples:*
• 9 AM, 2:30 PM
• 14:30, 09:00
• noon, midnight

⏰ Type the new time:`;
    }

    rescheduleSuccess(data) {
        const { id, activity, dateTime } = data;
        return `🔄 *RESCHEDULED*
${'─'.repeat(13)}

✅ Reminder rescheduled successfully!

📝 Task: ${activity}
🆔 #${id}
📅 New time: ${dateTime.format('MMM D, h:mm A')}
⏱️ That's: ${dateTime.fromNow()}

🎯 I'll remind you at the new time!
💡 Type /list to see all reminders`;
    }

    // Session timeout and cancellation
    sessionTimeout() {
        return `${this.emojis.warning} *SESSION TIMEOUT*
${'─'.repeat(17)}

Session expired due to inactivity.

▶️ Type /reminder to start again`;
    }

    cancelled() {
        return `${this.emojis.cross} *CANCELLED*
${'─'.repeat(11)}

Operation cancelled.

▶️ Type /help to see commands`;
    }

    // Generic error handling
    unknownCommand(command) {
        return `❓ *UNKNOWN COMMAND*
${'─'.repeat(17)}

Command: ${command}

▶️ Type /help to see all commands`;
    }

    operationFailed(operation) {
        return `${this.emojis.error} *${operation.toUpperCase()} FAILED*
${'─'.repeat(operation.length + 8)}

Something went wrong. Please try again.

▶️ Type /help if you need assistance`;
    }

    // Auto-renewal messages  
    renewalNotice(data) {
        const { medicineName, frequency, remainingCount } = data;
        return `💊 *RENEWAL NOTICE*
${'─'.repeat(16)}

⚠️ Your medicine reminders are running low!

💊 Medicine: ${medicineName}
📅 Frequency: ${frequency}
📊 Remaining: ${remainingCount}

🔄 Would you like to create more?

*Actions:*
▶️ /medicine - Create new reminders
▶️ /list - View current reminders

💡 This helps ensure you don't miss doses`;
    }

    autoRenewalSuccess(data) {
        const { medicineName, count, frequency, times } = data;
        return `🔄 *AUTO-RENEWED*
${'─'.repeat(14)}

✅ Created ${count} new reminders!

💊 Medicine: ${medicineName}
📅 Frequency: ${frequency}
🕐 Times: ${times}

🤖 I noticed you were running low, so I automatically created more reminders.

💡 Type /list to see all reminders`;
    }

    // Renewal flow messages
    renewalOptions(data) {
        const { medicineName, frequency, remainingCount } = data;
        return `🔄 *REMINDER RENEWAL*
${'─'.repeat(17)}

⚠️ Your recurring reminder is running low!

💊 Medicine: ${medicineName}
📅 Frequency: ${frequency}
📊 Remaining: ${remainingCount}

*What would you like to do?*

✅ Reply "renew" - Continue 4 more weeks
🔄 Reply "modify" - Change & continue
❌ Reply "stop" - End reminders  
⏰ Reply "later" - Ask again tomorrow

💡 This ensures you never miss your ${medicineName}!`;
    }

    renewalSuccess(data) {
        const { medicineName, count } = data;
        return `✅ *RENEWAL SUCCESS*
${'─'.repeat(16)}

🎉 ${count} new reminders created!

💊 Medicine: ${medicineName}
📅 Extended for: 4 more weeks
🔄 Pattern: Same as before

💡 I'll check again when you have 5 left!`;
    }

    renewalStopped(medicineName) {
        return `🛑 *REMINDER STOPPED*
${'─'.repeat(17)}

✅ Recurring reminder stopped

💊 Medicine: ${medicineName}
🗑️ Removed: All future reminders
📊 Status: No longer recurring

💡 You can create new ones with /medicine`;
    }

    renewalScheduled(data) {
        const { medicineName, askAgainTime } = data;
        return `⏰ *REMINDER SCHEDULED*
${'─'.repeat(19)}

✅ I'll ask you again tomorrow

💊 Medicine: ${medicineName}
📅 Will ask: ${askAgainTime}
⏱️ That's: ${moment(askAgainTime).fromNow()}

💡 Current reminders continue until then`;
    }

    // Create inline buttons (for future WhatsApp Business API)
    createInlineOptions(options) {
        return options.map((option, index) => 
            `${index + 1}️⃣ ${option}`
        ).join('\n');
    }
}

module.exports = MessageFormatter;
