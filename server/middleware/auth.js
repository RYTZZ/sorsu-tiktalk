const bcrypt = require('bcryptjs');
const { readJSON } = require('../utils/file-storage');

async function verifyAdmin(username, password) {
    const credentials = await readJSON('admin_credentials.json');
    const user = credentials.users.find(u => u.username === username);
    
    if (!user) {
        return { valid: false, error: 'Invalid credentials' };
    }
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValid) {
        return { valid: false, error: 'Invalid credentials' };
    }
    
    return { valid: true, username };
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    
    // Simple token verification (in production, use JWT)
    if (!token || token.length < 10) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Attach admin info to request
    req.admin = { token };
    next();
}

module.exports = {
    verifyAdmin,
    requireAuth
};
