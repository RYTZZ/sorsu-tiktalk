const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creating data directory:', err);
    }
}

// Read JSON file
async function readJSON(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return getDefaultData(filename);
        }
        console.error(`Error reading ${filename}:`, err);
        return getDefaultData(filename);
    }
}

// Write JSON file
async function writeJSON(filename, data) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${filename}:`, err);
        return false;
    }
}

// Get default data structure
function getDefaultData(filename) {
    const defaults = {
        'bans.json': {},
        'reports.json': [],
        'violations.json': {},
        'admin_actions.json': [],
        'admin_credentials.json': {
            users: [{
                username: 'admin',
                passwordHash: '$2a$10$YourHashedPasswordHere' // Default: 'admin123' - CHANGE IN PRODUCTION
            }]
        }
    };
    return defaults[filename] || {};
}

// Initialize all JSON files
async function initializeFiles() {
    await ensureDataDir();
    const files = ['bans.json', 'reports.json', 'violations.json', 'admin_actions.json', 'admin_credentials.json'];
    
    for (const file of files) {
        try {
            await fs.access(path.join(DATA_DIR, file));
        } catch {
            await writeJSON(file, getDefaultData(file));
            console.log(`Created ${file} with default data`);
        }
    }
}

module.exports = {
    readJSON,
    writeJSON,
    initializeFiles
};
