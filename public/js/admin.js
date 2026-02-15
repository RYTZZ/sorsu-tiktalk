// Admin dashboard logic
let adminToken = null;
let currentView = 'stats';

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    adminToken = sessionStorage.getItem('admin_token');
    
    if (adminToken) {
        showAdminDashboard();
        loadDashboardData();
    }

    // Initialize event listeners
    initializeEventListeners();
});

function initializeEventListeners() {
    // Admin login
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    // Sidebar navigation
    document.querySelectorAll('.admin-sidebar .campus-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view) {
                switchView(view);
            }
        });
    });

    // Logout
    document.getElementById('adminLogout').addEventListener('click', handleAdminLogout);

    // Report filter
    document.getElementById('reportFilter').addEventListener('change', filterReports);

    // Ban modal
    document.getElementById('closeBanModal').addEventListener('click', closeBanModal);
    document.getElementById('cancelBan').addEventListener('click', closeBanModal);
    document.getElementById('submitBan').addEventListener('click', submitBan);
    
    document.getElementById('banType').addEventListener('change', (e) => {
        const durationGroup = document.getElementById('durationGroup');
        durationGroup.style.display = e.target.value === 'temporary' ? 'block' : 'none';
    });
}

async function handleAdminLogin(e) {
    e.preventDefault();

    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            adminToken = data.token;
            sessionStorage.setItem('admin_token', adminToken);
            sessionStorage.setItem('admin_username', data.username);
            
            showAdminDashboard();
            loadDashboardData();
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
    }
}

function showAdminDashboard() {
    document.getElementById('adminLoginContainer').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    
    const username = sessionStorage.getItem('admin_username');
    document.getElementById('adminUser').textContent = username || 'Admin';
}

function handleAdminLogout() {
    if (confirm('Are you sure you want to logout?')) {
        adminToken = null;
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_username');
        
        document.getElementById('adminDashboard').classList.add('hidden');
        document.getElementById('adminLoginContainer').classList.remove('hidden');
    }
}

function switchView(view) {
    currentView = view;

    // Update sidebar active state
    document.querySelectorAll('.admin-sidebar .campus-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === view) {
            item.classList.add('active');
        }
    });

    // Show/hide views
    document.querySelectorAll('.admin-view').forEach(viewEl => {
        viewEl.classList.add('hidden');
    });
    
    document.getElementById(`${view}View`).classList.remove('hidden');

    // Load data for the view
    switch (view) {
        case 'stats':
            loadStats();
            break;
        case 'reports':
            loadReports();
            break;
        case 'bans':
            loadBans();
            break;
        case 'actions':
            loadActions();
            break;
    }
}

async function loadDashboardData() {
    await loadStats();
    await loadReports();
    
    // Refresh data every 30 seconds
    setInterval(() => {
        if (currentView === 'stats') loadStats();
        if (currentView === 'reports') loadReports();
        if (currentView === 'bans') loadBans();
    }, 30000);
}

