const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Configuration file path
const configPath = path.join(__dirname, 'config.json');

// Default configuration
let serverConfig = {
    password: null, // null means no password protection
    passwordEnabled: false,
    serverName: 'Premium Cloud Share',
    maxUploadSize: null, // null means unlimited
    allowedFileTypes: ['*'], // * means all
    sessionTimeout: 3600000 // 1 hour in milliseconds
};

// Load configuration if exists
if (fs.existsSync(configPath)) {
    try {
        serverConfig = { ...serverConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
        console.log('✅ Configuration loaded');
    } catch (err) {
        console.error('❌ Error loading config:', err);
    }
}

// Save configuration function
function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(serverConfig, null, 2));
}

// Hash password function
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Active sessions store
const sessions = new Map();

// Authentication middleware
function requireAuth(req, res, next) {
    // Check if password protection is enabled
    if (!serverConfig.passwordEnabled || !serverConfig.password) {
        return next();
    }
    
    // Check for session token in header or query
    const token = req.headers['x-session-token'] || req.query.token;
    
    if (token && sessions.has(token)) {
        const session = sessions.get(token);
        // Check if session is still valid
        if (Date.now() - session.createdAt < serverConfig.sessionTimeout) {
            req.session = session;
            return next();
        } else {
            sessions.delete(token);
        }
    }
    
    // No valid session
    res.status(401).json({ 
        message: 'Authentication required', 
        requiresPassword: true 
    });
}

// Request logging middleware - log ALL requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory');
}

// Middleware - No file size limit with full CORS support
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
    credentials: true
}));
app.use(express.static('public'));
app.use('/shared', express.static('uploads'));
app.use(fileUpload({
    createParentPath: true,
    // limits removed - allow unlimited file size
}));
app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ extended: true, limit: '10gb' }));

// Explicit route for index.html to ensure it loads
app.get('/', (req, res) => {
    console.log('📄 Request: GET /');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to list files and folders recursively with detailed metadata
app.get('/api/files', requireAuth, (req, res) => {
    console.log('📂 Request: GET /api/files');
    
    const getAllFiles = (dirPath, arrayOfFiles) => {
        const files = fs.readdirSync(dirPath);
        arrayOfFiles = arrayOfFiles || [];

        files.forEach((file) => {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
            } else {
                const relativePath = path.relative(uploadsDir, filePath).replace(/\\/g, '/');
                const ext = file.split('.').pop().toLowerCase();
                
                // Format file size
                let sizeStr;
                const bytes = stats.size;
                if (bytes >= 1024 * 1024 * 1024) {
                    sizeStr = (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
                } else if (bytes >= 1024 * 1024) {
                    sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                } else if (bytes >= 1024) {
                    sizeStr = (bytes / 1024).toFixed(2) + ' KB';
                } else {
                    sizeStr = bytes + ' B';
                }
                
                // Get file type category
                let type = 'File';
                if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) type = 'Image';
                else if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) type = 'Video';
                else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) type = 'Audio';
                else if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) type = 'Document';
                else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) type = 'Archive';
                else if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm'].includes(ext)) type = 'Executable';
                else if (['html', 'htm', 'css', 'js', 'json', 'xml', 'php', 'py', 'java', 'cpp', 'c', 'h'].includes(ext)) type = 'Code';
                
                arrayOfFiles.push({
                    name: relativePath,
                    displayName: file,
                    size: sizeStr,
                    sizeBytes: bytes,
                    type: type,
                    extension: ext,
                    createdAt: stats.birthtime,
                    modifiedAt: stats.mtime,
                    url: `/shared/${relativePath}`
                });
            }
        });

        return arrayOfFiles;
    };

    try {
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const allFiles = getAllFiles(uploadsDir);
        console.log(`✅ Sending ${allFiles.length} files to client.`);
        res.status(200).json(allFiles);
    } catch (err) {
        console.error('❌ Error listing files:', err);
        res.status(500).send({ message: 'Unable to scan files!', error: err.message });
    }
});

// API to delete files or folders (protected)
app.delete('/api/delete', requireAuth, (req, res) => {
    const { path: relativePath } = req.body;
    console.log('🗑️ Delete request received:', relativePath);
    
    if (!relativePath) {
        console.log('❌ No path provided');
        return res.status(400).json({ message: 'Path is required' });
    }

    const fullPath = path.join(uploadsDir, relativePath);
    console.log('📍 Full path:', fullPath);
    console.log('📂 Uploads dir:', uploadsDir);
    
    // Security check: ensure path is within uploads directory
    if (!fullPath.startsWith(uploadsDir)) {
        console.log('❌ Security violation - path outside uploads');
        return res.status(403).json({ message: 'Invalid path' });
    }

    if (!fs.existsSync(fullPath)) {
        console.log('❌ File not found:', fullPath);
        return res.status(404).json({ message: 'File or folder not found', path: fullPath });
    }

    try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`✅ Deleted folder: ${relativePath}`);
        } else {
            fs.unlinkSync(fullPath);
            console.log(`✅ Deleted file: ${relativePath}`);
        }
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error('❌ Delete error:', err);
        res.status(500).json({ message: 'Delete failed', error: err.message, path: fullPath });
    }
});

// Handle CORS preflight for /api/delete
app.options('/api/delete', cors(), (req, res) => {
    console.log('✅ OPTIONS preflight received for /api/delete');
    res.sendStatus(200);
});

// Test GET endpoint to verify /api/delete is reachable
app.get('/api/delete', (req, res) => {
    res.json({ message: 'DELETE endpoint is working. Use DELETE method with {path: "filename"} in body.' });
});

