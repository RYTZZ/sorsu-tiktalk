// Chat application logic
let currentUser = {
    nickname: '',
    campus: ''
};

let currentCampus = '';
let messageToReport = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const nickname = localStorage.getItem('tiktalk_nickname');
    const campus = localStorage.getItem('tiktalk_campus');

    if (!nickname || !campus) {
        window.location.href = '/';
        return;
    }

    currentUser = { nickname, campus };

    // Initialize UI
    initializeUI();
    initializeTheme();
    initializeEventListeners();

    // Join the chat
    joinChat();
});

function initializeUI() {
    // Set user info in sidebar
    document.getElementById('userNickname').textContent = currentUser.nickname;
    document.getElementById('userAvatar').textContent = currentUser.nickname.charAt(0).toUpperCase();
    
    const campusBadge = document.getElementById('userCampusBadge');
    campusBadge.textContent = getCampusName(currentUser.campus);
    campusBadge.className = `campus-badge ${currentUser.campus}`;

    // Set user's campus as active
    const userCampusItem = document.querySelector(`[data-campus="${currentUser.campus}"]`);
    if (userCampusItem) {
        userCampusItem.click();
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('tiktalk_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
}

function initializeEventListeners() {
    // Campus selection
    document.querySelectorAll('.campus-item').forEach(item => {
        item.addEventListener('click', () => {
            const campus = item.getAttribute('data-campus');
            if (campus) {
                selectCampus(campus);
            }
        });
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Message input
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const charCount = document.getElementById('charCount');

    messageInput.addEventListener('input', () => {
        const length = messageInput.value.length;
        charCount.textContent = length;
        sendBtn.disabled = length === 0 || length > 500;

        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';

        // Typing indicator
        if (length > 0) {
            socket.emit('typing:start');
        } else {
            socket.emit('typing:stop');
        }
    });

    // Send message on Enter (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    // Report modal
    document.getElementById('closeReportModal').addEventListener('click', closeReportModal);
    document.getElementById('cancelReport').addEventListener('click', closeReportModal);
    document.getElementById('submitReport').addEventListener('click', submitReport);

    // Mobile menu toggle
    document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
}

function joinChat() {
    socket.emit('user:join', {
        nickname: currentUser.nickname,
        campus: currentUser.campus
    });
}

function selectCampus(campus) {
    currentCampus = campus;

    // Update active state
    document.querySelectorAll('.campus-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-campus="${campus}"]`).classList.add('active');

    // Update chat title
    document.getElementById('chatTitle').textContent = `${getCampusName(campus)} Chat`;

    // Clear messages and request history
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '<div class="text-center" style="color: var(--text-muted); padding: 2rem;">Loading messages...</div>';

    // Enable message input
    document.getElementById('messageInput').disabled = false;
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();

    if (!content || !currentCampus) {
        return;
    }

    if (content.length > 500) {
        showNotification('Message is too long (max 500 characters)', 'error');
        return;
    }

    socket.emit('message:send', {
        content,
        campus: currentCampus,
        replyTo: replyingTo ? replyingTo.messageId : null
    });

    messageInput.value = '';
    messageInput.style.height = 'auto';
    document.getElementById('charCount').textContent = '0';
    document.getElementById('sendBtn').disabled = true;

    socket.emit('typing:stop');
    
    // Clear reply if set
    if (typeof cancelReply === 'function') {
        cancelReply();
    }
}

function displayMessage(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    
    // Remove "loading" message if present
    if (messagesContainer.querySelector('.text-center')) {
        messagesContainer.innerHTML = '';
    }

    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.setAttribute('data-message-id', message.id);

    if (message.deleted) {
        messageEl.classList.add('deleted');
    }

    if (message.edited) {
        messageEl.classList.add('edited');
    }

    const isOwnMessage = message.nickname === currentUser.nickname;
    
    // Highlight mentions if function exists
    let displayContent = escapeHtml(message.content);
    if (typeof highlightMentions === 'function') {
        displayContent = highlightMentions(displayContent);
    }

    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-nickname">${escapeHtml(message.nickname)}</span>
            <span class="campus-badge ${message.campus}">${getCampusName(message.campus)}</span>
            <span class="message-time">${formatTime(message.timestamp)}</span>
        </div>
        <div class="message-content">${displayContent}</div>
        ${!message.deleted ? `
            <div class="message-actions">
                <button class="message-btn" onclick="if(typeof openEmojiPicker === 'function') openEmojiPicker('${message.id}')">React</button>
                <button class="message-btn" onclick="if(typeof replyToMessage === 'function') replyToMessage('${message.id}', '${escapeHtml(message.nickname)}', '${escapeHtml(message.content)}')">Reply</button>
                ${isOwnMessage ? `
                    <button class="message-btn" onclick="editMessage('${message.id}')">Edit</button>
                    <button class="message-btn" onclick="deleteMessage('${message.id}')">Delete</button>
                ` : ''}
                ${!isOwnMessage ? `
                    <button class="message-btn" onclick="reportMessage('${message.id}', '${message.nickname}', '${escapeHtml(message.content)}')">Report</button>
                ` : ''}
            </div>
        ` : ''}
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function editMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    const contentEl = messageEl.querySelector('.message-content');
    const originalContent = contentEl.textContent;

    const newContent = prompt('Edit your message:', originalContent);
    
    if (newContent !== null && newContent.trim() !== '' && newContent !== originalContent) {
        socket.emit('message:edit', {
            messageId,
            newContent: newContent.trim()
        });
    }
}

function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        socket.emit('message:delete', { messageId });
    }
}

function reportMessage(messageId, nickname, content) {
    messageToReport = { messageId, nickname, content };
    document.getElementById('reportModal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
    document.getElementById('reportReason').value = '';
    document.getElementById('reportDetails').value = '';
    messageToReport = null;
}

function submitReport() {
    const reason = document.getElementById('reportReason').value;
    const details = document.getElementById('reportDetails').value;

    if (!reason) {
        alert('Please select a reason for reporting');
        return;
    }

    if (!messageToReport) {
        return;
    }

    socket.emit('report:submit', {
        messageId: messageToReport.messageId,
        reason,
        details
    });

    showNotification('Report submitted successfully', 'success');
    closeReportModal();
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('tiktalk_theme', newTheme);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('tiktalk_nickname');
        localStorage.removeItem('tiktalk_campus');
        window.location.href = '/';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// Socket event listeners
socket.on('message:history', (messages) => {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="text-center" style="color: var(--text-muted); padding: 2rem;">No messages yet. Start the conversation!</div>';
    } else {
        messages.forEach(displayMessage);
    }
});

socket.on('message:receive', (message) => {
    if (message.campus === currentCampus) {
        displayMessage(message);
    }
});

socket.on('message:edited', (message) => {
    const messageEl = document.querySelector(`[data-message-id="${message.id}"]`);
    if (messageEl) {
        const contentEl = messageEl.querySelector('.message-content');
        contentEl.textContent = message.content;
        messageEl.classList.add('edited');
    }
});

socket.on('message:deleted', (data) => {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageEl) {
        messageEl.classList.add('deleted');
        const contentEl = messageEl.querySelector('.message-content');
        contentEl.textContent = '[Message deleted]';
        messageEl.querySelector('.message-actions').innerHTML = '';
    }
});

socket.on('user:joined', (data) => {
    updateOnlineCount(data.campus, data.onlineCount);
    if (data.campus === currentCampus) {
        showNotification(`${data.nickname} joined the chat`, 'info');
    }
});

socket.on('user:left', (data) => {
    updateOnlineCount(data.campus, data.onlineCount);
});

socket.on('typing:user', (data) => {
    const typingIndicator = document.getElementById('typingIndicator');
    if (data.typing) {
        typingIndicator.textContent = `${data.nickname} is typing...`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
});

socket.on('report:success', () => {
    showNotification('Report submitted successfully. Thank you for keeping TikTalk safe.', 'success');
});

socket.on('banned', (banInfo) => {
    const bannedModal = document.getElementById('bannedModal');
    const bannedMessage = document.getElementById('bannedMessage');
    
    let message = `<p><strong>You have been ${banInfo.type} banned from SorSU TikTalk.</strong></p>`;
    message += `<p><strong>Reason:</strong> ${banInfo.reason}</p>`;
    
    if (banInfo.type === 'temporary' && banInfo.bannedUntil) {
        const expiryDate = new Date(banInfo.bannedUntil);
        message += `<p><strong>Ban expires:</strong> ${expiryDate.toLocaleString()}</p>`;
        
        if (banInfo.timeRemaining) {
            const hours = Math.floor(banInfo.timeRemaining / 3600);
            const minutes = Math.floor((banInfo.timeRemaining % 3600) / 60);
            message += `<p><strong>Time remaining:</strong> ${hours}h ${minutes}m</p>`;
        }
    } else if (banInfo.type === 'permanent') {
        message += `<p style="color: var(--danger); font-weight: bold;">This is a permanent ban.</p>`;
    }
    
    message += `<p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">If you believe this is an error, please contact: admin@sorsu.edu.ph</p>`;
    
    bannedMessage.innerHTML = message;
    bannedModal.classList.remove('hidden');
});

// Utility functions
function getCampusName(campus) {
    const names = {
        'bulan': 'Bulan',
        'castilla': 'Castilla',
        'magallanes': 'Magallanes',
        'sorsogon-city': 'Sorsogon City'
    };
    return names[campus] || campus;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
               date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

function updateOnlineCount(campus, count) {
    const countEl = document.querySelector(`[data-campus-online="${campus}"]`);
    if (countEl) {
        countEl.textContent = count;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MATCH CHAT FUNCTIONALITY
// ============================================

let inMatchChat = false;
let matchChatActive = false;

function initializeMatchChat() {
    // Match chat button
    document.getElementById('matchChatBtn').addEventListener('click', openMatchTypeModal);
    
    // Match type modal
    document.getElementById('closeMatchTypeModal').addEventListener('click', closeMatchTypeModal);
    document.getElementById('cancelMatchType').addEventListener('click', closeMatchTypeModal);
    document.getElementById('matchSameCampus').addEventListener('click', () => startMatchSearch('same-campus'));
    document.getElementById('matchAnyCampus').addEventListener('click', () => startMatchSearch('any-campus'));
    
    // Match chat modal
    document.getElementById('closeMatchChat').addEventListener('click', closeMatchChat);
    document.getElementById('cancelMatchSearch').addEventListener('click', cancelMatchSearch);
    document.getElementById('leaveMatch').addEventListener('click', leaveMatch);
    
    // Match chat input
    const matchInput = document.getElementById('matchInput');
    const sendMatchBtn = document.getElementById('sendMatchBtn');
    const matchCharCount = document.getElementById('matchCharCount');
    
    matchInput.addEventListener('input', () => {
        const length = matchInput.value.length;
        matchCharCount.textContent = length;
        sendMatchBtn.disabled = length === 0 || length > 500;
        
        // Auto-resize
        matchInput.style.height = 'auto';
        matchInput.style.height = Math.min(matchInput.scrollHeight, 120) + 'px';
        
        // Typing indicator
        if (matchChatActive && length > 0) {
            socket.emit('match:typing');
        } else if (matchChatActive) {
            socket.emit('match:stop-typing');
        }
    });
    
    matchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMatchMessage();
        }
    });
    
    sendMatchBtn.addEventListener('click', sendMatchMessage);
    
    // Report match partner
    document.getElementById('reportMatchPartner').addEventListener('click', openReportMatchModal);
    document.getElementById('closeReportMatchModal').addEventListener('click', closeReportMatchModal);
    document.getElementById('cancelReportMatch').addEventListener('click', closeReportMatchModal);
    document.getElementById('submitReportMatch').addEventListener('click', submitMatchReport);
}

function openMatchTypeModal() {
    document.getElementById('matchTypeModal').classList.remove('hidden');
    document.getElementById('userCampusName').textContent = getCampusName(currentUser.campus);
}

function closeMatchTypeModal() {
    document.getElementById('matchTypeModal').classList.add('hidden');
}

function startMatchSearch(matchType) {
    closeMatchTypeModal();
    
    inMatchChat = true;
    matchChatActive = false;
    
    // Show match chat modal in searching state
    document.getElementById('matchChatModal').classList.remove('hidden');
    document.getElementById('matchSearching').classList.remove('hidden');
    document.getElementById('matchChatContent').classList.add('hidden');
    
    // Update searching text
    const searchingText = matchType === 'same-campus' 
        ? `Looking for someone from ${getCampusName(currentUser.campus)}` 
        : 'Looking for someone from any campus';
    document.getElementById('searchingText').textContent = searchingText;
    
    // Emit match join
    socket.emit('match:join', { matchType });
}

function cancelMatchSearch() {
    socket.emit('match:cancel');
    closeMatchChat();
}

function closeMatchChat() {
    if (matchChatActive) {
        leaveMatch();
    }
    
    document.getElementById('matchChatModal').classList.add('hidden');
    inMatchChat = false;
    matchChatActive = false;
}

function leaveMatch() {
    if (confirm('Are you sure you want to leave this match?')) {
        socket.emit('match:leave');
        closeMatchChat();
    }
}

function sendMatchMessage() {
    const matchInput = document.getElementById('matchInput');
    const content = matchInput.value.trim();
    
    if (!content || !matchChatActive) {
        return;
    }
    
    if (content.length > 500) {
        showNotification('Message is too long (max 500 characters)', 'error');
        return;
    }
    
    socket.emit('match:message', { content });
    
    matchInput.value = '';
    matchInput.style.height = 'auto';
    document.getElementById('matchCharCount').textContent = '0';
    document.getElementById('sendMatchBtn').disabled = true;
    
    socket.emit('match:stop-typing');
}

function displayMatchMessage(message) {
    const messagesContainer = document.getElementById('matchMessages');
    
    // Remove "start chatting" message if present
    if (messagesContainer.querySelector('.text-center')) {
        messagesContainer.innerHTML = '';
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.style.maxWidth = '75%';
    messageEl.style.marginLeft = message.isOwn ? 'auto' : '0';
    messageEl.style.marginRight = message.isOwn ? '0' : 'auto';
    messageEl.style.background = message.isOwn ? 'var(--accent-primary)' : 'var(--bg-secondary)';
    messageEl.style.color = message.isOwn ? 'white' : 'var(--text-primary)';
    
    const time = formatTime(message.timestamp);
    
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-nickname">${message.isOwn ? 'You' : 'Partner'}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(message.content)}</div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function openReportMatchModal() {
    document.getElementById('reportMatchModal').classList.remove('hidden');
}

function closeReportMatchModal() {
    document.getElementById('reportMatchModal').classList.add('hidden');
    document.getElementById('reportMatchReason').value = '';
    document.getElementById('reportMatchDetails').value = '';
}

function submitMatchReport() {
    const reason = document.getElementById('reportMatchReason').value;
    const details = document.getElementById('reportMatchDetails').value;
    
    if (!reason) {
        alert('Please select a reason for reporting');
        return;
    }
    
    socket.emit('match:report', { reason, details });
    closeReportMatchModal();
    showNotification('Match partner reported. Admins will review.', 'success');
}

// Socket event listeners for match chat
socket.on('match:searching', (data) => {
    document.getElementById('searchingText').textContent = 
        `Searching... (${data.queuePosition} in queue)`;
});

socket.on('match:cancelled', () => {
    showNotification('Match search cancelled', 'info');
    closeMatchChat();
});

socket.on('match:found', (data) => {
    matchChatActive = true;
    
    // Hide searching, show chat
    document.getElementById('matchSearching').classList.add('hidden');
    document.getElementById('matchChatContent').classList.remove('hidden');
    
    // Update partner campus
    document.getElementById('partnerCampusDisplay').textContent = getCampusName(data.partnerCampus);
    
    // Clear messages
    document.getElementById('matchMessages').innerHTML = `
        <div class="text-center" style="color: var(--text-muted); padding: 2rem;">
            Match found! Start chatting! 🎉<br>
            <small>Remember to be respectful and follow community guidelines.</small>
        </div>
    `;
    
    showNotification('Match found! Start chatting!', 'success');
});

socket.on('match:message:receive', (message) => {
    displayMatchMessage(message);
});

socket.on('match:partner:typing', (data) => {
    const indicator = document.getElementById('matchTypingIndicator');
    if (data.typing) {
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
    }
});

socket.on('match:partner:left', () => {
    matchChatActive = false;
    showNotification('Your match partner has left the chat', 'info');
    
    // Show disconnected message
    const messagesContainer = document.getElementById('matchMessages');
    const disconnectedMsg = document.createElement('div');
    disconnectedMsg.style.cssText = 'text-align: center; padding: 1.5rem; color: var(--text-muted); background: var(--bg-tertiary); border-radius: 10px; margin: 1rem 0;';
    disconnectedMsg.innerHTML = `
        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">👋</div>
        <div style="font-weight: 600;">Partner left the chat</div>
        <div style="font-size: 0.875rem; margin-top: 0.5rem;">You can close this window or search for a new match</div>
    `;
    messagesContainer.appendChild(disconnectedMsg);
    
    // Disable input
    document.getElementById('matchInput').disabled = true;
    document.getElementById('sendMatchBtn').disabled = true;
});

socket.on('match:left', () => {
    showNotification('You left the match', 'info');
    closeMatchChat();
});

// Initialize match chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeMatchChat();
});
