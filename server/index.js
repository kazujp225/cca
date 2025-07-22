// Load environment variables from .env file
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const envPath = path.join(__dirname, '../.env');
  const envFile = fsSync.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0 && !process.env[key]) {
        process.env[key] = valueParts.join('=').trim();
      }
    }
  });
} catch (e) {
  console.log('No .env file found or error reading it:', e.message);
}

console.log('PORT from env:', process.env.PORT);

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import pty from 'node-pty';
import fetch from 'node-fetch';
import mime from 'mime-types';

import { getProjects, getSessions, getSessionMessages, renameProject, deleteSession, deleteProject, addProjectManually, extractProjectDirectory, clearProjectDirectoryCache } from './projects.js';
import { spawnClaude, abortClaudeSession } from './claude-cli.js';
import gitRoutes from './routes/git.js';
import authRoutes from './routes/auth.js';
import mcpRoutes from './routes/mcp.js';
import helpChatRoutes from './helpChat.js';
import { initializeDatabase } from './database/db.js';
import { validateApiKey, authenticateToken, authenticateWebSocket } from './middleware/auth.js';
import { executeShellCommand, executeUltrathink } from './shell-handler.js';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// File system watcher for projects folder
let projectsWatcher = null;
const connectedClients = new Set();

// Server process management
const runningServers = new Map(); // projectPath -> { process, url, script, startTime }

// Setup file system watcher for Claude projects folder using chokidar
async function setupProjectsWatcher() {
  const chokidar = (await import('chokidar')).default;
  const claudeProjectsPath = path.join(process.env.HOME, '.claude', 'projects');
  
  if (projectsWatcher) {
    projectsWatcher.close();
  }
  
  try {
    // Initialize chokidar watcher with optimized settings
    projectsWatcher = chokidar.watch(claudeProjectsPath, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.tmp',
        '**/*.swp',
        '**/.DS_Store'
      ],
      persistent: true,
      ignoreInitial: true, // Don't fire events for existing files on startup
      followSymlinks: false,
      depth: 10, // Reasonable depth limit
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms for file to stabilize
        pollInterval: 50
      }
    });
    
    // Debounce function to prevent excessive notifications
    let debounceTimer;
    const debouncedUpdate = async (eventType, filePath) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          
          // Clear project directory cache when files change
          clearProjectDirectoryCache();
          
          // Get updated projects list
          const updatedProjects = await getProjects();
          
          // Notify all connected clients about the project changes
          const updateMessage = JSON.stringify({
            type: 'projects_updated',
            projects: updatedProjects,
            timestamp: new Date().toISOString(),
            changeType: eventType,
            changedFile: path.relative(claudeProjectsPath, filePath)
          });
          
          connectedClients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(updateMessage);
            }
          });
          
        } catch (error) {
          console.error('❌ Error handling project changes:', error);
        }
      }, 300); // 300ms debounce (slightly faster than before)
    };
    
    // Set up event listeners
    projectsWatcher
      .on('add', (filePath) => debouncedUpdate('add', filePath))
      .on('change', (filePath) => debouncedUpdate('change', filePath))
      .on('unlink', (filePath) => debouncedUpdate('unlink', filePath))
      .on('addDir', (dirPath) => debouncedUpdate('addDir', dirPath))
      .on('unlinkDir', (dirPath) => debouncedUpdate('unlinkDir', dirPath))
      .on('error', (error) => {
        console.error('❌ Chokidar watcher error:', error);
      })
      .on('ready', () => {
      });
    
  } catch (error) {
    console.error('❌ Failed to setup projects watcher:', error);
  }
}


const app = express();
const server = http.createServer(app);

// Single WebSocket server that handles both paths
const wss = new WebSocketServer({ 
  server,
  verifyClient: (info, cb) => {
    console.log('WebSocket connection attempt to:', info.req.url);
    
    // Extract token from query parameters or headers
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token') || 
                  info.req.headers.authorization?.split(' ')[1];
    
    console.log('Token found:', token ? 'Yes' : 'No');
    
    // For /shell endpoint, we still need to verify the token
    if (url.pathname === '/shell') {
      console.log('🔐 Shell WebSocket - verifying authentication');
      // Verify token even for shell endpoint
      const user = authenticateWebSocket(token);
      if (!user) {
        console.log('❌ Shell WebSocket authentication failed');
        cb(false, 401, 'Unauthorized');
        return;
      }
      info.req.user = user;
      console.log('✅ Shell WebSocket authenticated for user:', user.username);
      cb(true);
      return;
    }
    
    // Verify token
    const user = authenticateWebSocket(token);
    if (!user) {
      console.log('❌ WebSocket authentication failed for token:', token ? token.substring(0, 20) + '...' : 'null');
      cb(false, 401, 'Unauthorized');
      return;
    }
    
    // Store user info in the request for later use
    info.req.user = user;
    console.log('✅ WebSocket authenticated for user:', user.username);
    cb(true);
  }
});

