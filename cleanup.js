const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning up WhatsApp session data...');

// Function to remove directory recursively
function removeDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`✅ Removed: ${dirPath}`);
    } else {
        console.log(`⚠️ Not found: ${dirPath}`);
    }
}

// Clean up all possible session directories
const sessionDirs = [
    '.wwebjs_auth',
    '.wwebjs_cache', 
    '.wwebjs_auth_test',
    'session',
    '.session'
];

sessionDirs.forEach(dir => {
    removeDir(path.join(__dirname, dir));
});

console.log('🎉 Cleanup complete! Session data cleared.');
console.log('📱 Now run: node simple-test.js');
console.log('📱 You will need to scan QR code again');
