// ====================================================================================
// SORSU TIKTALK - NEW FEATURES
// Direct Messages, Reactions, Mentions, Notifications
// ====================================================================================

// Global state for new features
let activeDMUser = null;
let dmConversations = new Map(); // nickname -> messages array
let notifications = [];
let unreadDMs = 0;
let replyingTo = null;
let currentReactingMessageId = null;

// ====================================================================================
// DIRECT MESSAGING
// ====================================================================================

function initializeDirectMessaging() {
    // New DM button
    document.getElementById('newDMBtn').addEventListener('click', openNewDMModal);
    document.getElementById('closeNewDM').addEventListener('click', closeNewDMModal);
    
    // DM user search
    document.getElementById('dmUserSearch').addEventListener('input', filterOnlineUsers);
    
    // DM chat
    document.getElementById('closeDMChat').addEventListener('click', closeDMChat);
    
    // DM input
    const dmInput = document.getElementById('dmInput');
    const sendDMBtn = document.getElementById('sendDMBtn');
    const dmCharCount = document.getElementById('dmCharCount');
    
    dmInput.addEventListener('input', () => {
        const length = dmInput.value.length;
        dmCharCount.textContent = length;
        sendDMBtn.disabled = length === 0 || length > 500;
        
        dmInput.style.height = 'auto';
        dmInput.style.height = Math.min(dmInput.scrollHeight, 120) + 'px';
        
        if (activeDMUser && length > 0) {
            socket.emit('dm:typing', { toNickname: activeDMUser });
        } else if (activeDMUser) {
            socket.emit('dm:stop-typing', { toNickname: activeDMUser });
        }
    });
    
    dmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendDirectMessage();
        }
    });
    
    sendDMBtn.addEventListener('click', sendDirectMessage);
}

function openNewDMModal() {
    document.getElementById('newDMModal').classList.remove('hidden');
    loadOnlineUsers();
}

function closeNewDMModal() {
    document.getElementById('newDMModal').classList.add('hidden');
    document.getElementById('dmUserSearch').value = '';
}

function loadOnlineUsers() {
    socket.emit('users:list');
}

