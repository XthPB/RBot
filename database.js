const mongoose = require('mongoose');

// Reminder Schema
const reminderSchema = new mongoose.Schema({
    userNumber: {
        type: String,
        required: true,
        index: true
    },
    userName: {
        type: String,
        default: 'User'
    },
    message: {
        type: String,
        required: true
    },
    reminderTime: {
        type: Date,
        required: true,
        index: true
    },
    chatId: {
        type: String,
        required: true
    },
    isSent: {
        type: Boolean,
        default: false,
        index: true
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// User Schema
const userSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        default: 'User'
    },
    timezone: {
        type: String,
        default: 'Asia/Calcutta'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Reminder = mongoose.model('Reminder', reminderSchema);
const User = mongoose.model('User', userSchema);

class Database {
    constructor() {
        this.connected = false;
    }

    async connect(mongoUri) {
        try {
            await mongoose.connect(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            this.connected = true;
            console.log('✅ Connected to MongoDB Atlas');
        } catch (error) {
            console.error('❌ MongoDB connection error:', error);
            throw error;
        }
    }

    async addReminder(userNumber, userName, message, reminderTime, chatId, isRecurring = false, recurrencePattern = null) {
        try {
            const reminder = new Reminder({
                userNumber,
                userName,
                message,
                reminderTime: new Date(reminderTime),
                chatId,
                isRecurring,
                recurrencePattern
            });

            const saved = await reminder.save();
            return saved._id;
        } catch (error) {
            console.error('Error adding reminder:', error);
            throw error;
        }
    }

    async getPendingReminders() {
        try {
            const reminders = await Reminder.find({
                isSent: false,
                reminderTime: { $lte: new Date() }
            }).sort({ reminderTime: 1 });

            return reminders.map(reminder => ({
                id: reminder._id,
                user_number: reminder.userNumber,
                user_name: reminder.userName,
                message: reminder.message,
                reminder_time: reminder.reminderTime,
                chat_id: reminder.chatId,
                created_at: reminder.createdAt,
                is_sent: reminder.isSent,
                is_recurring: reminder.isRecurring,
                recurrence_pattern: reminder.recurrencePattern
            }));
        } catch (error) {
            console.error('Error getting pending reminders:', error);
            throw error;
        }
    }

    async markReminderAsSent(reminderId) {
        try {
            const result = await Reminder.updateOne(
                { _id: reminderId },
                { $set: { isSent: true, sentAt: new Date() } }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error marking reminder as sent:', error);
            throw error;
        }
    }

    async clearAllReminders(userNumber) {
        try {
            const result = await Reminder.deleteMany({ userNumber: userNumber });
            return result.deletedCount;
        } catch (error) {
            console.error('Error clearing all reminders:', error);
            throw error;
        }
    }

    async cleanupOldReminders(cutoffDate) {
        try {
            const result = await Reminder.deleteMany({
                isSent: true,
                reminderTime: { $lt: new Date(cutoffDate) }
            });
            return result.deletedCount;
        } catch (error) {
            console.error('Error cleaning up old reminders:', error);
            throw error;
        }
    }

    async updateReminderTime(reminderId, newDateTime) {
        try {
            const result = await Reminder.updateOne(
                { _id: reminderId },
                { 
                    $set: { 
                        reminderTime: new Date(newDateTime),
                        isSent: false,
                        updatedAt: new Date()
                    } 
                }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating reminder time:', error);
            throw error;
        }
    }

    async getUserReminders(userNumber, limit = 10) {
        try {
            const reminders = await Reminder.find({ userNumber })
                .sort({ reminderTime: -1 })
                .limit(limit);

            return reminders.map(reminder => ({
                id: reminder._id,
                user_number: reminder.userNumber,
                user_name: reminder.userName,
                message: reminder.message,
                reminder_time: reminder.reminderTime,
                created_at: reminder.createdAt,
                is_sent: reminder.isSent,
                is_recurring: reminder.isRecurring
            }));
        } catch (error) {
            console.error('Error getting user reminders:', error);
            throw error;
        }
    }

    async deleteReminder(reminderId, userNumber) {
        try {
            const result = await Reminder.deleteOne({
                _id: reminderId,
                userNumber: userNumber
            });
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error deleting reminder:', error);
            throw error;
        }
    }

    async addUser(phoneNumber, name, timezone = 'Asia/Calcutta') {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { name, timezone },
                { upsert: true, new: true }
            );
            return user._id;
        } catch (error) {
            console.error('Error adding user:', error);
            throw error;
        }
    }

    async close() {
        try {
            await mongoose.connection.close();
            this.connected = false;
            console.log('📴 Database connection closed');
        } catch (error) {
            console.error('Error closing database:', error);
        }
    }
}

module.exports = Database;