// CORS configuration for production security
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'http://localhost:6667',
        'https://your-domain.com', // Add your production domain here
      ]
    : [
        'http://localhost:6667',
        'http://127.0.0.1:6667',
        'http://localhost:3001', // Legacy support
        'http://127.0.0.1:3001'
      ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Limit payload size for security

// Optional API key validation (if configured)
app.use('/api', validateApiKey);

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Git API Routes (protected)
app.use('/api/git', authenticateToken, gitRoutes);

// MCP API Routes (protected)
app.use('/api/mcp', authenticateToken, mcpRoutes);

// API route for ccusage
app.get('/api/usage', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Fetching Claude Code usage data...');
    
    const { stdout, stderr } = await execAsync('npx ccusage@latest --json 2>/dev/null', {
      timeout: 30000,
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf8'
    });
    
    if (stderr) {
      console.warn('ccusage stderr:', stderr);
    }
    
    // Clean up the output more aggressively
    let cleanOutput = stdout
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n+/g, '\n'); // Remove extra newlines
    
    console.log('🔍 Raw output length:', stdout.length);
    console.log('🔍 Clean output length:', cleanOutput.length);
    console.log('🔍 First 300 chars of clean output:', cleanOutput.slice(0, 300));
    
    // Try to extract valid JSON more carefully
    let jsonString = '';
    let braceCount = 0;
    let startFound = false;
    let startIndex = 0;
    
    for (let i = 0; i < cleanOutput.length; i++) {
      const char = cleanOutput[i];
      
      if (char === '{') {
        if (!startFound) {
          startFound = true;
          startIndex = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (startFound && braceCount === 0) {
          jsonString = cleanOutput.slice(startIndex, i + 1);
          break;
        }
      }
    }
    
    if (!jsonString) {
      console.error('Could not extract valid JSON from output');
      console.error('Raw stdout preview:', stdout.slice(0, 1000));
      throw new Error('No valid JSON found in ccusage output');
    }
    
    console.log('🔍 Extracted JSON length:', jsonString.length);
    console.log('🔍 JSON starts with:', jsonString.slice(0, 100));
    console.log('🔍 JSON ends with:', jsonString.slice(-100));
    
    // Parse JSON output from ccusage
    let parsedData;
    try {
      parsedData = JSON.parse(jsonString);
    } catch (jsonError) {
      console.error('Failed to parse JSON from ccusage:', jsonError);
      console.error('Problematic JSON string (first 1000 chars):', jsonString.slice(0, 1000));
      
      // Try to fix common JSON issues
      try {
        const fixedJson = jsonString
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'); // Quote unquoted keys
        
        parsedData = JSON.parse(fixedJson);
        console.log('✅ JSON fixed and parsed successfully');
      } catch (fixError) {
        throw new Error(`JSON parsing failed even after attempted fixes: ${jsonError.message}`);
      }
    }
    
    // Transform the JSON data to match our expected format
    const usageData = [];
    let total = { input: 0, output: 0, cost: 0 };
    
    if (parsedData && parsedData.daily && Array.isArray(parsedData.daily)) {
      // Handle the new ccusage JSON format
      for (const item of parsedData.daily) {
        const models = item.modelsUsed || [];
        const entry = {
          date: item.date,
          models: models,
          input: parseInt(item.inputTokens) || 0,
          output: parseInt(item.outputTokens) || 0,
          cost: parseFloat(item.totalCost) || 0
        };
        usageData.push(entry);
      }
      
      // Use totals from parsed data
      if (parsedData.totals) {
        total = {
          input: parseInt(parsedData.totals.inputTokens) || 0,
          output: parseInt(parsedData.totals.outputTokens) || 0,
          cost: parseFloat(parsedData.totals.totalCost) || 0
        };
      }
    }
    
    console.log('🔍 Parsed usage data count:', usageData.length);
    console.log('🔍 Total data:', total);
    console.log('🔍 First few entries:', usageData.slice(0, 3));

    res.json({
      success: true,
      data: usageData,
      total: total,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching usage data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch usage data',
      details: error.message 
    });
  }
});

// Static files served after API routes
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes (protected)
app.get('/api/config', authenticateToken, (req, res) => {
  const host = req.headers.host || `${req.hostname}:${PORT}`;
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'wss' : 'ws';
  
  console.log('Config API called - Returning host:', host, 'Protocol:', protocol);
  
  res.json({
    serverPort: PORT,
    wsUrl: `${protocol}://${host}`
  });
});