async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        const stats = await response.json();

        // Update stat cards
        document.getElementById('onlineUsersCount').textContent = stats.onlineUsers || 0;
        document.getElementById('totalReportsCount').textContent = stats.totalReports || 0;
        document.getElementById('pendingReportsCountStats').textContent = stats.pendingReports || 0;
        document.getElementById('pendingReportsCount').textContent = stats.pendingReports || 0;
        document.getElementById('activeBansCount').textContent = stats.activeBans || 0;

        // Update campus messages
        document.getElementById('bulanMessages').textContent = stats.messagesByCenter.bulan || 0;
        document.getElementById('castillaMessages').textContent = stats.messagesByCenter.castilla || 0;
        document.getElementById('magallanesMessages').textContent = stats.messagesByCenter.magallanes || 0;
        document.getElementById('sorsogonMessages').textContent = stats.messagesByCenter['sorsogon-city'] || 0;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadReports() {
    try {
        const filter = document.getElementById('reportFilter').value;
        const url = filter === 'all' 
            ? '/api/admin/reports' 
            : `/api/admin/reports?status=${filter}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        const reports = await response.json();
        displayReports(reports);

    } catch (error) {
        console.error('Error loading reports:', error);
    }
}

function displayReports(reports) {
    const tbody = document.getElementById('reportsTableBody');
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-muted);">No reports found</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => `
        <tr>
            <td>${formatTime(report.timestamp)}</td>
            <td>${escapeHtml(report.reporterNickname)}</td>
            <td>${escapeHtml(report.reason)}</td>
            <td><span class="status-badge ${report.status}">${report.status}</span></td>
            <td>
                ${report.status === 'pending' ? `
                    <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="dismissReport('${report.id}')">Dismiss</button>
                    <button class="btn btn-danger" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="openBanModal('${report.id}', '${report.reportedIP}')">Ban</button>
                ` : `
                    <span style="color: var(--text-muted);">Reviewed</span>
                `}
            </td>
        </tr>
    `).join('');
}

function filterReports() {
    loadReports();
}

async function dismissReport(reportId) {
    if (!confirm('Are you sure you want to dismiss this report?')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/reports/${reportId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'dismissed',
                action: 'dismiss_report'
            })
        });

        if (response.ok) {
            alert('Report dismissed');
            loadReports();
            loadStats();
        } else {
            alert('Failed to dismiss report');
        }
    } catch (error) {
        console.error('Error dismissing report:', error);
        alert('Failed to dismiss report');
    }
}

function openBanModal(reportId, targetIP) {
    document.getElementById('banReportId').value = reportId;
    document.getElementById('banTargetIP').value = targetIP;
    document.getElementById('banModal').classList.remove('hidden');
}

function closeBanModal() {
    document.getElementById('banModal').classList.add('hidden');
    document.getElementById('banType').value = 'temporary';
    document.getElementById('banDuration').value = '24';
    document.getElementById('banReason').value = '';
    document.getElementById('banNotes').value = '';
}

async function submitBan() {
    const reportId = document.getElementById('banReportId').value;
    const targetIP = document.getElementById('banTargetIP').value;
    const banType = document.getElementById('banType').value;
    const duration = parseInt(document.getElementById('banDuration').value);
    const reason = document.getElementById('banReason').value.trim();
    const notes = document.getElementById('banNotes').value.trim();

    if (!reason) {
        alert('Please provide a reason for the ban');
        return;
    }

    if (!confirm(`Are you sure you want to issue a ${banType} ban?`)) {
        return;
    }

    try {
        const response = await fetch('/api/admin/bans', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ip: targetIP,
                type: banType,
                reason,
                durationHours: banType === 'temporary' ? duration : null,
                notes
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Update report status
            await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'reviewed',
                    action: banType === 'permanent' ? 'permanent_ban' : 'temporary_ban'
                })
            });

            alert('Ban issued successfully');
            closeBanModal();
            loadReports();
            loadStats();
            loadBans();
        } else {
            alert(data.error || 'Failed to issue ban');
        }
    } catch (error) {
        console.error('Error issuing ban:', error);
        alert('Failed to issue ban');
    }
}

async function loadBans() {
    try {
        const response = await fetch('/api/admin/bans', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        const bans = await response.json();
        displayBans(bans);

    } catch (error) {
        console.error('Error loading bans:', error);
    }
}

function displayBans(bans) {
    const tbody = document.getElementById('bansTableBody');
    
    if (bans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-muted);">No active bans</td></tr>';
        return;
    }

    tbody.innerHTML = bans.map(ban => `
        <tr>
            <td>${escapeHtml(ban.nickname || 'Unknown')}</td>
            <td><span class="status-badge ${ban.type === 'permanent' ? 'dismissed' : 'pending'}">${ban.type}</span></td>
            <td>${escapeHtml(ban.reason)}</td>
            <td>${ban.type === 'temporary' && ban.bannedUntil ? formatTimeRemaining(ban.bannedUntil) : 'Never'}</td>
            <td>
                <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="removeBan('${ban.ipHash}')">Unban</button>
            </td>
        </tr>
    `).join('');
}

async function removeBan(ipHash) {
    if (!confirm('Are you sure you want to remove this ban?')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/bans/${ipHash}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            alert('Ban removed successfully');
            loadBans();
            loadStats();
        } else {
            alert('Failed to remove ban');
        }
    } catch (error) {
        console.error('Error removing ban:', error);
        alert('Failed to remove ban');
    }
}

async function loadActions() {
    try {
        const response = await fetch('/api/admin/actions', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        const actions = await response.json();
        displayActions(actions);

    } catch (error) {
        console.error('Error loading actions:', error);
    }
}

function displayActions(actions) {
    const tbody = document.getElementById('actionsTableBody');
    
    if (actions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 2rem; color: var(--text-muted);">No actions recorded</td></tr>';
        return;
    }

    tbody.innerHTML = actions.map(action => `
        <tr>
            <td>${formatTime(action.timestamp)}</td>
            <td>${escapeHtml(action.admin)}</td>
            <td><span class="status-badge pending">${action.action.replace(/_/g, ' ')}</span></td>
            <td>${action.reason || action.duration || '-'}</td>
        </tr>
    `).join('');
}

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeRemaining(bannedUntil) {
    const now = new Date();
    const expiry = new Date(bannedUntil);
    const diff = expiry - now;

    if (diff <= 0) {
        return 'Expired';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