function filterOnlineUsers() {
    const search = document.getElementById('dmUserSearch').value.toLowerCase();
    const items = document.querySelectorAll('.online-user-item');
    
    items.forEach(item => {
        const nickname = item.dataset.nickname.toLowerCase();
        if (nickname.includes(search)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function startDM(nickname) {
    activeDMUser = nickname;
    closeNewDMModal();
    
    // Initialize conversation if not exists
    if (!dmConversations.has(nickname)) {
        dmConversations.set(nickname, []);
    }
    
    // Open DM chat window
    document.getElementById('dmChatModal').classList.remove('hidden');
    document.getElementById('dmChatTitle').textContent = `Chat with ${nickname}`;
    
    // Load existing messages
    const messages = dmConversations.get(nickname);
    const container = document.getElementById('dmMessages');
    container.innerHTML = '';
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="text-center" style="color: var(--text-muted); padding: 2rem;">Start your conversation</div>';
    } else {
        messages.forEach(displayDMMessage);
    }
    
    // Mark as read
    socket.emit('dm:read', { fromNickname: nickname });
    
    // Update DM list item
    updateDMListItem(nickname);
}

function closeDMChat() {
    document.getElementById('dmChatModal').classList.add('hidden');
    if (activeDMUser) {
        socket.emit('dm:stop-typing', { toNickname: activeDMUser });
    }
    activeDMUser = null;
    document.getElementById('dmInput').value = '';
    document.getElementById('dmCharCount').textContent = '0';
    document.getElementById('sendDMBtn').disabled = true;
}

function sendDirectMessage() {
    const dmInput = document.getElementById('dmInput');
    const content = dmInput.value.trim();
    
    if (!content || !activeDMUser) {
        return;
    }
    
    if (content.length > 500) {
        showNotification('Message too long (max 500 characters)', 'error');
        return;
    }
    
    socket.emit('dm:send', {
        recipientNickname: activeDMUser,
        content
    });
    
    dmInput.value = '';
    dmInput.style.height = 'auto';
    document.getElementById('dmCharCount').textContent = '0';
    document.getElementById('sendDMBtn').disabled = true;
    
    socket.emit('dm:stop-typing', { toNickname: activeDMUser });
}

function displayDMMessage(message) {
    const container = document.getElementById('dmMessages');
    
    if (container.querySelector('.text-center')) {
        container.innerHTML = '';
    }
    
    const isOwn = message.from === currentUser.nickname;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.style.maxWidth = '75%';
    messageEl.style.marginLeft = isOwn ? 'auto' : '0';
    messageEl.style.marginRight = isOwn ? '0' : 'auto';
    messageEl.style.background = isOwn ? 'var(--accent-primary)' : 'var(--bg-secondary)';
    messageEl.style.color = isOwn ? 'white' : 'var(--text-primary)';
    
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-nickname">${isOwn ? 'You' : message.from}</span>
            <span class="message-time">${formatTime(message.timestamp)}</span>
        </div>
        <div class="message-content">${escapeHtml(message.content)}</div>
    `;
    
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
}

function updateDMListItem(nickname) {
    // Check if DM list item exists, if not create it
    let dmItem = document.querySelector(`[data-dm-nickname="${nickname}"]`);
    
    if (!dmItem) {
        const dmList = document.getElementById('dmList');
        dmItem = document.createElement('div');
        dmItem.className = 'dm-item';
        dmItem.dataset.dmNickname = nickname;
        dmItem.innerHTML = `
            <div class="dm-item-name">${nickname}</div>
            <div class="dm-item-preview">Click to open chat</div>
        `;
        dmItem.addEventListener('click', () => startDM(nickname));
        dmList.appendChild(dmItem);
    }
    
    // Remove unread status if was unread
    dmItem.classList.remove('unread');
    const badge = dmItem.querySelector('.dm-unread-badge');
    if (badge) {
        badge.remove();
    }
}

// ====================================================================================
// MESSAGE REACTIONS
// ====================================================================================

function initializeReactions() {
    // Emoji picker
    document.getElementById('closeEmojiPicker').addEventListener('click', closeEmojiPicker);
    
    // Emoji buttons
    document.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            if (currentReactingMessageId) {
                socket.emit('message:react', {
                    messageId: currentReactingMessageId,
                    emoji
                });
                closeEmojiPicker();
            }
        });
    });
}

function openEmojiPicker(messageId) {
    currentReactingMessageId = messageId;
    document.getElementById('emojiPickerModal').classList.remove('hidden');
}

function closeEmojiPicker() {
    document.getElementById('emojiPickerModal').classList.add('hidden');
    currentReactingMessageId = null;
}

function displayReactions(messageId, reactions) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    let reactionsContainer = messageEl.querySelector('.message-reactions');
    
    if (!reactionsContainer) {
        reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        messageEl.appendChild(reactionsContainer);
    }
    
    reactionsContainer.innerHTML = '';
    
    for (const [emoji, count] of Object.entries(reactions)) {
        if (count > 0) {
            const reactionEl = document.createElement('span');
            reactionEl.className = 'reaction-item';
            reactionEl.innerHTML = `${emoji} <span class="reaction-count">${count}</span>`;
            reactionEl.addEventListener('click', () => {
                socket.emit('message:react', { messageId, emoji });
            });
            reactionsContainer.appendChild(reactionEl);
        }
    }
}

// ====================================================================================
// MENTIONS & NOTIFICATIONS
// ====================================================================================

function initializeNotifications() {
    // Notification bell
    document.getElementById('notificationBtn').addEventListener('click', toggleNotifications);
    document.getElementById('closeNotifications').addEventListener('click', closeNotifications);
    document.getElementById('clearNotifications').addEventListener('click', clearAllNotifications);
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    panel.classList.toggle('hidden');
    
    if (!panel.classList.contains('hidden')) {
        displayNotifications();
    }
}

function closeNotifications() {
    document.getElementById('notificationsPanel').classList.add('hidden');
}

function displayNotifications() {
    const container = document.getElementById('notificationsList');
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="text-center" style="padding: 2rem; color: var(--text-muted);">No notifications</div>';
        return;
    }
    
    container.innerHTML = '';
    
    notifications.reverse().forEach(notif => {
        const notifEl = document.createElement('div');
        notifEl.className = `notification-item ${notif.read ? '' : 'unread'}`;
        
        let icon = '💬';
        if (notif.type === 'dm') icon = '✉️';
        if (notif.type === 'mention') icon = '@';
        
        notifEl.innerHTML = `
            <div class="notification-header">
                <span class="notification-type">${icon} ${notif.type.toUpperCase()}</span>
                <span class="notification-time">${formatTime(notif.timestamp)}</span>
            </div>
            <div class="notification-content">${escapeHtml(notif.content)}</div>
        `;
        
        notifEl.addEventListener('click', () => {
            handleNotificationClick(notif);
        });
        
        container.appendChild(notifEl);
    });
}

function handleNotificationClick(notif) {
    notif.read = true;
    updateNotificationBadge();
    
    if (notif.type === 'dm') {
        closeNotifications();
        startDM(notif.from);
    } else if (notif.type === 'mention') {
        closeNotifications();
        // Scroll to message if visible
        const messageEl = document.querySelector(`[data-message-id="${notif.messageId}"]`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.style.animation = 'highlight 1s ease';
        }
    }
}

function clearAllNotifications() {
    notifications = [];
    updateNotificationBadge();
    displayNotifications();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const unreadCount = notifications.filter(n => !n.read).length + unreadDMs;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function highlightMentions(content) {
    return content.replace(/@([a-zA-Z0-9_-]{3,20})/g, '<span class="mention">@$1</span>');
}

// ====================================================================================
// MESSAGE THREADING/REPLIES
// ====================================================================================

function replyToMessage(messageId, nickname, content) {
    replyingTo = {
        messageId,
        nickname,
        content: content.substring(0, 50) + (content.length > 50 ? '...' : '')
    };
    
    // Show reply indicator
    const messageInput = document.getElementById('messageInput');
    const container = messageInput.parentElement;
    
    let replyIndicator = container.querySelector('.reply-indicator');
    if (!replyIndicator) {
        replyIndicator = document.createElement('div');
        replyIndicator.className = 'reply-indicator';
        container.insertBefore(replyIndicator, messageInput);
    }
    
    replyIndicator.innerHTML = `
        <div class="reply-preview">
            Replying to <strong>${nickname}</strong>: ${escapeHtml(replyingTo.content)}
        </div>
        <button class="cancel-reply" onclick="cancelReply()">✕</button>
    `;
    
    messageInput.focus();
}

function cancelReply() {
    replyingTo = null;
    const replyIndicator = document.querySelector('.reply-indicator');
    if (replyIndicator) {
        replyIndicator.remove();
    }
}

// ====================================================================================
// SOCKET EVENT LISTENERS
// ====================================================================================

// Online users list response
socket.on('users:list:response', (users) => {
    const container = document.getElementById('onlineUsersList');
    container.innerHTML = '';
    
    if (users.length === 0) {
        container.innerHTML = '<div class="text-center" style="padding: 2rem; color: var(--text-muted);">No online users</div>';
        return;
    }
    
    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'online-user-item';
        userEl.dataset.nickname = user.nickname;
        userEl.innerHTML = `
            <span class="user-nickname">${user.nickname}</span>
            <span class="user-status">
                <span class="online-indicator"></span>
                Online
            </span>
        `;
        userEl.addEventListener('click', () => startDM(user.nickname));
        container.appendChild(userEl);
    });
});

// DM received
socket.on('dm:receive', (message) => {
    const otherUser = message.from === currentUser.nickname ? message.to : message.from;
    
    // Store in conversation
    if (!dmConversations.has(otherUser)) {
        dmConversations.set(otherUser, []);
    }
    dmConversations.get(otherUser).push(message);
    
    // Display if window is open
    if (activeDMUser === otherUser) {
        displayDMMessage(message);
    }
    
    // Update DM list
    updateDMListItem(otherUser);
});

// DM notification
socket.on('dm:notification', (data) => {
    notifications.push({
        type: 'dm',
        from: data.from,
        content: `New message: ${data.preview}`,
        timestamp: new Date().toISOString(),
        read: false
    });
    
    updateNotificationBadge();
    showNotification(`New DM from ${data.from}`, 'info');
});

// DM unread count update
socket.on('dm:unread:update', (data) => {
    unreadDMs = data.count;
    const badge = document.getElementById('dmUnreadCount');
    
    if (unreadDMs > 0) {
        badge.textContent = unreadDMs;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
    
    updateNotificationBadge();
});

// DM typing indicator
socket.on('dm:user:typing', (data) => {
    if (activeDMUser === data.from) {
        const indicator = document.getElementById('dmTypingIndicator');
        if (data.typing) {
            indicator.textContent = `${data.from} is typing...`;
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }
});

// Mention notification
socket.on('mention:notification', (data) => {
    notifications.push({
        type: 'mention',
        from: data.from,
        messageId: data.messageId,
        content: `${data.from} mentioned you: ${data.content.substring(0, 50)}...`,
        timestamp: data.timestamp,
        read: false
    });
    
    updateNotificationBadge();
    showNotification(`${data.from} mentioned you!`, 'info');
});

// Reaction update
socket.on('message:reaction:update', (data) => {
    displayReactions(data.messageId, data.reactions);
});

// ====================================================================================
// INITIALIZE ALL NEW FEATURES
// ====================================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeDirectMessaging();
    initializeReactions();
    initializeNotifications();
    
    console.log('New features initialized!');
});
