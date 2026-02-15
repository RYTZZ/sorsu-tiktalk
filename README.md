# SorSU TikTalk - Anonymous Campus Chat Application

An anonymous real-time chat platform designed for Sorsogon State University community members with robust moderation features.

## 📋 Features

### Core Features
- **Anonymous Campus Chat**: Real-time messaging organized by campus
- **Direct Messaging**: Private one-on-one conversations between users
- **Dark Mode**: Toggle between light and dark themes
- **Report System**: Users can report inappropriate messages
- **Admin Dashboard**: Comprehensive moderation tools

### Admin Features
- **Reports Management**: Review and action user reports
- **Ban System**: Temporary and permanent IP bans
- **Activity Logging**: Track all admin actions
- **Real-time Statistics**: Monitor active users and messages
- **Campus-specific Moderation**: Manage each campus separately

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd sorsu-tiktalk
```

2. **Install dependencies**
```bash
npm install
```

3. **Create environment file**
```bash
cp .env.example .env
```

Edit `.env` and update the values:
```
PORT=3000
NODE_ENV=development
ADMIN_SECRET_KEY=your-secret-key-here-change-in-production
FRONTEND_URL=http://localhost:5500
```

4. **Start the server**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

5. **Open your browser**
- User interface: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin.html`

### Default Admin Credentials
- Username: `admin`
- Password: `admin123`

**⚠️ IMPORTANT: Change these credentials in production!**

## 📁 Project Structure

```
sorsu-tiktalk/
├── public/                 # Frontend files
│   ├── index.html         # Login page
│   ├── chat.html          # Main chat interface
│   ├── admin.html         # Admin dashboard
│   ├── css/
│   │   └── styles.css     # All styles (light + dark mode)
│   └── js/
│       ├── app.js         # Login logic
│       ├── chat.js        # Chat functionality
│       ├── admin.js       # Admin dashboard
│       └── socket-client.js  # Socket.io client
│
├── server/                # Backend files
│   ├── index.js           # Express + Socket.io server
│   ├── socket-handlers.js # Socket.io event handlers
│   ├── data/              # JSON file storage
│   ├── utils/             # Utility functions
│   │   ├── file-storage.js
│   │   ├── ban-checker.js
│   │   ├── ip-tracker.js
│   │   └── validation.js
│   └── middleware/
│       ├── auth.js        # Admin authentication
│       └── rate-limit.js  # Rate limiting
│
├── package.json
├── .env
├── .gitignore
└── README.md
```

## 🗄️ Data Storage

This application uses **JSON files** for data persistence (no database required):

- `bans.json` - Banned users/IPs
- `reports.json` - User reports
- `violations.json` - Violation tracking
- `admin_actions.json` - Admin activity log
- `admin_credentials.json` - Admin login credentials

Messages are stored **in-memory only** (last 100 per campus) and are cleared on server restart. This is intentional for privacy.

## 🌐 Deployment on Render

### Step 1: Prepare Repository

1. Push your code to GitHub/GitLab
2. Ensure `.gitignore` excludes:
   - `node_modules/`
   - `server/data/*.json`
   - `.env`

### Step 2: Deploy Backend (Web Service)

1. Go to [render.com](https://render.com) → "New Web Service"
2. Connect your repository
3. Configure:
   - **Name**: `sorsu-tiktalk-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Plan**: Free

4. Add environment variables:
   ```
   NODE_ENV=production
   ADMIN_SECRET_KEY=your-secure-secret-key
   FRONTEND_URL=https://your-frontend-url.onrender.com
   ```

5. Deploy!

### Step 3: Deploy Frontend (Static Site)

1. Render.com → "New Static Site"
2. Same repository
3. Configure:
   - **Name**: `sorsu-tiktalk`
   - **Build Command**: (leave empty)
   - **Publish Directory**: `public`

4. Deploy!

### Step 4: Update Socket.io URL

In `public/js/socket-client.js`, update the SOCKET_URL:

```javascript
const SOCKET_URL = 'https://sorsu-tiktalk-api.onrender.com';
```

**Done!** Your app is now live at `https://sorsu-tiktalk.onrender.com`

## 🔧 Configuration

### Campus List

To add/modify campuses, edit:

1. `public/index.html` - Add campus option in dropdown
2. `public/chat.html` - Add campus item in sidebar
3. `server/socket-handlers.js` - Add campus to `chatMessages` object

### Admin Credentials

To change admin password:

1. Generate password hash:
```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('your-new-password', 10);
console.log(hash);
```

2. Update `server/data/admin_credentials.json`:
```json
{
  "users": [{
    "username": "admin",
    "passwordHash": "your-generated-hash-here"
  }]
}
```

### Profanity Filter

Add inappropriate words to filter in `server/utils/validation.js`:

```javascript
const profanityList = [
    'word1', 'word2', 'word3'
    // Add more words
];
```

## 🛡️ Security Features

- **IP-based banning**: Tracks and bans by IP address (hashed)
- **Rate limiting**: Prevents spam and abuse
- **Input sanitization**: Prevents XSS attacks
- **CORS protection**: Configured origin restrictions
- **Admin authentication**: Secure admin access
- **Session management**: Secure session handling

## 📊 Features Roadmap

### Phase 1 (Current - MVP)
- ✅ Real-time campus chat
- ✅ Dark mode toggle
- ✅ Report system
- ✅ Admin dashboard
- ✅ Ban system (temporary & permanent)

### Phase 2 (Planned)
- [ ] Direct messaging (DM) between users
- [ ] Message reactions and emojis
- [ ] @mentions and notifications
- [ ] Enhanced profanity filter
- [ ] Ban evasion detection

### Phase 3 (Future)
- [ ] Message threading/replies
- [ ] File/image sharing
- [ ] User blocking
- [ ] Export chat history
- [ ] Mobile app (PWA)

## 🐛 Troubleshooting

### Server won't start
- Check if port 3000 is available
- Verify Node.js version (18+)
- Ensure all dependencies are installed: `npm install`

### Socket.io connection fails
- Check `SOCKET_URL` in `socket-client.js`
- Verify CORS settings in `server/index.js`
- Check browser console for errors

### Admin login fails
- Verify credentials in `server/data/admin_credentials.json`
- Check server logs for authentication errors
- Ensure bcrypt password hash is correct

### Messages not persisting
- This is intentional! Messages are in-memory only
- Last 100 messages per campus are kept
- Server restart clears all messages

## 📝 API Endpoints

### Admin Endpoints

All admin endpoints require `Authorization: Bearer <token>` header.

- `POST /api/admin/login` - Admin login
- `GET /api/admin/reports` - Get all reports
- `PATCH /api/admin/reports/:id` - Update report status
- `POST /api/admin/bans` - Issue a ban
- `GET /api/admin/bans` - Get all bans
- `DELETE /api/admin/bans/:ipHash` - Remove a ban
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/actions` - Get admin activity log

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 👥 Support

For support or questions:
- Email: admin@sorsu.edu.ph
- Create an issue on GitHub

## 🙏 Acknowledgments

- Built for Sorsogon State University
- Socket.io for real-time communication
- Express.js for server framework
- Render for hosting

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Status**: Production Ready