app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectName/sessions', authenticateToken, async (req, res) => {
  try {
    const { limit = 5, offset = 0 } = req.query;
    const result = await getSessions(req.params.projectName, parseInt(limit), parseInt(offset));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a specific session
app.get('/api/projects/:projectName/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    const messages = await getSessionMessages(projectName, sessionId);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rename project endpoint
app.put('/api/projects/:projectName/rename', authenticateToken, async (req, res) => {
  try {
    const { displayName } = req.body;
    await renameProject(req.params.projectName, displayName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete session endpoint
app.delete('/api/projects/:projectName/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    await deleteSession(projectName, sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project endpoint (only if empty)
app.delete('/api/projects/:projectName', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    await deleteProject(projectName);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create project endpoint
app.post('/api/projects/create', authenticateToken, async (req, res) => {
  try {
    const { path: projectPath, fileName, folderName } = req.body;
    
    if (!projectPath || !projectPath.trim()) {
      return res.status(400).json({ error: 'Project path is required' });
    }
    
    const project = await addProjectManually(projectPath.trim(), null, fileName, folderName);
    res.json({ success: true, project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create directory endpoint
app.post('/api/projects/mkdir', authenticateToken, async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    
    if (!dirPath || !dirPath.trim()) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    
    // Expand ~ to home directory
    const expandedPath = dirPath.trim().replace(/^~/, process.env.HOME || os.homedir());
    
    console.log('📁 Creating directory:', expandedPath);
    
    // Create directory with recursive flag to create parent directories if needed
    await fs.mkdir(expandedPath, { recursive: true });
    
    res.json({ success: true, path: expandedPath });
  } catch (error) {
    console.error('Error creating directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Read file content endpoint
app.get('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath } = req.query;
    
    console.log('📄 File read request:', projectName, filePath);
    
    // Using fs from import
    
    // Security check - ensure the path is safe and absolute
    if (!filePath || !path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content, path: filePath });
  } catch (error) {
    console.error('Error reading file:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Serve binary file content endpoint (for images, etc.)
app.get('/api/projects/:projectName/files/content', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { path: filePath } = req.query;
    
    console.log('🖼️ Binary file serve request:', projectName, filePath);
    
    // Using fs from import
    // Using mime from import
    
    // Security check - ensure the path is safe and absolute
    if (!filePath || !path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file extension and set appropriate content type
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    
    // Stream the file
    const fileStream = fsSync.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });
    
  } catch (error) {
    console.error('Error serving binary file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Save file content endpoint
app.put('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath, content } = req.body;
    
    console.log('💾 File save request:', projectName, filePath);
    
    // Using fs from import
    
    // Security check - ensure the path is safe and absolute
    if (!filePath || !path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (mkdirError) {
      console.warn('Could not create directory:', mkdirError.message);
    }
    
    // Create backup of original file if it exists
    try {
      await fs.access(filePath);
      const backupPath = filePath + '.backup.' + Date.now();
      await fs.copyFile(filePath, backupPath);
      console.log('📋 Created backup:', backupPath);
    } catch (backupError) {
      // File doesn't exist, no backup needed
      console.log('📄 Creating new file:', filePath);
    }
    
    // Write the new content
    await fs.writeFile(filePath, content, 'utf8');
    
    res.json({ 
      success: true, 
      path: filePath,
      message: 'File saved successfully' 
    });
  } catch (error) {
    console.error('Error saving file:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File or directory not found' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Delete file endpoint
app.delete('/api/projects/:projectName/file', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    const { filePath } = req.body;
    
    console.log('🗑️ File delete request:', projectName, filePath);
    
    // Security check - ensure the path is safe and absolute
    if (!filePath || !path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Create backup before deletion
    try {
      const backupPath = filePath + '.deleted.' + Date.now();
      await fs.copyFile(filePath, backupPath);
      console.log('📋 Created backup before deletion:', backupPath);
    } catch (backupError) {
      console.warn('Could not create backup:', backupError.message);
    }
    
    // Delete the file
    await fs.unlink(filePath);
    
    res.json({ 
      success: true, 
      path: filePath,
      message: 'File deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Open terminal in project directory
app.post('/api/projects/:projectName/open-terminal', authenticateToken, async (req, res) => {
  try {
    const projectName = req.params.projectName;
    console.log('🖥️  Open terminal request:', projectName);
    
    // Get the actual project path
    let projectPath;
    try {
      projectPath = await extractProjectDirectory(projectName);
    } catch (error) {
      console.error('Error extracting project directory:', error);
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Ensure the path exists
    try {
      await fs.access(projectPath);
    } catch (error) {
      return res.status(404).json({ error: `Project path not found: ${projectPath}` });
    }
    
    // Open terminal based on platform
    let command;
    if (process.platform === 'darwin') {
      // macOS: Open Terminal app
      command = `open -a Terminal "${projectPath}"`;
    } else if (process.platform === 'win32') {
      // Windows: Open Command Prompt
      command = `start cmd /K "cd /d ${projectPath}"`;
    } else {
      // Linux: Try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'x-terminal-emulator'];
      let terminalFound = false;
      
      for (const terminal of terminals) {
        try {
          await execAsync(`which ${terminal}`);
          command = `${terminal} --working-directory="${projectPath}"`;
          terminalFound = true;
          break;
        } catch {
          // Try next terminal
        }
      }
      
      if (!terminalFound) {
        return res.status(500).json({ 
          error: 'No supported terminal emulator found',
          platform: process.platform 
        });
      }
    }
    
    console.log('🚀 Executing terminal command:', command);
    
    // Execute the command
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error opening terminal:', error);
        return res.status(500).json({ 
          error: 'Failed to open terminal',
          details: error.message 
        });
      }
      
      res.json({ 
        success: true,
        message: 'Terminal opened successfully',
        projectPath,
        platform: process.platform
      });
    });
    
  } catch (error) {
    console.error('❌ Error in open-terminal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute shell command
app.post('/api/shell/execute', authenticateToken, executeShellCommand);

// Execute ultrathink command
app.post('/api/ultrathink', authenticateToken, executeUltrathink);

app.get('/api/projects/:projectName/files', authenticateToken, async (req, res) => {
  try {
    
    // Using fs from import
    
    // Use extractProjectDirectory to get the actual project path
    let actualPath;
    try {
      actualPath = await extractProjectDirectory(req.params.projectName);
    } catch (error) {
      console.error('Error extracting project directory:', error);
      // Fallback to simple dash replacement
      actualPath = req.params.projectName.replace(/-/g, '/');
    }
    
    // Check if path exists
    try {
      await fs.access(actualPath);
    } catch (e) {
      return res.status(404).json({ error: `Project path not found: ${actualPath}` });
    }
    
    const files = await getFileTree(actualPath, 3, 0, true);
    const hiddenFiles = files.filter(f => f.name.startsWith('.'));
    res.json(files);
  } catch (error) {
    console.error('❌ File tree error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection handler that routes based on URL path
wss.on('connection', (ws, request) => {
  const url = request.url;
  console.log('🔗 Client connected to:', url);
  
  // Parse URL to get pathname without query parameters
  const urlObj = new URL(url, 'http://localhost');
  const pathname = urlObj.pathname;
  
  if (pathname === '/ws') {
    handleChatConnection(ws, request);
  } else if (pathname === '/shell') {
    handleShellConnection(ws, request);
  } else {
    console.log('❌ Unknown WebSocket path:', pathname);
    ws.close();
  }
});

// Handle chat WebSocket connections
function handleChatConnection(ws) {
  console.log('💬 Chat WebSocket connected');
  
  // Add to connected clients for project updates
  connectedClients.add(ws);
  
  ws.on('message', async (message) => {
    try {
      // Clean message before parsing
      const cleanMessage = message.toString().trim().replace(/\u0000/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (!cleanMessage) return;
      
      const data = JSON.parse(cleanMessage);
      
      if (data.type === 'claude-command') {
        console.log('💬 User message:', data.command || '[Continue/Resume]');
        console.log('📁 Project:', data.options?.projectPath || 'Unknown');
        console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
        await spawnClaude(data.command, data.options, ws);
      } else if (data.type === 'help-chat') {
        console.log('❓ Help chat message:', data.message);
        await handleHelpChat(data.message, ws, data.apiKey);
      } else if (data.type === 'abort-session') {
        console.log('🛑 Abort session request:', data.sessionId);
        const success = abortClaudeSession(data.sessionId);
        ws.send(JSON.stringify({
          type: 'session-aborted',
          sessionId: data.sessionId,
          success
        }));
      } else if (data.type === 'server:start') {
        console.log('🚀 Start server request:', data.projectPath, data.script);
        await handleServerStart(data.projectPath, data.script, ws);
      } else if (data.type === 'server:stop') {
        console.log('🛑 Stop server request:', data.projectPath);
        await handleServerStop(data.projectPath, ws);
      } else if (data.type === 'server:status') {
        console.log('📊 Server status request:', data.projectPath);
        await handleServerStatus(data.projectPath, ws);
      }
    } catch (error) {
      console.error('❌ Chat WebSocket error:', error.message);
      console.error('❌ Error stack:', error.stack);
      try {
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      } catch (sendError) {
        console.error('❌ Failed to send error message:', sendError.message);
      }
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Chat client disconnected');
    // Remove from connected clients
    connectedClients.delete(ws);
  });
}

// Handle shell WebSocket connections
function handleShellConnection(ws, request) {
  console.log('🐚 Shell WebSocket connected');
  
  // Get user info from request
  const user = request.user;
  if (!user) {
    console.error('❌ Shell connection without user info');
    ws.close();
    return;
  }
  
  // Track shell sessions
  let shellProcess = null;
  let currentPath = process.cwd();
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'shell:command') {
        const { command, projectPath } = data;
        console.log('🐚 Shell command:', command);
        
        // Execute command
        const workingDir = currentPath || projectPath || process.cwd();
        
        try {
          // Security check - reuse existing dangerous command patterns
          const dangerousCommands = [
            'rm -rf /', 'format', 'del /f', 'sudo', 'su', 'chmod 777', 'chown',
            'passwd', 'fdisk', 'mkfs', 'dd if=', 'killall', 'pkill', 'halt',
            'reboot', 'shutdown', 'init', 'systemctl', 'service', 'mount',
            'umount', 'crontab', 'at ', 'batch', 'nohup', 'screen', 'tmux'
          ];
          
          if (dangerousCommands.some(cmd => command.toLowerCase().includes(cmd.toLowerCase()))) {
            ws.send(JSON.stringify({
              type: 'shell:error',
              error: 'Command not allowed for security reasons'
            }));
            return;
          }
          
          // Execute command using child_process
          // Create clean environment without Claude Code UI specific variables
          const cleanEnv = { ...process.env };
          delete cleanEnv.PORT; // Remove PORT to allow child processes to find available port
          delete cleanEnv.VITE_PORT;
          delete cleanEnv.VITE_API_PORT;
          
          const { stdout, stderr } = await execAsync(command, {
            cwd: workingDir,
            env: { 
              ...cleanEnv,
              FORCE_COLOR: '1',
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor'
            },
            encoding: 'utf8',
            shell: true
          });
          
          // Check if directory changed (cd command)
          if (command.trim().startsWith('cd ')) {
            const targetDir = command.trim().slice(3).trim();
            if (targetDir) {
              const newPath = path.resolve(workingDir, targetDir);
              try {
                await fs.access(newPath);
                currentPath = newPath;
              } catch {
                // Directory doesn't exist, keep current path
              }
            }
          }
          
          // Send output
          ws.send(JSON.stringify({
            type: 'shell:output',
            stdout,
            stderr,
            currentPath
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'shell:output',
            stdout: '',
            stderr: error.message || 'Command failed',
            exitCode: error.code || 1
          }));
        }
      }
    } catch (error) {
      console.error('❌ Shell WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'shell:error',
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('🐚 Shell WebSocket disconnected');
    if (shellProcess) {
      shellProcess.kill();
    }
  });
}

// Handle help chat via WebSocket
async function handleHelpChat(message, ws, userApiKey = null) {
  try {
    // Use OpenAI GPT API only (user key takes priority)
    const apiKey = userApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      ws.send(JSON.stringify({
        type: 'help-chat-error',
        error: 'OpenAI APIキーが設定されていません。設定ボタンからAPIキーを入力してください。'
      }));
      return;
    }

    console.log('Using OpenAI GPT API for help chat', userApiKey ? '(user provided key)' : '(server key)');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `あなたは優秀なプログラミング教師で、Claude Codeのヘルプアシスタントです。以下のガイドラインに従って回答してください：

## 基本方針
- 初心者でも理解できるよう、専門用語は必ず簡単な言葉で説明する
- 具体例や実際の使用場面を必ず含める
- 段階的に説明し、一度に多くの情報を詰め込まない
- 親しみやすく、励ましの気持ちを込めて回答する

## 回答構成
1. **まず結論**：質問への直接的な答え
2. **簡単な説明**：初心者向けの分かりやすい解説
3. **具体例**：実際の使い方や場面
4. **次のステップ**：関連する学習内容やお勧めの次の行動

## 専門用語の説明方法
- API → 「異なるソフトウェア同士が会話するための約束事」
- WebSocket → 「リアルタイムでデータを送受信する仕組み」  
- Git → 「ファイルの変更履歴を記録・管理するツール」
- npm → 「便利な機能を簡単に追加できるパッケージ管理ツール」

## Claude Codeの主な機能
- **プロジェクト管理**：作業フォルダを整理し、チャット履歴を保存
- **AIとの対話**：自然言語でコード作成・編集・デバッグ
- **ファイル操作**：作成・編集・削除をAIと協力して実行
- **Git統合**：バージョン管理を簡単に操作
- **ターミナル**：コマンドライン操作をGUIから実行
- **音声入力**：話しかけるだけで質問や指示が可能
- **セッション履歴**：過去の作業内容を振り返り可能

## 回答の長さ
- 基本的な質問：2-3文で簡潔に
- 技術的な質問：4-6文で段階的に説明
- 複雑な概念：例を使って丁寧に解説

必ず相手のレベルに合わせて、理解しやすい言葉で回答してください。`
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (response.ok) {
      const data = await response.json();
      const gptResponse = data.choices[0].message.content;
      
      ws.send(JSON.stringify({
        type: 'help-chat-response',
        response: gptResponse
      }));
    } else if (response.status === 401) {
      ws.send(JSON.stringify({
        type: 'help-chat-error',
        error: 'APIキーが無効です。設定を確認してください。'
      }));
    } else if (response.status === 429) {
      ws.send(JSON.stringify({
        type: 'help-chat-error',
        error: 'API使用量の上限に達しました。しばらく待ってから再試行してください。'
      }));
    } else {
      const errorData = await response.json().catch(() => ({}));
      ws.send(JSON.stringify({
        type: 'help-chat-error',
        error: `APIエラー: ${errorData.error?.message || response.status}`
      }));
    }

  } catch (error) {
    console.error('Help chat error:', error);
    ws.send(JSON.stringify({
      type: 'help-chat-error',
      error: 'ネットワークエラーが発生しました。接続を確認してください。'
    }));
  }
}

// Server management functions
async function handleServerStart(projectPath, script, ws) {
  try {
    // Check if server is already running for this project
    if (runningServers.has(projectPath)) {
      const serverInfo = runningServers.get(projectPath);
      ws.send(JSON.stringify({
        type: 'server:already-running',
        projectPath,
        url: serverInfo.url,
        script: serverInfo.script,
        startTime: serverInfo.startTime
      }));
      return;
    }

    // Send starting status
    ws.send(JSON.stringify({
      type: 'server:starting',
      projectPath,
      script
    }));

    // Create a log file for the server output
    const logFileName = `server-${path.basename(projectPath)}-${Date.now()}.log`;
    const logFilePath = path.join(os.tmpdir(), logFileName);
    
    // Start the server process completely detached (like running in terminal)
    // Using nohup to ensure it continues running independently
    const startCommand = process.platform === 'win32' 
      ? `start /b cmd /c "cd /d "${projectPath}" && ${script} > "${logFilePath}" 2>&1"`
      : `cd "${projectPath}" && nohup ${script} > "${logFilePath}" 2>&1 & echo $!`;
    
    let serverPid;
    try {
      if (process.platform === 'win32') {
        // For Windows, we need a different approach
        exec(startCommand, { shell: true });
        // Give it a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // For Unix-like systems, get the PID
        const result = execSync(startCommand, { encoding: 'utf8' });
        serverPid = parseInt(result.trim());
        console.log('🚀 Started server with PID:', serverPid);
      }
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      ws.send(JSON.stringify({
        type: 'server:error',
        projectPath,
        error: `Failed to start server: ${error.message}`
      }));
      return;
    }

    let serverUrl = null;
    let isUrlDetected = false;
    let lastLogSize = 0;

    // Monitor the log file for output
    const checkLogFile = async () => {
      try {
        const stats = await fs.stat(logFilePath);
        if (stats.size > lastLogSize) {
          const buffer = Buffer.alloc(stats.size - lastLogSize);
          const fd = await fs.open(logFilePath, 'r');
          await fd.read(buffer, 0, buffer.length, lastLogSize);
          await fd.close();
          
          const newOutput = buffer.toString();
          lastLogSize = stats.size;
          
          console.log('📤 Server output:', newOutput);

          // Send logs to client
          ws.send(JSON.stringify({
            type: 'server:log',
            projectPath,
            log: newOutput
          }));

          // Detect server URL patterns
          if (!isUrlDetected) {
            const urlPatterns = [
              /(?:Local:|Running on|Server running|Available on|Listening on|Started.*http).*?(https?:\/\/[^\s\n]+)/i,
              /(?:localhost:|127\.0\.0\.1:)(\d+)/i,
              /(?:Port|port)[\s:]*(\d+)/i
            ];

            for (const pattern of urlPatterns) {
              const match = newOutput.match(pattern);
              if (match) {
                if (match[1] && match[1].startsWith('http')) {
                  serverUrl = match[1];
                } else if (match[1] && /^\d+$/.test(match[1])) {
                  serverUrl = `http://localhost:${match[1]}`;
                }
                
                if (serverUrl) {
                  isUrlDetected = true;
                  console.log('🌐 Detected server URL:', serverUrl);
                  
                  // Store server info
                  runningServers.set(projectPath, {
                    pid: serverPid,
                    logFile: logFilePath,
                    url: serverUrl,
                    script,
                    startTime: new Date().toISOString()
                  });

                  // Notify client that server is running
                  ws.send(JSON.stringify({
                    type: 'server:running',
                    projectPath,
                    url: serverUrl,
                    script,
                    startTime: new Date().toISOString()
                  }));
                  
                  // Stop monitoring once URL is detected
                  clearInterval(logMonitor);
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        // Log file might not exist yet, ignore
      }
    };
    
    // Start monitoring the log file
    const logMonitor = setInterval(checkLogFile, 500);
    
    // Stop monitoring after 30 seconds if no URL detected
    setTimeout(() => {
      clearInterval(logMonitor);
      if (!isUrlDetected) {
        // Even if URL not detected, store the server info
        runningServers.set(projectPath, {
          pid: serverPid,
          logFile: logFilePath,
          url: null,
          script,
          startTime: new Date().toISOString()
        });
        
        ws.send(JSON.stringify({
          type: 'server:running',
          projectPath,
          url: null,
          script,
          startTime: new Date().toISOString(),
          message: 'Server started but URL not detected. Check logs for details.'
        }));
      }
    }, 30000);

  } catch (error) {
    console.error('❌ Error starting server:', error);
    ws.send(JSON.stringify({
      type: 'server:error',
      projectPath,
      error: error.message
    }));
  }
}

async function handleServerStop(projectPath, ws) {
  try {
    const serverInfo = runningServers.get(projectPath);
    
    if (!serverInfo) {
      ws.send(JSON.stringify({
        type: 'server:not-running',
        projectPath
      }));
      return;
    }

    // Send stopping status
    ws.send(JSON.stringify({
      type: 'server:stopping',
      projectPath
    }));

    // Kill the process
    if (serverInfo.pid) {
      try {
        if (process.platform === 'win32') {
          // Windows: use taskkill
          execSync(`taskkill /F /PID ${serverInfo.pid}`, { stdio: 'ignore' });
        } else {
          // Unix: kill process group
          process.kill(-serverInfo.pid, 'SIGTERM');
          
          // Force kill after 5 seconds if not terminated
          setTimeout(() => {
            if (runningServers.has(projectPath)) {
              console.log('🔪 Force killing server process');
              try {
                process.kill(-serverInfo.pid, 'SIGKILL');
              } catch (error) {
                // Process might already be dead
                console.log('⚠️  Process might already be terminated:', error.message);
              }
            }
          }, 5000);
        }
      } catch (error) {
        console.log('⚠️  Error killing process:', error.message);
      }
    }
    
    // Clean up log file
    if (serverInfo.logFile) {
      try {
        await fs.unlink(serverInfo.logFile);
      } catch (error) {
        // Log file might not exist, ignore
      }
    }

  } catch (error) {
    console.error('❌ Error stopping server:', error);
    ws.send(JSON.stringify({
      type: 'server:error',
      projectPath,
      error: error.message
    }));
  }
}

async function handleServerStatus(projectPath, ws) {
  try {
    const serverInfo = runningServers.get(projectPath);
    
    if (serverInfo) {
      ws.send(JSON.stringify({
        type: 'server:status',
        projectPath,
        status: 'running',
        url: serverInfo.url,
        script: serverInfo.script,
        startTime: serverInfo.startTime
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'server:status',
        projectPath,
        status: 'stopped'
      }));
    }
  } catch (error) {
    console.error('❌ Error getting server status:', error);
    ws.send(JSON.stringify({
      type: 'server:error',
      projectPath,
      error: error.message
    }));
  }
}

// Audio transcription endpoint
app.post('/api/transcribe', authenticateToken, async (req, res) => {
  try {
    const multer = (await import('multer')).default;
    const upload = multer({ storage: multer.memoryStorage() });
    
    // Handle multipart form data
    upload.single('audio')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to process audio file' });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }
      
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' });
      }
      
      try {
        // Create form data for OpenAI
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');
        formData.append('language', 'en');
        
        // Make request to OpenAI
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...formData.getHeaders()
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
        }
        
        const data = await response.json();
        let transcribedText = data.text || '';
        
        // Check if enhancement mode is enabled
        const mode = req.body.mode || 'default';
        
        // If no transcribed text, return empty
        if (!transcribedText) {
          return res.json({ text: '' });
        }
        
        // If default mode, return transcribed text without enhancement
        if (mode === 'default') {
          return res.json({ text: transcribedText });
        }
        
        // Handle different enhancement modes
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey });
          
          let prompt, systemMessage, temperature = 0.7, maxTokens = 800;
          
          switch (mode) {
            case 'prompt':
              systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
              prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
              break;
              
            case 'vibe':
            case 'instructions':
            case 'architect':
              systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
              temperature = 0.5; // Lower temperature for more controlled output
              prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
              break;
              
            default:
              // No enhancement needed
              break;
          }
          
          // Only make GPT call if we have a prompt
          if (prompt) {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: prompt }
              ],
              temperature: temperature,
              max_tokens: maxTokens
            });
            
            transcribedText = completion.choices[0].message.content || transcribedText;
          }
          
        } catch (gptError) {
          console.error('GPT processing error:', gptError);
          // Fall back to original transcription if GPT fails
        }
        
        res.json({ text: transcribedText });
        
      } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.error('Endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Image upload endpoint
app.post('/api/projects/:projectName/upload-images', authenticateToken, async (req, res) => {
  try {
    const multer = (await import('multer')).default;
    const path = (await import('path')).default;
    const fs = (await import('fs')).promises;
    const os = (await import('os')).default;
    
    // Configure multer for image uploads
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'claude-ui-uploads', String(req.user.id));
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + sanitizedName);
      }
    });
    
    const fileFilter = (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
      }
    };
    
    const upload = multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 5
      }
    });
    
    // Handle multipart form data
    upload.array('images', 5)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image files provided' });
      }
      
      try {
        // Process uploaded images
        const processedImages = await Promise.all(
          req.files.map(async (file) => {
            // Read file and convert to base64
            const buffer = await fs.readFile(file.path);
            const base64 = buffer.toString('base64');
            const mimeType = file.mimetype;
            
            // Clean up temp file immediately
            await fs.unlink(file.path);
            
            return {
              name: file.originalname,
              data: `data:${mimeType};base64,${base64}`,
              size: file.size,
              mimeType: mimeType
            };
          })
        );
        
        res.json({ images: processedImages });
      } catch (error) {
        console.error('Error processing images:', error);
        // Clean up any remaining files
        await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
        res.status(500).json({ error: 'Failed to process images' });
      }
    });
  } catch (error) {
    console.error('Error in image upload endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Helper function to convert permissions to rwx format
function permToRwx(perm) {
  const r = perm & 4 ? 'r' : '-';
  const w = perm & 2 ? 'w' : '-';
  const x = perm & 1 ? 'x' : '-';
  return r + w + x;
}

async function getFileTree(dirPath, maxDepth = 3, currentDepth = 0, showHidden = true) {
  // Using fs from import
  const items = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Debug: log all entries including hidden files
   
      
      // Skip only heavy build directories
      if (entry.name === 'node_modules' || 
          entry.name === 'dist' || 
          entry.name === 'build') continue;
      
      const itemPath = path.join(dirPath, entry.name);
      const item = {
        name: entry.name,
        path: itemPath,
        type: entry.isDirectory() ? 'directory' : 'file'
      };
      
      // Get file stats for additional metadata
      try {
        const stats = await fs.stat(itemPath);
        item.size = stats.size;
        item.modified = stats.mtime.toISOString();
        
        // Convert permissions to rwx format
        const mode = stats.mode;
        const ownerPerm = (mode >> 6) & 7;
        const groupPerm = (mode >> 3) & 7;
        const otherPerm = mode & 7;
        item.permissions = ((mode >> 6) & 7).toString() + ((mode >> 3) & 7).toString() + (mode & 7).toString();
        item.permissionsRwx = permToRwx(ownerPerm) + permToRwx(groupPerm) + permToRwx(otherPerm);
      } catch (statError) {
        // If stat fails, provide default values
        item.size = 0;
        item.modified = null;
        item.permissions = '000';
        item.permissionsRwx = '---------';
      }
      
      if (entry.isDirectory() && currentDepth < maxDepth) {
        // Recursively get subdirectories but limit depth
        try {
          // Check if we can access the directory before trying to read it
          await fs.access(item.path, fs.constants.R_OK);
          item.children = await getFileTree(item.path, maxDepth, currentDepth + 1, showHidden);
        } catch (e) {
          // Silently skip directories we can't access (permission denied, etc.)
          item.children = [];
        }
      }
      
      items.push(item);
    }
  } catch (error) {
    // Only log non-permission errors to avoid spam
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error('Error reading directory:', error);
    }
  }
  
  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    
    // For files, sort by modification time (newest first)
    if (a.type === 'file' && b.type === 'file') {
      const aTime = new Date(a.modified || 0).getTime();
      const bTime = new Date(b.modified || 0).getTime();
      return bTime - aTime; // newest first
    }
    
    // For directories, sort by name
    return a.name.localeCompare(b.name);
  });
}

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize authentication database
    await initializeDatabase();
    console.log('✅ Database initialization skipped (testing)');
    
    server.listen(PORT, async () => {
      console.log(`Claude Code UI server running on http://localhost:${PORT}`);
      
      // Start watching the projects folder for changes
      await setupProjectsWatcher(); // Re-enabled with better-sqlite3
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
