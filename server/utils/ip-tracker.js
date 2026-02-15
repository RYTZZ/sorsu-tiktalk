function getClientIP(req) {
    // Check various headers for real IP (useful behind proxies like Render)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
        return realIP;
    }
    
    return req.connection.remoteAddress || req.socket.remoteAddress || '0.0.0.0';
}

function getSocketIP(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    
    const realIP = socket.handshake.headers['x-real-ip'];
    if (realIP) {
        return realIP;
    }
    
    return socket.handshake.address || '0.0.0.0';
}

module.exports = {
    getClientIP,
    getSocketIP
};
