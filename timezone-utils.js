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
            
            // Enhanced country code to timezone mappings
            const countryTimezones = {
                // United States & Canada (handle specific area codes for US)
                '+1': this.getUSTimezoneFromAreaCode(cleanNumber),
                
                // India
                '+91': 'Asia/Calcutta',
                
                // Major countries
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
                '+82': 'Asia/Seoul',           // South Korea
                '+886': 'Asia/Taipei',         // Taiwan
                '+852': 'Asia/Hong_Kong',      // Hong Kong
                '+853': 'Asia/Macau',          // Macau
                '+90': 'Europe/Istanbul',      // Turkey
                '+98': 'Asia/Tehran',          // Iran
                '+972': 'Asia/Jerusalem',      // Israel
                '+234': 'Africa/Lagos',        // Nigeria
                '+254': 'Africa/Nairobi',      // Kenya
                '+256': 'Africa/Kampala',      // Uganda
                '+260': 'Africa/Lusaka',       // Zambia
                '+263': 'Africa/Harare',       // Zimbabwe
                '+31': 'Europe/Amsterdam',     // Netherlands
                '+32': 'Europe/Brussels',      // Belgium
                '+41': 'Europe/Zurich',        // Switzerland
                '+43': 'Europe/Vienna',        // Austria
                '+45': 'Europe/Copenhagen',    // Denmark
                '+46': 'Europe/Stockholm',     // Sweden
                '+47': 'Europe/Oslo',          // Norway
                '+358': 'Europe/Helsinki',     // Finland
                '+351': 'Europe/Lisbon',       // Portugal
                '+30': 'Europe/Athens',        // Greece
                '+420': 'Europe/Prague',       // Czech Republic
                '+48': 'Europe/Warsaw',        // Poland
                '+36': 'Europe/Budapest',      // Hungary
                '+40': 'Europe/Bucharest',     // Romania
                '+359': 'Europe/Sofia',        // Bulgaria
                '+385': 'Europe/Zagreb',       // Croatia
                '+381': 'Europe/Belgrade',     // Serbia
                '+380': 'Europe/Kiev',         // Ukraine
                '+375': 'Europe/Minsk',        // Belarus
                '+370': 'Europe/Vilnius',      // Lithuania
                '+371': 'Europe/Riga',         // Latvia
                '+372': 'Europe/Tallinn',      // Estonia
            };

            // Find matching country code
            for (const [countryCode, timezone] of Object.entries(countryTimezones)) {
                if (cleanNumber.startsWith(countryCode)) {
                    // If it's a function (like US detection), call it
                    if (typeof timezone === 'function') {
                        return timezone;
                    }
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
     * Get US timezone from area code (handles Fort Wayne and other US cities)
     * @param {string} phoneNumber - Full US phone number with +1
     * @returns {string} - US timezone
     */
    getUSTimezoneFromAreaCode(phoneNumber) {
        try {
            // Extract area code (first 3 digits after +1)
            const areaCodeMatch = phoneNumber.match(/^\+1(\d{3})/);
            if (!areaCodeMatch) {
                return 'America/New_York'; // Default to Eastern
            }
            
            const areaCode = areaCodeMatch[1];
            
            // US Area Code to Timezone mapping
            const usAreaCodes = {
                // Eastern Time Zone (EST/EDT)
                '212': 'America/New_York',    // New York City
                '646': 'America/New_York',    // New York City
                '347': 'America/New_York',    // New York City
                '718': 'America/New_York',    // New York City
                '917': 'America/New_York',    // New York City
                '929': 'America/New_York',    // New York City
                '201': 'America/New_York',    // New Jersey
                '973': 'America/New_York',    // New Jersey
                '215': 'America/New_York',    // Philadelphia
                '267': 'America/New_York',    // Philadelphia
                '445': 'America/New_York',    // Philadelphia
                '484': 'America/New_York',    // Pennsylvania
                '610': 'America/New_York',    // Pennsylvania
                '717': 'America/New_York',    // Pennsylvania
                '412': 'America/New_York',    // Pittsburgh
                '404': 'America/New_York',    // Atlanta
                '678': 'America/New_York',    // Atlanta
                '770': 'America/New_York',    // Atlanta
                '470': 'America/New_York',    // Atlanta
                '305': 'America/New_York',    // Miami
                '786': 'America/New_York',    // Miami
                '954': 'America/New_York',    // Fort Lauderdale
                '561': 'America/New_York',    // West Palm Beach
                '407': 'America/New_York',    // Orlando
                '321': 'America/New_York',    // Orlando
                '727': 'America/New_York',    // St. Petersburg
                '813': 'America/New_York',    // Tampa
                '850': 'America/New_York',    // Tallahassee
                '904': 'America/New_York',    // Jacksonville
                
                // Central Time Zone (CST/CDT)
                '312': 'America/Chicago',     // Chicago
                '773': 'America/Chicago',     // Chicago
                '872': 'America/Chicago',     // Chicago
                '708': 'America/Chicago',     // Chicago suburbs
                '630': 'America/Chicago',     // Chicago suburbs
                '847': 'America/Chicago',     // Chicago suburbs
                '224': 'America/Chicago',     // Chicago suburbs
                '331': 'America/Chicago',     // Chicago suburbs
                '346': 'America/Chicago',     // Houston
                '713': 'America/Chicago',     // Houston
                '281': 'America/Chicago',     // Houston
                '832': 'America/Chicago',     // Houston
                '409': 'America/Chicago',     // Beaumont
                '430': 'America/Chicago',     // Northeast Texas
                '903': 'America/Chicago',     // Tyler
                '940': 'America/Chicago',     // Wichita Falls
                '972': 'America/Chicago',     // Dallas
                '214': 'America/Chicago',     // Dallas
                '469': 'America/Chicago',     // Dallas
                '945': 'America/Chicago',     // Dallas
                '817': 'America/Chicago',     // Fort Worth
                '430': 'America/Chicago',     // Northeast Texas
                '512': 'America/Chicago',     // Austin
                '737': 'America/Chicago',     // Austin
                '210': 'America/Chicago',     // San Antonio
                '726': 'America/Chicago',     // San Antonio
                '956': 'America/Chicago',     // Laredo
                '979': 'America/Chicago',     // College Station
                
                // Mountain Time Zone (MST/MDT)
                '303': 'America/Denver',      // Denver
                '720': 'America/Denver',      // Denver
                '970': 'America/Denver',      // Fort Collins
                '719': 'America/Denver',      // Colorado Springs
                '505': 'America/Denver',      // New Mexico
                '575': 'America/Denver',      // New Mexico
                '406': 'America/Denver',      // Montana
                '307': 'America/Denver',      // Wyoming
                '435': 'America/Denver',      // Utah
                '801': 'America/Denver',      // Salt Lake City
                '385': 'America/Denver',      // Salt Lake City
                '208': 'America/Denver',      // Idaho
                '480': 'America/Phoenix',     // Phoenix (Arizona - no DST)
                '602': 'America/Phoenix',     // Phoenix
                '623': 'America/Phoenix',     // Phoenix
                '928': 'America/Phoenix',     // Arizona
                '520': 'America/Phoenix',     // Arizona
                
                // Pacific Time Zone (PST/PDT)
                '213': 'America/Los_Angeles', // Los Angeles
                '323': 'America/Los_Angeles', // Los Angeles
                '310': 'America/Los_Angeles', // Los Angeles
                '424': 'America/Los_Angeles', // Los Angeles
                '747': 'America/Los_Angeles', // Los Angeles
                '818': 'America/Los_Angeles', // Los Angeles
                '661': 'America/Los_Angeles', // California
                '805': 'America/Los_Angeles', // California
                '831': 'America/Los_Angeles', // California
                '408': 'America/Los_Angeles', // San Jose
                '669': 'America/Los_Angeles', // San Jose
                '415': 'America/Los_Angeles', // San Francisco
                '628': 'America/Los_Angeles', // San Francisco
                '510': 'America/Los_Angeles', // Oakland
                '925': 'America/Los_Angeles', // California
                '650': 'America/Los_Angeles', // California
                '707': 'America/Los_Angeles', // California
                '916': 'America/Los_Angeles', // Sacramento
                '279': 'America/Los_Angeles', // Sacramento
                '530': 'America/Los_Angeles', // Northern California
                '559': 'America/Los_Angeles', // Fresno
                '209': 'America/Los_Angeles', // Stockton
                '951': 'America/Los_Angeles', // Riverside
                '760': 'America/Los_Angeles', // San Diego
                '442': 'America/Los_Angeles', // San Diego
                '619': 'America/Los_Angeles', // San Diego
                '858': 'America/Los_Angeles', // San Diego
                '206': 'America/Los_Angeles', // Seattle
                '253': 'America/Los_Angeles', // Tacoma
                '425': 'America/Los_Angeles', // Bellevue
                '564': 'America/Los_Angeles', // Washington
                '360': 'America/Los_Angeles', // Washington
                '509': 'America/Los_Angeles', // Spokane
                '503': 'America/Los_Angeles', // Portland
                '971': 'America/Los_Angeles', // Portland
                '458': 'America/Los_Angeles', // Oregon
                '541': 'America/Los_Angeles', // Oregon
                
                // Indiana (Fort Wayne and other cities)
                '260': 'America/Indiana/Indianapolis', // Fort Wayne - EASTERN TIME
                '574': 'America/Indiana/Indianapolis', // South Bend - EASTERN TIME  
                '765': 'America/Indiana/Indianapolis', // Lafayette - EASTERN TIME
                '812': 'America/Indiana/Indianapolis', // Southern Indiana - EASTERN TIME
                '930': 'America/Indiana/Indianapolis', // Indiana - EASTERN TIME
                '317': 'America/Indiana/Indianapolis', // Indianapolis - EASTERN TIME
                '463': 'America/Indiana/Indianapolis', // Indianapolis - EASTERN TIME
                
                // Alaska
                '907': 'America/Anchorage',   // Alaska
                
                // Hawaii
                '808': 'Pacific/Honolulu',    // Hawaii
                
                // Canada (Eastern)
                '416': 'America/Toronto',     // Toronto
                '647': 'America/Toronto',     // Toronto
                '437': 'America/Toronto',     // Toronto
                '905': 'America/Toronto',     // Toronto area
                '289': 'America/Toronto',     // Toronto area
                '365': 'America/Toronto',     // Ontario
                '519': 'America/Toronto',     // Ontario
                '226': 'America/Toronto',     // Ontario
                '548': 'America/Toronto',     // Ontario
                '613': 'America/Toronto',     // Ottawa
                '343': 'America/Toronto',     // Ottawa
                '514': 'America/Toronto',     // Montreal
                '438': 'America/Toronto',     // Montreal
                '450': 'America/Toronto',     // Quebec
                '579': 'America/Toronto',     // Quebec
                '418': 'America/Toronto',     // Quebec City
                '581': 'America/Toronto',     // Quebec
                '819': 'America/Toronto',     // Quebec
                '873': 'America/Toronto',     // Quebec
                '902': 'America/Halifax',     // Nova Scotia
                '782': 'America/Halifax',     // Nova Scotia
                '506': 'America/Moncton',     // New Brunswick
                '709': 'America/St_Johns',    // Newfoundland
                
                // Canada (Central)
                '204': 'America/Winnipeg',    // Manitoba
                '431': 'America/Winnipeg',    // Manitoba
                '306': 'America/Regina',      // Saskatchewan
                '639': 'America/Regina',      // Saskatchewan
                
                // Canada (Mountain)
                '403': 'America/Edmonton',    // Alberta
                '587': 'America/Edmonton',    // Alberta
                '780': 'America/Edmonton',    // Alberta
                '825': 'America/Edmonton',    // Alberta
                
                // Canada (Pacific)
                '604': 'America/Vancouver',   // British Columbia
                '778': 'America/Vancouver',   // British Columbia
                '236': 'America/Vancouver',   // British Columbia
                '250': 'America/Vancouver',   // British Columbia
                '672': 'America/Vancouver',   // British Columbia
                
                // Default for unmapped area codes
            };

            // Return timezone for the area code, or default to Eastern
            return usAreaCodes[areaCode] || 'America/New_York';
            
        } catch (error) {
            console.error('US area code timezone detection error:', error.message);
            return 'America/New_York';
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
