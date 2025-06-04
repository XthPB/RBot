const { GoogleGenerativeAI } = require('@google/generative-ai');
const moment = require('moment');

class GeminiService {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    }

    async parseReminderRequest(message) {
        const prompt = `
You are a smart reminder assistant. Parse the following message and extract reminder details.
Return a JSON object with the following structure:
{
    "isReminder": boolean,
    "reminderText": string,
    "dateTime": string (ISO format),
    "isRecurring": boolean,
    "recurrencePattern": string or null,
    "confidence": number (0-1)
}

Current date and time: ${moment().format('YYYY-MM-DD HH:mm:ss')}
Current timezone: Asia/Calcutta

Message to parse: "${message}"

Examples of valid reminder requests:
- "Remind me to call mom at 5 PM today"
- "Set a reminder for my meeting tomorrow at 2:30 PM"
- "Remind me to take medicine every day at 8 AM"
- "Meeting with client on Friday 3 PM"

If the message is not a reminder request, set isReminder to false.
If date/time is ambiguous or missing, make reasonable assumptions based on context.
For recurring reminders, identify patterns like "daily", "weekly", "every day", etc.

Return only valid JSON without any additional text.
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            // Clean and parse JSON response
            const cleanText = text.replace(/```json|```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            console.error('Error parsing reminder with Gemini:', error);
            return {
                isReminder: false,
                reminderText: '',
                dateTime: null,
                isRecurring: false,
                recurrencePattern: null,
                confidence: 0
            };
        }
    }

    async generateSmartResponse(context, userMessage) {
        const prompt = `
You are a helpful WhatsApp reminder bot. Generate a friendly and concise response.
Keep responses short and conversational, suitable for WhatsApp.

Context: ${context}
User message: "${userMessage}"

Provide a helpful response that acknowledges the user's request and provides relevant information.
If it's a reminder confirmation, be encouraging and clear about when the reminder will be sent.
If there's an error, be helpful and suggest alternatives.

Keep the response under 100 words and make it sound natural and friendly.
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error('Error generating smart response:', error);
            return "I'm here to help you with reminders! Try saying something like 'Remind me to call mom at 5 PM today' 😊";
        }
    }

    async generateReminderMessage(originalRequest, reminderText) {
        const prompt = `
Generate a personalized reminder message based on the original request.
Keep it friendly, clear, and include a gentle emoji.

Original request: "${originalRequest}"
Reminder text: "${reminderText}"

Make it sound like a helpful friend reminding you about something important.
Keep it under 50 words.
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error('Error generating reminder message:', error);
            return `⏰ Reminder: ${reminderText}`;
        }
    }
}

module.exports = GeminiService;
