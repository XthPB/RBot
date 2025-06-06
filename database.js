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
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    dataCleanedAt: {
        type: Date,
        default: null
    },
    remindersDeleted: {
        type: Number,
        default: 0
    },
    sessionsDeleted: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Active Session Schema for deployment persistence
const activeSessionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userName: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    isReady: {
        type: Boolean,
        default: false
    },
    lastBackup: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Reminder = mongoose.model('Reminder', reminderSchema);
const User = mongoose.model('User', userSchema);
const ActiveSession = mongoose.model('ActiveSession', activeSessionSchema);

class Database {
    constructor() {
        this.connected = false;
    }

    async connect(mongoUri) {
        try {
            await mongoose.connect(mongoUri);
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

    async getUserInfo(phoneNumber) {
        try {
            const user = await User.findOne({ phoneNumber });
            return user ? {
                id: user._id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                timezone: user.timezone,
                isActive: user.isActive,
                createdAt: user.createdAt
            } : null;
        } catch (error) {
            console.error('Error getting user info:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            const users = await User.find({ isActive: true });
            return users.map(user => ({
                id: user._id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                timezone: user.timezone,
                createdAt: user.createdAt
            }));
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }

    async deactivateUser(phoneNumber) {
        try {
            const result = await User.updateOne(
                { phoneNumber },
                { $set: { isActive: false } }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error deactivating user:', error);
            throw error;
        }
    }

    async getReminderCountByPattern(userNumber, recurrencePattern) {
        try {
            const count = await Reminder.countDocuments({
                userNumber,
                recurrencePattern,
                isSent: false
            });
            return count;
        } catch (error) {
            console.error('Error getting reminder count:', error);
            throw error;
        }
    }

    async getUsersWithLowRecurringReminders(threshold = 5) {
        try {
            const pipeline = [
                {
                    $match: {
                        isRecurring: true,
                        isSent: false,
                        recurrencePattern: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: {
                            userNumber: "$userNumber",
                            recurrencePattern: "$recurrencePattern"
                        },
                        count: { $sum: 1 },
                        chatId: { $first: "$chatId" },
                        message: { $first: "$message" }
                    }
                },
                {
                    $match: {
                        count: { $lte: threshold }
                    }
                }
            ];

            const results = await Reminder.aggregate(pipeline);
            return results.map(result => ({
                userNumber: result._id.userNumber,
                recurrencePattern: result._id.recurrencePattern,
                remainingCount: result.count,
                chatId: result.chatId,
                message: result.message
            }));
        } catch (error) {
            console.error('Error getting users with low recurring reminders:', error);
            throw error;
        }
    }

    // Session persistence methods for seamless deployments
    async updateActiveUserSessions(activeUsers) {
        try {
            const operations = activeUsers.map(user => ({
                updateOne: {
                    filter: { userId: user.userId },
                    update: {
                        $set: {
                            userName: user.userName,
                            phoneNumber: user.phoneNumber,
                            isReady: user.isReady,
                            lastBackup: user.lastBackup || new Date()
                        }
                    },
                    upsert: true
                }
            }));

            const result = await ActiveSession.bulkWrite(operations);
            return result.modifiedCount + result.upsertedCount;
        } catch (error) {
            console.error('Error updating active user sessions:', error);
            throw error;
        }
    }

    async getActiveUserSessions() {
        try {
            // Get sessions that were active in the last 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            const sessions = await ActiveSession.find({
                isReady: true,
                lastBackup: { $gte: fiveMinutesAgo }
            }).sort({ lastBackup: -1 });

            return sessions.map(session => ({
                userId: session.userId,
                userName: session.userName,
                phoneNumber: session.phoneNumber,
                isReady: session.isReady,
                lastBackup: session.lastBackup,
                createdAt: session.createdAt
            }));
        } catch (error) {
            console.error('Error getting active user sessions:', error);
            throw error;
        }
    }

    async removeActiveSession(userId) {
        try {
            const result = await ActiveSession.deleteOne({ userId });
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error removing active session:', error);
            throw error;
        }
    }

    async cleanupOldSessions() {
        try {
            // Remove sessions older than 1 hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const result = await ActiveSession.deleteMany({
                lastBackup: { $lt: oneHourAgo }
            });
            
            return result.deletedCount;
        } catch (error) {
            console.error('Error cleaning up old sessions:', error);
            throw error;
        }
    }

    // Enhanced user management with last activity tracking
    async updateUserLastActivity(phoneNumber) {
        try {
            const result = await User.updateOne(
                { phoneNumber },
                { 
                    $set: { 
                        lastActivity: new Date(),
                        isActive: true
                    } 
                }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating user last activity:', error);
            throw error;
        }
    }

    // Get inactive users (no activity for specified days)
    async getInactiveUsers(daysInactive = 60) {
        try {
            const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);
            
            const inactiveUsers = await User.find({
                $or: [
                    { lastActivity: { $lt: cutoffDate } },
                    { lastActivity: { $exists: false }, createdAt: { $lt: cutoffDate } }
                ],
                isActive: true
            });

            return inactiveUsers.map(user => ({
                id: user._id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                createdAt: user.createdAt,
                lastActivity: user.lastActivity,
                daysSinceActivity: user.lastActivity ? 
                    Math.floor((Date.now() - user.lastActivity.getTime()) / (24 * 60 * 60 * 1000)) :
                    Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000))
            }));
        } catch (error) {
            console.error('Error getting inactive users:', error);
            throw error;
        }
    }

    // Cleanup inactive user data
    async cleanupInactiveUserData(phoneNumber) {
        try {
            // Delete all reminders for the user
            const remindersDeleted = await Reminder.deleteMany({ userNumber: phoneNumber });
            
            // Delete active sessions for the user
            const sessionsDeleted = await ActiveSession.deleteMany({ phoneNumber: phoneNumber });
            
            // Mark user as inactive instead of deleting (for audit trail)
            const userUpdated = await User.updateOne(
                { phoneNumber },
                { 
                    $set: { 
                        isActive: false,
                        dataCleanedAt: new Date(),
                        remindersDeleted: remindersDeleted.deletedCount,
                        sessionsDeleted: sessionsDeleted.deletedCount
                    } 
                }
            );

            return {
                success: true,
                remindersDeleted: remindersDeleted.deletedCount,
                sessionsDeleted: sessionsDeleted.deletedCount,
                userDeactivated: userUpdated.modifiedCount > 0
            };
        } catch (error) {
            console.error('Error cleaning up inactive user data:', error);
            throw error;
        }
    }

    // Bulk cleanup of multiple inactive users
    async bulkCleanupInactiveUsers(daysInactive = 60) {
        try {
            const inactiveUsers = await this.getInactiveUsers(daysInactive);
            const cleanupResults = [];

            for (const user of inactiveUsers) {
                try {
                    const result = await this.cleanupInactiveUserData(user.phoneNumber);
                    cleanupResults.push({
                        phoneNumber: user.phoneNumber,
                        name: user.name,
                        daysSinceActivity: user.daysSinceActivity,
                        ...result
                    });

                    console.log(`🧹 Cleaned up inactive user: ${user.phoneNumber} (${user.daysSinceActivity} days inactive)`);
                } catch (error) {
                    console.error(`Error cleaning up user ${user.phoneNumber}:`, error.message);
                    cleanupResults.push({
                        phoneNumber: user.phoneNumber,
                        name: user.name,
                        daysSinceActivity: user.daysSinceActivity,
                        success: false,
                        error: error.message
                    });
                }
            }

            return {
                totalProcessed: inactiveUsers.length,
                results: cleanupResults,
                summary: {
                    successful: cleanupResults.filter(r => r.success).length,
                    failed: cleanupResults.filter(r => !r.success).length,
                    totalRemindersDeleted: cleanupResults.reduce((sum, r) => sum + (r.remindersDeleted || 0), 0),
                    totalSessionsDeleted: cleanupResults.reduce((sum, r) => sum + (r.sessionsDeleted || 0), 0)
                }
            };
        } catch (error) {
            console.error('Error in bulk cleanup of inactive users:', error);
            throw error;
        }
    }

    // Get database storage statistics
    async getDatabaseStats() {
        try {
            const stats = {
                users: {
                    total: await User.countDocuments(),
                    active: await User.countDocuments({ isActive: true }),
                    inactive: await User.countDocuments({ isActive: false })
                },
                reminders: {
                    total: await Reminder.countDocuments(),
                    pending: await Reminder.countDocuments({ isSent: false }),
                    sent: await Reminder.countDocuments({ isSent: true }),
                    recurring: await Reminder.countDocuments({ isRecurring: true })
                },
                sessions: {
                    total: await ActiveSession.countDocuments(),
                    recent: await ActiveSession.countDocuments({
                        lastBackup: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                    })
                }
            };

            return stats;
        } catch (error) {
            console.error('Error getting database stats:', error);
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
