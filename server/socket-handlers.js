const { readJSON, writeJSON } = require('./utils/file-storage');
const { sanitizeInput, containsProfanity } = require('./utils/validation');
const { getSocketIP } = require('./utils/ip-tracker');
const { checkBan, hashIP } = require('./utils/ban-checker');

// In-memory storage
const chatMessages = {
    bulan: [],
    castilla: [],
    magallanes: [],
    'sorsogon-city': []
};

const dmConversations = new Map();
const onlineUsers = new Map(); // socketId -> user info
const typingUsers = new Map(); // room -> Set of nicknames

// Match chat system
const matchQueue = new Map(); // campus -> array of socket IDs waiting for match
const activeMatches = new Map(); // socketId -> matched socketId
const matchConversations = new Map(); // matchId -> array of messages

// Message reactions and interactions
const messageReactions = new Map(); // messageId -> { emoji -> [socketIds] }
const messageMentions = new Map(); // socketId -> array of mention notifications
const dmNotifications = new Map(); // socketId -> count of unread DMs

const MAX_MESSAGES_PER_CAMPUS = 100;
const MAX_MATCH_MESSAGES = 50;

function setupSocketHandlers(io) {
    io.on('connection', async (socket) => {
        const clientIP = getSocketIP(socket);
        console.log(`Client connected: ${socket.id} from ${clientIP}`);
        
        // Check if IP is banned
        const banStatus = await checkBan(clientIP);
        if (banStatus.banned) {
            socket.emit('banned', banStatus);
            socket.disconnect();
            return;
        }
        
        // User joins with nickname and campus
        socket.on('user:join', async (data) => {
            try {
                const { nickname, campus } = data;
                
                if (!nickname || !campus) {
                    socket.emit('error', { message: 'Nickname and campus required' });
                    return;
                }
                
                // Store user info
                onlineUsers.set(socket.id, {
                    nickname,
                    campus,
                    ip: clientIP,
                    joinedAt: new Date()
                });
                
                // Join campus room
                socket.join(campus);
                
                // Send recent messages
                const recentMessages = chatMessages[campus] || [];
                socket.emit('message:history', recentMessages);
                
                // Notify others
                io.to(campus).emit('user:joined', {
                    nickname,
                    campus,
                    onlineCount: getOnlineCount(campus)
                });
                
                console.log(`${nickname} joined ${campus}`);
            } catch (err) {
                console.error('Error in user:join:', err);
                socket.emit('error', { message: 'Failed to join' });
            }
        });
        
        // Send message to campus chat
        socket.on('message:send', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }
                
                const content = sanitizeInput(data.content);
                
                if (!content || content.length === 0) {
                    return;
                }
                
                if (content.length > 500) {
                    socket.emit('error', { message: 'Message too long (max 500 characters)' });
                    return;
                }
                
                // Check for profanity
                if (containsProfanity(content)) {
                    socket.emit('error', { message: 'Message contains inappropriate content' });
                    return;
                }
                
                // Check for mentions and extract them
                const mentions = extractMentions(content);
                
                const message = {
                    id: generateMessageId(),
                    nickname: user.nickname,
                    campus: user.campus,
                    content,
                    timestamp: new Date().toISOString(),
                    edited: false,
                    deleted: false,
                    replyTo: data.replyTo || null, // Thread/reply support
                    mentions: mentions,
                    reactions: {}
                };
                
                // Store message (keep last 100)
                if (!chatMessages[user.campus]) {
                    chatMessages[user.campus] = [];
                }
                
                chatMessages[user.campus].push(message);
                
                if (chatMessages[user.campus].length > MAX_MESSAGES_PER_CAMPUS) {
                    chatMessages[user.campus].shift(); // Remove oldest
                }
                
                // Broadcast to campus room
                io.to(user.campus).emit('message:receive', message);
                
                // Send notifications to mentioned users
                if (mentions.length > 0) {
                    for (const mentionedNick of mentions) {
                        // Find mentioned user's socket
                        for (const [socketId, userData] of onlineUsers.entries()) {
                            if (userData.nickname === mentionedNick && userData.campus === user.campus) {
                                io.to(socketId).emit('mention:notification', {
                                    messageId: message.id,
                                    from: user.nickname,
                                    content: message.content,
                                    campus: user.campus,
                                    timestamp: message.timestamp
                                });
                                
                                // Store notification
                                if (!messageMentions.has(socketId)) {
                                    messageMentions.set(socketId, []);
                                }
                                messageMentions.get(socketId).push({
                                    messageId: message.id,
                                    from: user.nickname,
                                    read: false
                                });
                                break;
                            }
                        }
                    }
                }
                
            } catch (err) {
                console.error('Error in message:send:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        
        // Edit message
        socket.on('message:edit', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { messageId, newContent } = data;
                const content = sanitizeInput(newContent);
                
                const campusMessages = chatMessages[user.campus];
                const messageIndex = campusMessages.findIndex(m => m.id === messageId && m.nickname === user.nickname);
                
                if (messageIndex === -1) {
                    socket.emit('error', { message: 'Message not found or not yours' });
                    return;
                }
                
                const message = campusMessages[messageIndex];
                const messageAge = Date.now() - new Date(message.timestamp).getTime();
                
                if (messageAge > 5 * 60 * 1000) { // 5 minutes
                    socket.emit('error', { message: 'Can only edit messages within 5 minutes' });
                    return;
                }
                
                message.content = content;
                message.edited = true;
                message.editedAt = new Date().toISOString();
                
                io.to(user.campus).emit('message:edited', message);
                
            } catch (err) {
                console.error('Error in message:edit:', err);
            }
        });
        
        // Delete message
        socket.on('message:delete', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { messageId } = data;
                const campusMessages = chatMessages[user.campus];
                const messageIndex = campusMessages.findIndex(m => m.id === messageId && m.nickname === user.nickname);
                
                if (messageIndex !== -1) {
                    campusMessages[messageIndex].deleted = true;
                    campusMessages[messageIndex].deletedAt = new Date().toISOString();
                    campusMessages[messageIndex].content = '[Message deleted]';
                    
                    io.to(user.campus).emit('message:deleted', { messageId });
                }
            } catch (err) {
                console.error('Error in message:delete:', err);
            }
        });
        
        // Typing indicators
        socket.on('typing:start', () => {
            const user = onlineUsers.get(socket.id);
            if (!user) return;
            
            socket.to(user.campus).emit('typing:user', {
                nickname: user.nickname,
                typing: true
            });
        });
        
        socket.on('typing:stop', () => {
            const user = onlineUsers.get(socket.id);
            if (!user) return;
            
            socket.to(user.campus).emit('typing:user', {
                nickname: user.nickname,
                typing: false
            });
        });
        
        // Report message
        socket.on('report:submit', async (data) => {
            try {
                const reporter = onlineUsers.get(socket.id);
                if (!reporter) return;
                
                const { messageId, reason, details } = data;
                
                const reports = await readJSON('reports.json');
                
                const report = {
                    id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    messageId,
                    reporterNickname: reporter.nickname,
                    reporterSession: socket.id,
                    reason: sanitizeInput(reason),
                    details: sanitizeInput(details || ''),
                    timestamp: new Date().toISOString(),
                    status: 'pending',
                    reportedIP: hashIP(clientIP)
                };
                
                reports.push(report);
                await writeJSON('reports.json', reports);
                
                socket.emit('report:success', { message: 'Report submitted successfully' });
                
                // Notify admins if connected
                io.emit('admin:newReport', report);
                
            } catch (err) {
                console.error('Error in report:submit:', err);
                socket.emit('error', { message: 'Failed to submit report' });
            }
        });
        
        // Direct messages
        socket.on('dm:send', async (data) => {
            try {
                const sender = onlineUsers.get(socket.id);
                if (!sender) return;
                
                const { recipientNickname, content } = data;
                const cleanContent = sanitizeInput(content);
                
                if (!cleanContent || cleanContent.length === 0 || cleanContent.length > 500) {
                    return;
                }
                
                // Find recipient socket
                let recipientSocketId = null;
                for (const [socketId, user] of onlineUsers.entries()) {
                    if (user.nickname === recipientNickname && user.campus === sender.campus) {
                        recipientSocketId = socketId;
                        break;
                    }
                }
                
                if (!recipientSocketId) {
                    socket.emit('error', { message: 'Recipient not found or offline' });
                    return;
                }
                
                const dmMessage = {
                    id: generateMessageId(),
                    from: sender.nickname,
                    to: recipientNickname,
                    content: cleanContent,
                    timestamp: new Date().toISOString()
                };
                
                // Send to both parties
                socket.emit('dm:receive', dmMessage);
                io.to(recipientSocketId).emit('dm:receive', dmMessage);
                
                // Notify recipient of new DM
                io.to(recipientSocketId).emit('dm:notification', {
                    from: sender.nickname,
                    preview: cleanContent.substring(0, 50) + (cleanContent.length > 50 ? '...' : '')
                });
                
                // Update unread count
                const currentCount = dmNotifications.get(recipientSocketId) || 0;
                dmNotifications.set(recipientSocketId, currentCount + 1);
                io.to(recipientSocketId).emit('dm:unread:update', { 
                    count: currentCount + 1 
                });
                
            } catch (err) {
                console.error('Error in dm:send:', err);
            }
        });
        
        // Message Reactions
        socket.on('message:react', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { messageId, emoji } = data;
                
                if (!messageId || !emoji) return;
                
                // Initialize reactions for this message if not exists
                if (!messageReactions.has(messageId)) {
                    messageReactions.set(messageId, {});
                }
                
                const reactions = messageReactions.get(messageId);
                
                // Initialize emoji array if not exists
                if (!reactions[emoji]) {
                    reactions[emoji] = [];
                }
                
                // Toggle reaction (add or remove)
                const userIndex = reactions[emoji].indexOf(socket.id);
                if (userIndex === -1) {
                    // Add reaction
                    reactions[emoji].push(socket.id);
                } else {
                    // Remove reaction
                    reactions[emoji].splice(userIndex, 1);
                    // Clean up empty emoji arrays
                    if (reactions[emoji].length === 0) {
                        delete reactions[emoji];
                    }
                }
                
                // Broadcast reaction update to campus
                io.to(user.campus).emit('message:reaction:update', {
                    messageId,
                    reactions: Object.keys(reactions).reduce((acc, emoji) => {
                        acc[emoji] = reactions[emoji].length;
                        return acc;
                    }, {})
                });
                
            } catch (err) {
                console.error('Error in message:react:', err);
            }
        });
        
        // DM: Start conversation
        socket.on('dm:start', (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { withNickname } = data;
                
                // Find the other user
                let found = false;
                for (const [socketId, userData] of onlineUsers.entries()) {
                    if (userData.nickname === withNickname && userData.campus === user.campus) {
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    socket.emit('error', { message: 'User not found or offline' });
                    return;
                }
                
                socket.emit('dm:started', { 
                    withNickname,
                    campus: user.campus
                });
                
            } catch (err) {
                console.error('Error in dm:start:', err);
            }
        });
        
        // DM: Mark as read
        socket.on('dm:read', (data) => {
            try {
                const { fromNickname } = data;
                const currentCount = dmNotifications.get(socket.id) || 0;
                
                if (currentCount > 0) {
                    dmNotifications.set(socket.id, Math.max(0, currentCount - 1));
                    socket.emit('dm:unread:update', { 
                        count: Math.max(0, currentCount - 1)
                    });
                }
            } catch (err) {
                console.error('Error in dm:read:', err);
            }
        });
        
        // DM: Typing indicators
        socket.on('dm:typing', (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { toNickname } = data;
                
                // Find recipient
                for (const [socketId, userData] of onlineUsers.entries()) {
                    if (userData.nickname === toNickname && userData.campus === user.campus) {
                        io.to(socketId).emit('dm:user:typing', {
                            from: user.nickname,
                            typing: true
                        });
                        break;
                    }
                }
            } catch (err) {
                console.error('Error in dm:typing:', err);
            }
        });
        
        socket.on('dm:stop-typing', (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { toNickname } = data;
                
                // Find recipient
                for (const [socketId, userData] of onlineUsers.entries()) {
                    if (userData.nickname === toNickname && userData.campus === user.campus) {
                        io.to(socketId).emit('dm:user:typing', {
                            from: user.nickname,
                            typing: false
                        });
                        break;
                    }
                }
            } catch (err) {
                console.error('Error in dm:stop-typing:', err);
            }
        });
        
        // Get online users list (for DM)
        socket.on('users:list', () => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const usersList = [];
                for (const [socketId, userData] of onlineUsers.entries()) {
                    if (userData.campus === user.campus && socketId !== socket.id) {
                        usersList.push({
                            nickname: userData.nickname,
                            campus: userData.campus
                        });
                    }
                }
                
                socket.emit('users:list:response', usersList);
            } catch (err) {
                console.error('Error in users:list:', err);
            }
        });
        
        // Mark mention as read
        socket.on('mention:read', (data) => {
            try {
                const { messageId } = data;
                const mentions = messageMentions.get(socket.id) || [];
                
                const mention = mentions.find(m => m.messageId === messageId);
                if (mention) {
                    mention.read = true;
                }
            } catch (err) {
                console.error('Error in mention:read:', err);
            }
        });
        
        // Match Chat System
        socket.on('match:join', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const { matchType } = data; // 'same-campus' or 'any-campus'
                
                // Check if already in match
                if (activeMatches.has(socket.id)) {
                    socket.emit('error', { message: 'You are already in a match' });
                    return;
                }
                
                // Check if already in queue
                for (const [campus, queue] of matchQueue.entries()) {
                    if (queue.includes(socket.id)) {
                        socket.emit('error', { message: 'You are already searching for a match' });
                        return;
                    }
                }
                
                const queueKey = matchType === 'same-campus' ? user.campus : 'all';
                
                if (!matchQueue.has(queueKey)) {
                    matchQueue.set(queueKey, []);
                }
                
                const queue = matchQueue.get(queueKey);
                
                // Try to find a match
                let matched = false;
                for (let i = 0; i < queue.length; i++) {
                    const waitingSocketId = queue[i];
                    const waitingUser = onlineUsers.get(waitingSocketId);
                    
                    // Check if waiting user is still online and not the same person
                    if (waitingUser && waitingSocketId !== socket.id) {
                        // Create match
                        const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        
                        activeMatches.set(socket.id, waitingSocketId);
                        activeMatches.set(waitingSocketId, socket.id);
                        matchConversations.set(matchId, []);
                        
                        // Remove from queue
                        queue.splice(i, 1);
                        
                        // Notify both users
                        const matchInfo = {
                            matchId,
                            partnerCampus: waitingUser.campus,
                            timestamp: new Date().toISOString()
                        };
                        
                        const partnerMatchInfo = {
                            matchId,
                            partnerCampus: user.campus,
                            timestamp: new Date().toISOString()
                        };
                        
                        socket.emit('match:found', matchInfo);
                        io.to(waitingSocketId).emit('match:found', partnerMatchInfo);
                        
                        matched = true;
                        console.log(`Match created: ${user.nickname} <-> ${waitingUser.nickname}`);
                        break;
                    }
                }
                
                // If no match found, add to queue
                if (!matched) {
                    queue.push(socket.id);
                    socket.emit('match:searching', { 
                        queuePosition: queue.length,
                        matchType: queueKey 
                    });
                    console.log(`${user.nickname} joined match queue (${queueKey})`);
                }
                
            } catch (err) {
                console.error('Error in match:join:', err);
            }
        });
        
        socket.on('match:cancel', () => {
            try {
                // Remove from all queues
                for (const [campus, queue] of matchQueue.entries()) {
                    const index = queue.indexOf(socket.id);
                    if (index !== -1) {
                        queue.splice(index, 1);
                        socket.emit('match:cancelled');
                        console.log(`User removed from match queue`);
                        return;
                    }
                }
            } catch (err) {
                console.error('Error in match:cancel:', err);
            }
        });
        
        socket.on('match:message', async (data) => {
            try {
                const user = onlineUsers.get(socket.id);
                if (!user) return;
                
                const partnerId = activeMatches.get(socket.id);
                if (!partnerId) {
                    socket.emit('error', { message: 'You are not in an active match' });
                    return;
                }
                
                const content = sanitizeInput(data.content);
                
                if (!content || content.length === 0 || content.length > 500) {
                    return;
                }
                
                if (containsProfanity(content)) {
                    socket.emit('error', { message: 'Message contains inappropriate content' });
                    return;
                }
                
                const message = {
                    id: generateMessageId(),
                    from: socket.id,
                    content,
                    timestamp: new Date().toISOString()
                };
                
                // Send to partner
                socket.emit('match:message:receive', { ...message, isOwn: true });
                io.to(partnerId).emit('match:message:receive', { ...message, isOwn: false });
                
            } catch (err) {
                console.error('Error in match:message:', err);
            }
        });
        
        socket.on('match:typing', () => {
            try {
                const partnerId = activeMatches.get(socket.id);
                if (partnerId) {
                    io.to(partnerId).emit('match:partner:typing', { typing: true });
                }
            } catch (err) {
                console.error('Error in match:typing:', err);
            }
        });
        
        socket.on('match:stop-typing', () => {
            try {
                const partnerId = activeMatches.get(socket.id);
                if (partnerId) {
                    io.to(partnerId).emit('match:partner:typing', { typing: false });
                }
            } catch (err) {
                console.error('Error in match:stop-typing:', err);
            }
        });
        
        socket.on('match:leave', () => {
            try {
                const user = onlineUsers.get(socket.id);
                const partnerId = activeMatches.get(socket.id);
                
                if (partnerId) {
                    // Notify partner
                    io.to(partnerId).emit('match:partner:left');
                    
                    // Clean up match
                    activeMatches.delete(socket.id);
                    activeMatches.delete(partnerId);
                    
                    socket.emit('match:left');
                    console.log(`Match ended by ${user?.nickname}`);
                }
            } catch (err) {
                console.error('Error in match:leave:', err);
            }
        });
        
        socket.on('match:report', async (data) => {
            try {
                const reporter = onlineUsers.get(socket.id);
                if (!reporter) return;
                
                const { reason, details } = data;
                const partnerId = activeMatches.get(socket.id);
                
                if (!partnerId) {
                    socket.emit('error', { message: 'No active match to report' });
                    return;
                }
                
                const reportedUser = onlineUsers.get(partnerId);
                
                const reports = await readJSON('reports.json');
                
                const report = {
                    id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'match_chat',
                    reporterNickname: reporter.nickname,
                    reporterSession: socket.id,
                    reportedNickname: reportedUser?.nickname || 'Unknown',
                    reportedCampus: reportedUser?.campus || 'Unknown',
                    reason: sanitizeInput(reason),
                    details: sanitizeInput(details || ''),
                    timestamp: new Date().toISOString(),
                    status: 'pending',
                    reportedIP: hashIP(reportedUser ? onlineUsers.get(partnerId).ip : 'unknown')
                };
                
                reports.push(report);
                await writeJSON('reports.json', reports);
                
                socket.emit('report:success', { message: 'Match partner reported successfully' });
                
                // Notify admins
                io.emit('admin:newReport', report);
                
            } catch (err) {
                console.error('Error in match:report:', err);
            }
        });
        
        // Disconnect
        socket.on('disconnect', () => {
            const user = onlineUsers.get(socket.id);
            if (user) {
                io.to(user.campus).emit('user:left', {
                    nickname: user.nickname,
                    onlineCount: getOnlineCount(user.campus) - 1
                });
                
                // Clean up match queue
                for (const [campus, queue] of matchQueue.entries()) {
                    const index = queue.indexOf(socket.id);
                    if (index !== -1) {
                        queue.splice(index, 1);
                    }
                }
                
                // Clean up active match
                const partnerId = activeMatches.get(socket.id);
                if (partnerId) {
                    io.to(partnerId).emit('match:partner:left');
                    activeMatches.delete(partnerId);
                    activeMatches.delete(socket.id);
                }
                
                // Clean up mentions and DM notifications
                messageMentions.delete(socket.id);
                dmNotifications.delete(socket.id);
                
                onlineUsers.delete(socket.id);
                console.log(`${user.nickname} disconnected`);
            }
        });
    });
}

function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getOnlineCount(campus) {
    let count = 0;
    for (const user of onlineUsers.values()) {
        if (user.campus === campus) {
            count++;
        }
    }
    return count;
}

// Extract @mentions from message content
function extractMentions(content) {
    const mentionRegex = /@([a-zA-Z0-9_-]{3,20})/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
        const nickname = match[1];
        if (!mentions.includes(nickname)) {
            mentions.push(nickname);
        }
    }
    
    return mentions;
}
    return count;
}

module.exports = {
    setupSocketHandlers,
    chatMessages,
    onlineUsers
};
