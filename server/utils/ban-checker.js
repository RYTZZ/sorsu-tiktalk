const { readJSON } = require('./file-storage');
const crypto = require('crypto');

function hashIP(ip) {
    return crypto.createHash('sha256').update(ip).digest('hex');
}

async function checkBan(ip) {
    const bans = await readJSON('bans.json');
    const ipHash = hashIP(ip);
    
    if (!bans[ipHash]) {
        return { banned: false };
    }
    
    const ban = bans[ipHash];
    
    // Check if permanent ban
    if (ban.type === 'permanent') {
        return {
            banned: true,
            type: 'permanent',
            reason: ban.reason,
            bannedBy: ban.bannedBy
        };
    }
    
    // Check if temporary ban expired
    if (ban.type === 'temporary') {
        const bannedUntil = new Date(ban.bannedUntil);
        const now = new Date();
        
        if (now < bannedUntil) {
            return {
                banned: true,
                type: 'temporary',
                reason: ban.reason,
                bannedUntil: ban.bannedUntil,
                timeRemaining: Math.ceil((bannedUntil - now) / 1000) // seconds
            };
        }
    }
    
    return { banned: false };
}

async function addBan(ip, banData) {
    const { readJSON, writeJSON } = require('./file-storage');
    const bans = await readJSON('bans.json');
    const ipHash = hashIP(ip);
    
    bans[ipHash] = {
        ...banData,
        ipHash,
        timestamp: new Date().toISOString()
    };
    
    await writeJSON('bans.json', bans);
    return true;
}

async function removeBan(ip) {
    const { readJSON, writeJSON } = require('./file-storage');
    const bans = await readJSON('bans.json');
    const ipHash = hashIP(ip);
    
    if (bans[ipHash]) {
        delete bans[ipHash];
        await writeJSON('bans.json', bans);
        return true;
    }
    return false;
}

module.exports = {
    checkBan,
    addBan,
    removeBan,
    hashIP
};
