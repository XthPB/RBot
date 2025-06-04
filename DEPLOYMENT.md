# WhatsApp Reminder Bot - Deployment Guide

This guide will help you deploy your WhatsApp reminder bot for 24/7 operation using cloud services.

## Step 1: Setup MongoDB Atlas (Free Cloud Database)

### Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Sign up for a free account
3. Create a new project called "WhatsApp Reminder Bot"

### Create Database Cluster
1. Click "Build a Database"
2. Choose "M0 FREE" tier
3. Select your preferred cloud provider and region
4. Name your cluster (e.g., "reminder-cluster")
5. Click "Create Cluster"

### Setup Database Access
1. Go to "Database Access" in the left sidebar
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Username: `reminderbot`
5. Generate a secure password and save it
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"

### Setup Network Access
1. Go to "Network Access" in the left sidebar
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (0.0.0.0/0)
4. Click "Confirm"

### Get Connection String
1. Go to "Database" in the left sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your database user password
6. Replace `<dbname>` with `whatsapp-reminders`

Example: `mongodb+srv://reminderbot:yourpassword@reminder-cluster.xxxxx.mongodb.net/whatsapp-reminders?retryWrites=true&w=majority`

## Step 2: Choose Deployment Platform

### Option A: Railway (Recommended - Easy)

1. **Create Railway Account**
   - Go to [Railway](https://railway.app)
   - Sign up with GitHub

2. **Deploy from GitHub**
   - Push your code to GitHub repository
   - Connect GitHub to Railway
   - Deploy your repository

3. **Add Environment Variables**
   ```
   MONGODB_URI=your_mongodb_atlas_connection_string
   BOT_NAME=ReminderBot
   TIMEZONE=Asia/Calcutta
   ```

4. **Deploy**
   - Railway will automatically build and deploy
   - Your bot will be running 24/7

### Option B: Render (Free Tier)

1. **Create Render Account**
   - Go to [Render](https://render.com)
   - Sign up with GitHub

2. **Create Web Service**
   - Connect your GitHub repository
   - Choose "Web Service"
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Add Environment Variables**
   - Same as Railway above

### Option C: Heroku (Easy but requires payment after Nov 2022)

1. **Create Heroku Account**
   - Go to [Heroku](https://heroku.com)
   - Create new app

2. **Deploy**
   - Connect GitHub or use Heroku CLI
   - Add environment variables in Settings > Config Vars

### Option D: VPS (DigitalOcean, Linode, etc.)

1. **Create VPS**
   - 1GB RAM minimum
   - Ubuntu 20.04 LTS

2. **Setup Server**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
   
   # Clone your repository
   git clone https://github.com/yourusername/whatsapp-reminder-bot.git
   cd whatsapp-reminder-bot
   
   # Install dependencies
   npm install
   
   # Create .env file with your MongoDB URI
   nano .env
   
   # Start with PM2
   pm2 start index.js --name whatsapp-bot
   pm2 startup
   pm2 save
   ```

## Step 3: Configure WhatsApp Connection

### First-Time Setup
1. Deploy your bot to your chosen platform
2. Check the logs to see the QR code (for Railway/Render, check the deployment logs)
3. For VPS, you can use the browser-based QR code or SSH with X forwarding

### Alternative: Use WhatsApp Web Session Upload
If you can't scan QR in production:

1. Run bot locally first:
   ```bash
   npm install
   npm start
   ```
2. Scan QR code locally
3. Copy the `.wwebjs_auth` folder to your production server
4. Restart the production bot

## Step 4: Monitoring and Maintenance

### Check Bot Status
- **Railway**: Check the deployment logs
- **VPS**: Use `pm2 status` and `pm2 logs whatsapp-bot`

### Restart Bot if Needed
- **Railway**: Redeploy from dashboard
- **VPS**: `pm2 restart whatsapp-bot`

### Database Monitoring
- Check MongoDB Atlas dashboard for usage
- Free tier: 512MB storage, shared RAM

## Step 5: Domain and Custom Features (Optional)

### Custom Domain
- Add custom domain in your hosting platform
- Point DNS to your deployment

### Webhook Notifications
Add webhook support to get notified when reminders are sent:

```javascript
// Add to your bot code
const axios = require('axios');

async function sendWebhook(reminder) {
    if (process.env.WEBHOOK_URL) {
        try {
            await axios.post(process.env.WEBHOOK_URL, {
                type: 'reminder_sent',
                user: reminder.user_number,
                message: reminder.message,
                time: reminder.reminder_time
            });
        } catch (error) {
            console.error('Webhook error:', error);
        }
    }
}
```

## Troubleshooting

### Common Issues

1. **QR Code Not Showing**
   - Check if headless mode is disabled for first setup
   - Use local setup first, then upload session

2. **Bot Not Responding**
   - Check WhatsApp Web session hasn't expired
   - Restart the bot
   - Check database connection

3. **Reminders Not Sending**
   - Verify cron job is running
   - Check database for pending reminders
   - Ensure bot has internet connection

4. **Database Connection Issues**
   - Verify MongoDB URI is correct
   - Check network access rules in MongoDB Atlas
   - Ensure IP whitelist includes your server

### Cost Estimates (Monthly)

- **MongoDB Atlas**: FREE (512MB)
- **Railway**: FREE (500 hours) then $5/month
- **Render**: FREE (750 hours) then $7/month
- **DigitalOcean VPS**: $4/month (1GB RAM)
- **Heroku**: $7/month

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` to git
   - Use strong database passwords
   - Rotate credentials periodically

2. **Database Security**
   - Limit IP access when possible
   - Use read-only users for monitoring
   - Regular backups

3. **Code Security**
   - Keep dependencies updated
   - Use input validation
   - Log security events

## Scaling for More Users

If you get more than 1000 reminders per month:

1. **Database**: Upgrade MongoDB Atlas to M2 ($9/month)
2. **Server**: Increase server resources
3. **Optimization**: Add database indexing and caching

## Support

For issues:
1. Check the deployment logs first
2. Verify environment variables
3. Test database connection separately
4. Check WhatsApp Web session status

Your bot is now ready for 24/7 operation! 🚀
