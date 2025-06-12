const moment = require('moment-timezone');

class TimezoneUtils {
    constructor() {
        // Default timezone fallback
        this.defaultTimezone = 'Asia/Calcutta';
        
        // Common timezone mappings for better user experience
        this.timezoneAliases = {
            'ist': 'Asia/Calcutta',
            'indian': 'Asia/Calcutta',
            'india': 'Asia/Calcutta',
            'kolkata': 'Asia/Calcutta',
            'mumbai': 'Asia/Calcutta',
            'delhi': 'Asia/Calcutta',
            'pst': 'America/Los_Angeles',
            'est': 'America/New_York',
            'utc': 'UTC',
            'gmt': 'GMT'
        };
    }

    /**
     * Detect timezone from various sources
     * @param {string} userInput - User provided timezone hint
     * @param {string} phoneNumber - User's phone number for country detection
     * @returns {string} - Valid timezone identifier
     */
    detectUserTimezone(userInput = null, phoneNumber = null) {
        try {
            // 1. If user explicitly provided timezone
            if (userInput) {
                const normalizedInput = userInput.toLowerCase().trim();
                
                // Check aliases first
                if (this.timezoneAliases[normalizedInput]) {
                    return this.timezoneAliases[normalizedInput];
                }
                
                // Check if it's a valid timezone
                if (moment.tz.zone(userInput)) {
                    return userInput;
                }
            }

            // 2. Try to detect from phone number country code
            if (phoneNumber) {
                const timezone = this.getTimezoneFromPhoneNumber(phoneNumber);
                if (timezone) {
                    return timezone;
                }
            }

            // 3. Try to get system timezone
            const systemTimezone = this.getSystemTimezone();
            if (systemTimezone) {
                return systemTimezone;
            }

            // 4. Fallback to default
            return this.defaultTimezone;

        } catch (error) {
            console.error('Timezone detection error:', error.message);
            return this.defaultTimezone;
        }
    }

    /**
     * Get system timezone
     * @returns {string|null} - System timezone or null
     */
    getSystemTimezone() {
        try {
            // Try multiple methods to get system timezone
            
            // Method 1: Intl.DateTimeFormat
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (timezone && moment.tz.zone(timezone)) {
                return timezone;
            }

            // Method 2: From Date object
            const date = new Date();
            const offset = -date.getTimezoneOffset();
            const guessedTimezone = moment.tz.guess();
            
            if (guessedTimezone && moment.tz.zone(guessedTimezone)) {
                return guessedTimezone;
            }

            return null;
        } catch (error) {
            console.error('System timezone detection error:', error.message);
            return null;
        }
    }

    /**
     * Get timezone from phone number country code
     * @param {string} phoneNumber - Phone number with country code
     * @returns {string|null} - Timezone or null
     */
    getTimezoneFromPhoneNumber(phoneNumber) {
        try {
            // Remove any non-numeric characters except +
            const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
            
            // Common country code to timezone mappings
            const countryTimezones = {
                '+91': 'Asia/Calcutta',        // India
                '+1': 'America/New_York',      // US/Canada (default to EST)
                '+44': 'Europe/London',        // UK
                '+86': 'Asia/Shanghai',        // China
                '+81': 'Asia/Tokyo',           // Japan
                '+49': 'Europe/Berlin',        // Germany
                '+33': 'Europe/Paris',         // France
                '+39': 'Europe/Rome',          // Italy
                '+34': 'Europe/Madrid',        // Spain
                '+7': 'Europe/Moscow',         // Russia
                '+55': 'America/Sao_Paulo',    // Brazil
                '+52': 'America/Mexico_City',  // Mexico
                '+61': 'Australia/Sydney',     // Australia
                '+27': 'Africa/Johannesburg',  // South Africa
                '+20': 'Africa/Cairo',         // Egypt
                '+971': 'Asia/Dubai',          // UAE
                '+966': 'Asia/Riyadh',         // Saudi Arabia
                '+92': 'Asia/Karachi',         // Pakistan
                '+880': 'Asia/Dhaka',          // Bangladesh
                '+94': 'Asia/Colombo',         // Sri Lanka
                '+977': 'Asia/Kathmandu',      // Nepal
                '+65': 'Asia/Singapore',       // Singapore
                '+60': 'Asia/Kuala_Lumpur',    // Malaysia
                '+62': 'Asia/Jakarta',         // Indonesia
                '+66': 'Asia/Bangkok',         // Thailand
                '+84': 'Asia/Ho_Chi_Minh',     // Vietnam
                '+63': 'Asia/Manila',          // Philippines
            };

            // Find matching country code
            for (const [countryCode, timezone] of Object.entries(countryTimezones)) {
                if (cleanNumber.startsWith(countryCode)) {
                    return timezone;
                }
            }

            return null;
        } catch (error) {
            console.error('Phone number timezone detection error:', error.message);
            return null;
        }
    }

