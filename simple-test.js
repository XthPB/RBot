const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🔧 Starting Simple WhatsApp Connection Test...');
console.log('💡 If this doesn\'t work, we\'ll clear the session data');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth_test'
    }),
    puppeteer: {
        headless: false, // Try non-headless for better debugging
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('📱 Scan this QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('✅ Authentication successful!');
});

client.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
    console.log('📱 Send ANY message to ANY chat to test');
});

client.on('message', (message) => {
    console.log('🔔 MESSAGE RECEIVED:', {
        from: message.from,
        body: message.body,
        type: message.type,
        fromMe: message.fromMe,
        timestamp: new Date().toLocaleTimeString()
    });
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    console.log('📴 Disconnected:', reason);
});

client.initialize().catch(err => {
    console.error('❌ Failed to initialize:', err);
});

console.log('⏳ Initializing WhatsApp client...');
