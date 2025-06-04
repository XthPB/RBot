# WhatsApp Reminder Bot

A simple command-based WhatsApp bot that helps you create and manage reminders directly through WhatsApp chat.

## Features

- ✅ Create reminders with `/reminder` command
- 📋 List all your reminders with `/list`
- 🗑️ Delete reminders with `/delete [ID]`
- ⏰ Automatic reminder notifications
- 📱 Interactive chat-based setup
- 🔒 User-specific reminders (only you can see your reminders)

## Setup Instructions

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- WhatsApp account

### Installation

1. **Clone or download this project**
   ```bash
   cd whatsapp_rem
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   copy .env.example .env
   ```
   Edit the `.env` file if needed (default settings should work fine).

4. **Start the bot**
   ```bash
   npm start
   ```

5. **Scan QR Code**
   - A QR code will appear in your terminal
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices > Link a Device
   - Scan the QR code from your terminal

6. **Start using the bot**
   - Send `/help` to see available commands
   - Send `/reminder` to create your first reminder

## How to Use

### Creating a Reminder

1. Type `/reminder` in any chat with yourself or the bot
2. Follow the interactive prompts:
   - **Activity**: What you want to be reminded about
   - **Date**: When (today, tomorrow, 2025-01-15, etc.)
   - **Time**: What time (2 PM, 14:30, noon, etc.)
   - **Confirm**: Type "yes" to save

### Other Commands

- `/list` - View all your reminders
- `/delete 1` - Delete reminder with ID 1
- `/help` - Show help message

### Example Usage

```
You: /reminder
Bot: 🔔 Reminder Creation Started
     Step 1: Activity
     What would you like to be reminded about?

You: Call dentist
Bot: ✅ Activity: Call dentist
     Step 2: Date
     When should I remind you?

You: tomorrow
Bot: ✅ Date: January 5, 2025
     Step 3: Time
     What time should I remind you?

You: 2 PM
Bot: 🔔 Reminder Summary
     Activity: Call dentist
     Date & Time: January 5, 2025 at 2:00 PM
     Is this correct? Reply "yes" to save

You: yes
Bot: ✅ Reminder Saved Successfully!
```

## Supported Date Formats

- `today`, `tomorrow`
- `2025-01-15` (YYYY-MM-DD)
- `January 15` or `Jan 15`
- `next Monday`, `next Tuesday`

## Supported Time Formats

- `2 PM`, `2:30 PM`
- `14:30`, `14:00`
- `noon`, `midnight`

## Deployment Options

### Local Development
- Run `npm start` on your local machine
- Keep your computer running for the bot to work

### Cloud Deployment (Recommended)

1. **Railway**
   - Connect your GitHub repository to Railway
   - Add environment variables
   - Deploy automatically

2. **Heroku**
   - Create a Heroku app
   - Connect to GitHub
   - Add environment variables

3. **VPS (DigitalOcean, Linode)**
   - Upload code to your server
   - Install Node.js and dependencies
   - Use PM2 to keep the bot running

### Environment Variables

- `BOT_NAME`: Name of your bot (default: ReminderBot)
- `TIMEZONE`: Your timezone (default: Asia/Calcutta)
- `DB_PATH`: Database file path (default: ./reminders.db)

## Database

The bot uses SQLite database (`reminders.db`) to store:
- User information
- Reminder details
- Reminder status

The database file is created automatically when you first run the bot.

## Troubleshooting

### QR Code Issues
- Make sure your terminal supports QR code display
- Try resizing your terminal window
- Ensure good lighting when scanning

### Bot Not Responding
- Check if the bot process is still running
- Restart the bot with `npm start`
- Check console for error messages

### Reminder Not Sent
- Verify the date/time was set correctly
- Check if the bot is still connected to WhatsApp
- Look for error messages in the console

## Security Notes

- The bot runs on your WhatsApp account
- Only you can create reminders for yourself
- Database is stored locally
- No data is sent to external servers (except WhatsApp)

## Limitations

- Requires constant internet connection
- WhatsApp Web session may expire periodically
- Limited to text-based reminders
- No recurring reminders yet (can be added)

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use and modify as needed.