    /**
     * Convert time to user's timezone
     * @param {moment.Moment|string|Date} time - Time to convert
     * @param {string} userTimezone - Target timezone
     * @returns {moment.Moment} - Time in user's timezone
     */
    toUserTimezone(time, userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            
            if (moment.isMoment(time)) {
                return time.tz(timezone);
            }
            
            return moment.tz(time, timezone);
        } catch (error) {
            console.error('Timezone conversion error:', error.message);
            return moment.tz(time, this.defaultTimezone);
        }
    }

    /**
     * Parse user time input with timezone consideration
     * @param {string} timeString - User input time
     * @param {string} userTimezone - User's timezone
     * @param {moment.Moment} baseDate - Base date for parsing
     * @returns {moment.Moment|null} - Parsed time in user timezone
     */
    parseUserTime(timeString, userTimezone, baseDate = null) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            const base = baseDate ? moment.tz(baseDate, timezone) : moment.tz(timezone);
            
            const input = timeString.toLowerCase().trim();
            
            // Handle special keywords
            if (input === 'noon') {
                return base.clone().hour(12).minute(0).second(0);
            }
            if (input === 'midnight') {
                return base.clone().hour(0).minute(0).second(0);
            }
            if (input === 'morning') {
                return base.clone().hour(9).minute(0).second(0);
            }
            if (input === 'afternoon') {
                return base.clone().hour(14).minute(0).second(0);
            }
            if (input === 'evening') {
                return base.clone().hour(18).minute(0).second(0);
            }
            if (input === 'night') {
                return base.clone().hour(21).minute(0).second(0);
            }

            // Parse time formats
            const timeFormats = [
                'h:mm A', 'h A', 'ha', 'h:mm a', 'h a',
                'HH:mm', 'H:mm', 'HH', 'H'
            ];
            
            for (const format of timeFormats) {
                const parsed = moment.tz(timeString, format, timezone, true);
                if (parsed.isValid()) {
                    return base.clone()
                        .hour(parsed.hour())
                        .minute(parsed.minute())
                        .second(0);
                }
            }
            
            return null;
        } catch (error) {
            console.error('Time parsing error:', error.message);
            return null;
        }
    }

    /**
     * Parse user date input with timezone consideration
     * @param {string} dateString - User input date
     * @param {string} userTimezone - User's timezone
     * @returns {moment.Moment|null} - Parsed date in user timezone
     */
    parseUserDate(dateString, userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            const input = dateString.toLowerCase().trim();
            
            // Handle relative dates
            if (input === 'today') {
                return moment.tz(timezone).startOf('day');
            }
            if (input === 'tomorrow') {
                return moment.tz(timezone).add(1, 'day').startOf('day');
            }
            
            // Handle weekdays
            const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            for (let i = 0; i < weekdays.length; i++) {
                if (input.includes(`next ${weekdays[i]}`)) {
                    return moment.tz(timezone).day(i + 7).startOf('day');
                }
                if (input === weekdays[i]) {
                    const nextDay = moment.tz(timezone).day(i).startOf('day');
                    return nextDay.isBefore(moment.tz(timezone), 'day') ? 
                        nextDay.add(7, 'days') : nextDay;
                }
            }
            
            // Parse date formats
            const dateFormats = [
                'YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY',
                'MMMM D', 'MMM D', 'MMMM D, YYYY', 'MMM D, YYYY'
            ];
            
            for (const format of dateFormats) {
                const parsed = moment.tz(dateString, format, timezone, true);
                if (parsed.isValid()) {
                    // If no year specified, assume current year or next year if date has passed
                    if (!format.includes('YYYY')) {
                        parsed.year(moment.tz(timezone).year());
                        if (parsed.isBefore(moment.tz(timezone), 'day')) {
                            parsed.add(1, 'year');
                        }
                    }
                    return parsed.startOf('day');
                }
            }
            
            return null;
        } catch (error) {
            console.error('Date parsing error:', error.message);
            return null;
        }
    }

    /**
     * Format time for user display
     * @param {moment.Moment} time - Time to format
     * @param {string} userTimezone - User's timezone
     * @param {string} format - Format string
     * @returns {string} - Formatted time string
     */
    formatForUser(time, userTimezone, format = 'MMMM Do, YYYY [at] h:mm A') {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            const userTime = this.toUserTimezone(time, timezone);
            return userTime.format(format);
        } catch (error) {
            console.error('Time formatting error:', error.message);
            return time.format(format);
        }
    }

    /**
     * Get current time in user's timezone
     * @param {string} userTimezone - User's timezone
     * @returns {moment.Moment} - Current time in user timezone
     */
    nowInUserTimezone(userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            return moment.tz(timezone);
        } catch (error) {
            console.error('Current time error:', error.message);
            return moment.tz(this.defaultTimezone);
        }
    }

    /**
     * Check if a timezone is valid
     * @param {string} timezone - Timezone to validate
     * @returns {boolean} - True if valid
     */
    isValidTimezone(timezone) {
        try {
            return !!moment.tz.zone(timezone);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get timezone information for user
     * @param {string} userTimezone - User's timezone
     * @returns {object} - Timezone information
     */
    getTimezoneInfo(userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            const now = moment.tz(timezone);
            const zone = moment.tz.zone(timezone);
            
            return {
                name: timezone,
                abbreviation: now.format('z'),
                offset: now.format('Z'),
                offsetMinutes: now.utcOffset(),
                isDST: now.isDST(),
                currentTime: now.format('YYYY-MM-DD HH:mm:ss'),
                utcTime: now.utc().format('YYYY-MM-DD HH:mm:ss')
            };
        } catch (error) {
            console.error('Timezone info error:', error.message);
            return {
                name: this.defaultTimezone,
                error: error.message
            };
        }
    }

    /**
     * Auto-detect and set user timezone
     * @param {string} phoneNumber - User's phone number
     * @param {string} userInput - Optional user timezone input
     * @returns {Promise<string>} - Detected timezone
     */
    async autoDetectTimezone(phoneNumber, userInput = null) {
        try {
            console.log(`🕐 Auto-detecting timezone for user: ${phoneNumber}`);
            
            // Try different detection methods
            const detectedTimezone = this.detectUserTimezone(userInput, phoneNumber);
            
            console.log(`🕐 Detected timezone: ${detectedTimezone} for user: ${phoneNumber}`);
            
            return detectedTimezone;
        } catch (error) {
            console.error('Auto timezone detection error:', error.message);
            return this.defaultTimezone;
        }
    }

    /**
     * Get current time in a specific timezone
     * @param {string} userTimezone - User's timezone
     * @returns {moment.Moment} - Current time in user timezone
     */
    getCurrentTimeInTimezone(userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            return moment.tz(timezone);
        } catch (error) {
            console.error('Get current time error:', error.message);
            return moment.tz(this.defaultTimezone);
        }
    }

    /**
     * Get timezone display name
     * @param {string} userTimezone - User's timezone
     * @returns {string} - Human-readable timezone name
     */
    getTimezoneDisplayName(userTimezone) {
        try {
            const timezone = userTimezone || this.defaultTimezone;
            const now = moment.tz(timezone);
            
            // Create a readable timezone name
            const zoneName = timezone.replace('_', ' ');
            const abbreviation = now.format('z');
            const offset = now.format('Z');
            
            return `${zoneName} (${abbreviation}, UTC${offset})`;
        } catch (error) {
            console.error('Get timezone display name error:', error.message);
            return `${userTimezone || this.defaultTimezone} (Local Time)`;
        }
    }
}

module.exports = TimezoneUtils;
