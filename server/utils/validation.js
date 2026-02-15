function sanitizeInput(text) {
    if (typeof text !== 'string') return '';
    
    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim()
        .substring(0, 500); // Max 500 characters
}

function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, error: 'Nickname is required' };
    }
    
    const cleaned = nickname.trim();
    
    if (cleaned.length < 3 || cleaned.length > 20) {
        return { valid: false, error: 'Nickname must be 3-20 characters' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
        return { valid: false, error: 'Nickname can only contain letters, numbers, underscore, and hyphen' };
    }
    
    return { valid: true, nickname: cleaned };
}

function validateCampus(campus) {
    const validCampuses = [
        'bulan',
        'castilla',
        'magallanes',
        'sorsogon-city'
    ];
    
    if (!campus || !validCampuses.includes(campus.toLowerCase())) {
        return { valid: false, error: 'Invalid campus selection' };
    }
    
    return { valid: true, campus: campus.toLowerCase() };
}

function containsProfanity(text) {
    const profanityList = [
        'badword1', 'badword2', // Add actual profanity words here
        // This is a placeholder - add appropriate filter words
    ];
    
    const lowerText = text.toLowerCase();
    return profanityList.some(word => lowerText.includes(word));
}

function detectSpam(messages, userId, timeWindow = 60000) {
    // Check if user sent more than 10 messages in last minute
    const recentMessages = messages.filter(msg => 
        msg.userId === userId && 
        Date.now() - msg.timestamp < timeWindow
    );
    
    return recentMessages.length > 10;
}

module.exports = {
    sanitizeInput,
    validateNickname,
    validateCampus,
    containsProfanity,
    detectSpam
};