app.post('/api/upload', requireAuth, (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const files = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
    const paths = Array.isArray(req.body.path) ? req.body.path : [req.body.path];

    let uploadCount = 0;
    let errors = [];

    files.forEach((file, index) => {
        // Use provided path (for folders) or just filename
        const relativePath = paths[index] || file.name;
        const uploadPath = path.join(uploadsDir, relativePath);
        const parentDir = path.dirname(uploadPath);

        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        file.mv(uploadPath, (err) => {
            uploadCount++;
            if (err) {
                console.error(`❌ Upload error for ${relativePath}:`, err);
                errors.push({ file: relativePath, error: err.message });
            }

            if (uploadCount === files.length) {
                if (errors.length > 0) {
                    res.status(500).json({ message: 'Some uploads failed', errors });
                } else {
                    console.log(`✅ Successfully uploaded ${files.length} items.`);
                    res.send({ message: 'All items uploaded successfully!' });
                }
            }
        });
    });
});

// Function to get local IPv4 address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const localIp = getLocalIp();

// ================= AUTHENTICATION & SETTINGS API =================

// Login endpoint
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    
    if (!serverConfig.passwordEnabled) {
        return res.json({ success: true, message: 'No password required' });
    }
    
    if (!password) {
        return res.status(400).json({ success: false, message: 'Password required' });
    }
    
    const hashedInput = hashPassword(password);
    if (hashedInput === serverConfig.password) {
        const token = generateToken();
        sessions.set(token, {
            createdAt: Date.now(),
            ip: req.ip
        });
        console.log('✅ User logged in, token generated');
        res.json({ success: true, token, message: 'Login successful' });
    } else {
        console.log('❌ Failed login attempt');
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token && sessions.has(token)) {
        sessions.delete(token);
        console.log('✅ User logged out');
    }
    res.json({ success: true, message: 'Logged out' });
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
    const token = req.headers['x-session-token'];
    const isAuthenticated = token && sessions.has(token) && 
        (Date.now() - sessions.get(token).createdAt < serverConfig.sessionTimeout);
    
    res.json({
        passwordEnabled: serverConfig.passwordEnabled,
        isAuthenticated: isAuthenticated || !serverConfig.passwordEnabled,
        serverName: serverConfig.serverName
    });
});

// Get settings (protected only if password is enabled)
app.get('/api/settings', requireAuth, (req, res) => {
    res.json({
        passwordEnabled: serverConfig.passwordEnabled,
        serverName: serverConfig.serverName,
        maxUploadSize: serverConfig.maxUploadSize,
        allowedFileTypes: serverConfig.allowedFileTypes,
        sessionTimeout: serverConfig.sessionTimeout
    });
});

// Update settings (protected only if password is enabled)
app.post('/api/settings', requireAuth, (req, res) => {
    const { serverName, maxUploadSize, allowedFileTypes, sessionTimeout } = req.body;
    
    if (serverName !== undefined) serverConfig.serverName = serverName;
    if (maxUploadSize !== undefined) serverConfig.maxUploadSize = maxUploadSize;
    if (allowedFileTypes !== undefined) serverConfig.allowedFileTypes = allowedFileTypes;
    if (sessionTimeout !== undefined) serverConfig.sessionTimeout = sessionTimeout;
    
    saveConfig();
    console.log('✅ Settings updated');
    res.json({ success: true, message: 'Settings saved', config: serverConfig });
});

// Set/Change password (protected only if password is enabled)
app.post('/api/settings/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword, enabled } = req.body;
    
    // If changing existing password, verify current
    if (serverConfig.passwordEnabled && serverConfig.password && currentPassword) {
        if (hashPassword(currentPassword) !== serverConfig.password) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
    }
    
    let token = null;
    
    // Set new password
    if (newPassword) {
        serverConfig.password = hashPassword(newPassword);
        serverConfig.passwordEnabled = true;
        
        // Generate session token for the user who just set the password
        token = generateToken();
        sessions.set(token, {
            createdAt: Date.now(),
            ip: req.ip
        });
        
        console.log('✅ Password set/changed, token generated for user');
    }
    
    // Toggle password protection
    if (enabled !== undefined) {
        serverConfig.passwordEnabled = enabled && serverConfig.password !== null;
        console.log(`✅ Password protection ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    saveConfig();
    res.json({ 
        success: true, 
        message: 'Password settings updated',
        passwordEnabled: serverConfig.passwordEnabled,
        token: token // Return token if password was just set
    });
});

// ================= SERVER ON/OFF FUNCTION =================

let serverRunning = true;
let serverInstance = null;

// Get server status
app.get('/api/server/status', (req, res) => {
    res.json({ running: serverRunning });
});

// Toggle server on/off (stop accepting new connections)
app.post('/api/server/toggle', requireAuth, (req, res) => {
    const { running } = req.body;
    
    if (running === undefined) {
        return res.status(400).json({ success: false, message: 'running parameter required' });
    }
    
    serverRunning = running;
    console.log(`✅ Server ${running ? 'started' : 'stopped'}`);
    res.json({ success: true, running: serverRunning });
});

// 404 handler for API routes - Express 5 compatible
app.use((req, res, next) => {
    // Check if server is running
    if (!serverRunning && req.path.startsWith('/api/') && req.path !== '/api/server/status') {
        return res.status(503).json({ message: 'Server is currently offline' });
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ message: 'API endpoint not found', path: req.path, method: req.method });
    }
    next();
});

serverInstance = app.listen(port, '0.0.0.0', () => {
    console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', '  🚀 Premium File Sharing Server is LIVE!');
    console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------');
    console.log(`  🔗 Local:   http://localhost:${port}`);
    console.log(`  🌐 Network: http://${localIp}:${port}`);
    console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------');
    console.log('  Logs:');
});
