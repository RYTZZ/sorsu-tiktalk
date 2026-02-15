require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const { initializeFiles, readJSON, writeJSON } = require('./utils/file-storage');
const { setupSocketHandlers, chatMessages, onlineUsers } = require('./socket-handlers');
const { verifyAdmin, requireAuth } = require('./middleware/auth');
const { apiLimiter, reportLimiter, loginLimiter } = require('./middleware/rate-limit');
const { addBan, removeBan, hashIP } = require('./utils/ban-checker');
const { getClientIP } = require('./utils/ip-tracker');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable for Socket.io
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize JSON files
initializeFiles().then(() => {
    console.log('Data files initialized');
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        onlineUsers: onlineUsers.size
    });
});

// Admin login
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const result = await verifyAdmin(username, password);
        
        if (!result.valid) {
            return res.status(401).json({ error: result.error });
        }
        
        // Generate simple token (in production, use JWT)
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            token,
            username: result.username
        });
        
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get reports (admin only)
app.get('/api/admin/reports', requireAuth, async (req, res) => {
    try {
        const reports = await readJSON('reports.json');
        const { status, campus } = req.query;
        
        let filtered = reports;
        
        if (status) {
            filtered = filtered.filter(r => r.status === status);
        }
        
        if (campus) {
            filtered = filtered.filter(r => r.campus === campus);
        }
        
        res.json(filtered.reverse()); // Most recent first
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Update report status (admin only)
app.patch('/api/admin/reports/:reportId', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, action } = req.body;
        
        const reports = await readJSON('reports.json');
        const report = reports.find(r => r.id === reportId);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        report.status = status || report.status;
        report.reviewedAt = new Date().toISOString();
        
        await writeJSON('reports.json', reports);
        
        // Log admin action
        const actions = await readJSON('admin_actions.json');
        actions.push({
            admin: req.admin.token,
            action: action || 'review_report',
            reportId,
            timestamp: new Date().toISOString()
        });
        await writeJSON('admin_actions.json', actions);
        
        res.json({ success: true, report });
    } catch (err) {
        console.error('Error updating report:', err);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// Issue ban (admin only)
app.post('/api/admin/bans', requireAuth, async (req, res) => {
    try {
        const { ip, nickname, type, reason, durationHours, scope } = req.body;
        
        if (!ip || !type || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const banData = {
            nickname,
            type, // 'temporary' or 'permanent'
            reason,
            bannedBy: req.admin.token,
            scope: scope || 'all',
            timestamp: new Date().toISOString()
        };
        
        if (type === 'temporary' && durationHours) {
            const bannedUntil = new Date();
            bannedUntil.setHours(bannedUntil.getHours() + durationHours);
            banData.bannedUntil = bannedUntil.toISOString();
            banData.durationHours = durationHours;
        }
        
        await addBan(ip, banData);
        
        // Log admin action
        const actions = await readJSON('admin_actions.json');
        actions.push({
            admin: req.admin.token,
            action: type === 'permanent' ? 'permanent_ban' : 'temporary_ban',
            targetIP: hashIP(ip),
            reason,
            duration: type === 'temporary' ? `${durationHours} hours` : 'permanent',
            timestamp: new Date().toISOString()
        });
        await writeJSON('admin_actions.json', actions);
        
        // Disconnect banned user
        for (const [socketId, user] of onlineUsers.entries()) {
            if (user.ip === ip) {
                io.to(socketId).emit('banned', {
                    banned: true,
                    type,
                    reason,
                    bannedUntil: banData.bannedUntil
                });
                io.sockets.sockets.get(socketId)?.disconnect();
            }
        }
        
        res.json({ success: true, message: 'Ban issued successfully' });
    } catch (err) {
        console.error('Error issuing ban:', err);
        res.status(500).json({ error: 'Failed to issue ban' });
    }
});

// Get bans (admin only)
app.get('/api/admin/bans', requireAuth, async (req, res) => {
    try {
        const bans = await readJSON('bans.json');
        const banList = Object.entries(bans).map(([ipHash, ban]) => ({
            ipHash,
            ...ban
        }));
        res.json(banList);
    } catch (err) {
        console.error('Error fetching bans:', err);
        res.status(500).json({ error: 'Failed to fetch bans' });
    }
});

// Remove ban (admin only)
app.delete('/api/admin/bans/:ipHash', requireAuth, async (req, res) => {
    try {
        const { ipHash } = req.params;
        
        const bans = await readJSON('bans.json');
        if (!bans[ipHash]) {
            return res.status(404).json({ error: 'Ban not found' });
        }
        
        delete bans[ipHash];
        await writeJSON('bans.json', bans);
        
        // Log admin action
        const actions = await readJSON('admin_actions.json');
        actions.push({
            admin: req.admin.token,
            action: 'remove_ban',
            targetIP: ipHash,
            timestamp: new Date().toISOString()
        });
        await writeJSON('admin_actions.json', actions);
        
        res.json({ success: true, message: 'Ban removed successfully' });
    } catch (err) {
        console.error('Error removing ban:', err);
        res.status(500).json({ error: 'Failed to remove ban' });
    }
});

// Get statistics (admin only)
app.get('/api/admin/stats', requireAuth, async (req, res) => {
    try {
        const reports = await readJSON('reports.json');
        const bans = await readJSON('bans.json');
        
        const stats = {
            onlineUsers: onlineUsers.size,
            totalReports: reports.length,
            pendingReports: reports.filter(r => r.status === 'pending').length,
            activeBans: Object.keys(bans).length,
            messagesByCenter: {
                bulan: chatMessages.bulan?.length || 0,
                castilla: chatMessages.castilla?.length || 0,
                magallanes: chatMessages.magallanes?.length || 0,
                'sorsogon-city': chatMessages['sorsogon-city']?.length || 0
            }
        };
        
        res.json(stats);
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get admin actions log (admin only)
app.get('/api/admin/actions', requireAuth, async (req, res) => {
    try {
        const actions = await readJSON('admin_actions.json');
        res.json(actions.reverse().slice(0, 100)); // Last 100 actions
    } catch (err) {
        console.error('Error fetching actions:', err);
        res.status(500).json({ error: 'Failed to fetch actions' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║     SorSU TikTalk Server Running          ║
║                                           ║
║  Port: ${PORT}                              ║
║  Environment: ${process.env.NODE_ENV || 'development'}               ║
║  Time: ${new Date().toLocaleString()}     ║
╚═══════════════════════════════════════════╝
    `);
});

module.exports = { app, server, io };
