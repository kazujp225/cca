import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';

// Cache for extracted project directories
const projectDirectoryCache = new Map();
let cacheTimestamp = Date.now();

// Clear cache when needed (called when project files change)
function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
  cacheTimestamp = Date.now();
}

// Load project configuration file
async function loadProjectConfig() {
  const configPath = path.join(process.env.HOME, '.claude', 'project-config.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // Return empty config if file doesn't exist
    return {};
  }
}

// Save project configuration file
async function saveProjectConfig(config) {
  const configPath = path.join(process.env.HOME, '.claude', 'project-config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Generate better display name from path
async function generateDisplayName(projectName, actualProjectDir = null) {
  // Use actual project directory if provided, otherwise decode from project name
  let projectPath = actualProjectDir || projectName.replace(/-/g, '/');
  
  // Try to read package.json from the project path
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);
    
    // Return the name from package.json if it exists
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // Fall back to path-based naming if package.json doesn't exist or can't be read
  }
  
  // If it starts with /, it's an absolute path
  if (projectPath.startsWith('/')) {
    const parts = projectPath.split('/').filter(Boolean);
    if (parts.length > 3) {
      // Show last 2 folders with ellipsis: "...projects/myapp"
      return `.../${parts.slice(-2).join('/')}`;
    } else {
      // Show full path if short: "/home/user"
      return projectPath;
    }
  }
  
  return projectPath;
}

// Extract the actual project directory from JSONL sessions (with caching)
async function extractProjectDirectory(projectName) {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName);
  }
  
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  const cwdCounts = new Map();
  let latestTimestamp = 0;
  let latestCwd = null;
  let extractedPath;
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      // Fall back to decoded project name if no sessions
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      // OPTIMIZATION: Only read the first 50 lines from the most recent 3 files
      // This drastically reduces processing time while still capturing the project directory
      const sortedFiles = jsonlFiles
        .map(file => {
          const filePath = path.join(projectDir, file);
          const stats = fsSync.statSync(filePath);
          return { file, mtime: stats.mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 3); // Only check 3 most recent files
      
      for (const { file } of sortedFiles) {
        const jsonlFile = path.join(projectDir, file);
        const fileStream = fsSync.createReadStream(jsonlFile);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        
        let linesRead = 0;
        const maxLinesToRead = 50; // OPTIMIZATION: Only read first 50 lines per file
        
        for await (const line of rl) {
          if (++linesRead > maxLinesToRead) {
            break; // Stop reading after 50 lines
          }
          
          const trimmedLine = line.trim();
          if (trimmedLine && trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
            try {
              const entry = JSON.parse(trimmedLine);
              
              if (entry.cwd) {
                // Count occurrences of each cwd
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1);
                
                // Track the most recent cwd
                const timestamp = new Date(entry.timestamp || 0).getTime();
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp;
                  latestCwd = entry.cwd;
                }
              }
            } catch (parseError) {
              // Skip malformed lines
            }
          }
        }
        
        rl.close();
        fileStream.destroy();
      }
      
      // Determine the best cwd to use
      if (cwdCounts.size === 0) {
        // No cwd found, fall back to decoded project name
        extractedPath = projectName.replace(/-/g, '/');
      } else if (cwdCounts.size === 1) {
        // Only one cwd, use it
        extractedPath = Array.from(cwdCounts.keys())[0];
      } else {
        // Multiple cwd values - prefer the most recent one if it has reasonable usage
        const mostRecentCount = cwdCounts.get(latestCwd) || 0;
        const maxCount = Math.max(...cwdCounts.values());
        
        // Use most recent if it has at least 25% of the max count
        if (mostRecentCount >= maxCount * 0.25) {
          extractedPath = latestCwd;
        } else {
          // Otherwise use the most frequently used cwd
          for (const [cwd, count] of cwdCounts.entries()) {
            if (count === maxCount) {
              extractedPath = cwd;
              break;
            }
          }
        }
        
        // Fallback (shouldn't reach here)
        if (!extractedPath) {
          extractedPath = latestCwd || projectName.replace(/-/g, '/');
        }
      }
    }
    
    // Cache the result
    projectDirectoryCache.set(projectName, extractedPath);
    
    return extractedPath;
    
  } catch (error) {
    console.error(`Error extracting project directory for ${projectName}:`, error);
    // Fall back to decoded project name
    extractedPath = projectName.replace(/-/g, '/');
    
    // Cache the fallback result too
    projectDirectoryCache.set(projectName, extractedPath);
    
    return extractedPath;
  }
}

async function getProjects() {
  const claudeDir = path.join(process.env.HOME, '.claude', 'projects');
  const config = await loadProjectConfig();
  const projects = [];
  const existingProjects = new Set();
  
  try {
    // First, get existing projects from the file system
    const entries = await fs.readdir(claudeDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        existingProjects.add(entry.name);
        const projectPath = path.join(claudeDir, entry.name);
        
        // PERFORMANCE OPTIMIZATION: Skip expensive directory extraction for initial load
        // Use simple decode of project name instead
        const actualProjectDir = entry.name.replace(/-/g, '/');
        
        // Get display name from config or use simple decode
        const customName = config[entry.name]?.displayName;
        const autoDisplayName = customName || actualProjectDir;
        const fullPath = actualProjectDir;
        
        // PERFORMANCE OPTIMIZATION: Use current timestamp if creation time not in config
        const createdAt = config[entry.name]?.createdAt || new Date().toISOString();
        
        const project = {
          name: entry.name,
          path: actualProjectDir,
          displayName: customName || autoDisplayName,
          fullPath: fullPath,
          isCustomName: !!customName,
          createdAt: createdAt,
          sessions: []
        };
        
        // PERFORMANCE OPTIMIZATION: Only get session count for initial load
        // Full session parsing will be done when project is selected
        try {
          const projectPath = path.join(claudeDir, entry.name);
          const files = await fs.readdir(projectPath);
          const sessionCount = files.filter(file => file.endsWith('.jsonl')).length;
          
          project.sessions = []; // Empty for performance - loaded on demand
          project.sessionMeta = {
            hasMore: sessionCount > 5,
            total: sessionCount
          };
        } catch (e) {
          console.warn(`Could not count sessions for project ${entry.name}:`, e.message);
          project.sessions = [];
          project.sessionMeta = { hasMore: false, total: 0 };
        }
        
        projects.push(project);
      }
    }
  } catch (error) {
    console.error('Error reading projects directory:', error);
  }
  
  // Add manually configured projects that don't exist as folders yet
  for (const [projectName, projectConfig] of Object.entries(config)) {
    if (!existingProjects.has(projectName) && projectConfig.manuallyAdded) {
      // Use the original path if available, otherwise extract from potential sessions
      let actualProjectDir = projectConfig.originalPath;
      
      if (!actualProjectDir) {
        try {
          actualProjectDir = await extractProjectDirectory(projectName);
        } catch (error) {
          // Fall back to decoded project name
          actualProjectDir = projectName.replace(/-/g, '/');
        }
      }
      
              const project = {
          name: projectName,
          path: actualProjectDir,
          displayName: projectConfig.displayName || await generateDisplayName(projectName, actualProjectDir),
          fullPath: actualProjectDir,
          isCustomName: !!projectConfig.displayName,
          isManuallyAdded: true,
          createdAt: projectConfig.createdAt || new Date().toISOString(), // Use current time if not set
          sessions: []
        };
      
      projects.push(project);
    }
  }
  
  return projects;
}

async function getSessions(projectName, limit = 5, offset = 0) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      return { sessions: [], hasMore: false, total: 0 };
    }
    
    // For performance, get file stats to sort by modification time
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = path.join(projectDir, file);
        const stats = await fs.stat(filePath);
        return { file, mtime: stats.mtime };
      })
    );
    
    // Sort files by modification time (newest first) for better performance
    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    
    const allSessions = new Map();
    let processedCount = 0;
    
    // Process files in order of modification time
    for (const { file } of filesWithStats) {
      const jsonlFile = path.join(projectDir, file);
      const sessions = await parseJsonlSessions(jsonlFile);
      
      // Merge sessions, avoiding duplicates by session ID
      sessions.forEach(session => {
        if (!allSessions.has(session.id)) {
          allSessions.set(session.id, session);
        }
      });
      
      processedCount++;
      
      // Early exit optimization: if we have enough sessions and processed recent files
      if (allSessions.size >= (limit + offset) * 2 && processedCount >= Math.min(3, filesWithStats.length)) {
        break;
      }
    }
    
    // Convert to array and sort by last activity
    const sortedSessions = Array.from(allSessions.values()).sort((a, b) => 
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
    
    const total = sortedSessions.length;
    const paginatedSessions = sortedSessions.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    
    return {
      sessions: paginatedSessions,
      hasMore,
      total,
      offset,
      limit
    };
  } catch (error) {
    console.error(`Error reading sessions for project ${projectName}:`, error);
    return { sessions: [], hasMore: false, total: 0 };
  }
}

async function parseJsonlSessions(filePath) {
  const sessions = new Map();
  
  try {
    // PERFORMANCE OPTIMIZATION: For initial project loading, only read first 100 lines
    // This captures session metadata without processing entire conversation history
    const fileStream = fsSync.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    // console.log(`[JSONL Parser] Reading file: ${filePath}`);
    let lineCount = 0;
    let errorCount = 0;
    const maxLinesToProcess = 100; // OPTIMIZATION: Only read first 100 lines for project listing
    
    for await (const line of rl) {
      if (++lineCount > maxLinesToProcess) {
        break; // Stop early to improve performance
      }
      
      const trimmedLine = line.trim();
      
      // Skip empty lines and lines that don't look like valid JSON
      if (!trimmedLine || !trimmedLine.startsWith('{') || !trimmedLine.endsWith('}')) {
        // Count non-JSON lines for debugging
        if (trimmedLine && !trimmedLine.startsWith('{')) {
          errorCount++;
          if (process.env.NODE_ENV === 'development' && errorCount <= 3) {
            console.warn(`[JSONL Parser] Skipping non-JSON line: ${trimmedLine.substring(0, 50)}...`);
          }
        }
        continue;
      }
      
      try {
        const entry = JSON.parse(trimmedLine);
        
        // Validate entry structure - must have sessionId
        if (!entry || typeof entry !== 'object' || !entry.sessionId) {
          continue;
        }
        
        if (!sessions.has(entry.sessionId)) {
          sessions.set(entry.sessionId, {
            id: entry.sessionId,
            summary: 'New Session',
            messageCount: 0,
            lastActivity: new Date(),
            cwd: entry.cwd || ''
          });
        }
        
        const session = sessions.get(entry.sessionId);
        
        // Update summary if this is a summary entry
        if (entry.type === 'summary' && entry.summary) {
          session.summary = entry.summary;
        } else if (entry.message?.role === 'user' && entry.message?.content && session.summary === 'New Session') {
          // Use first user message as summary if no summary entry exists
          const content = entry.message.content;
          if (typeof content === 'string' && content.length > 0) {
            // Skip command messages that start with <command-name>
            if (!content.startsWith('<command-name>')) {
              session.summary = content.length > 50 ? content.substring(0, 50) + '...' : content;
            }
          }
        }
        
        // Count messages instead of storing them all
        session.messageCount = (session.messageCount || 0) + 1;
        
        // Update last activity
        if (entry.timestamp) {
          session.lastActivity = new Date(entry.timestamp);
        }
      } catch (parseError) {
        errorCount++;
        
        // Only log first few errors to avoid spam
        if (process.env.NODE_ENV === 'development' && errorCount <= 3) {
          console.warn(`[JSONL Parser] JSON parse error on line ${lineCount}: ${parseError.message}`);
          console.warn(`[JSONL Parser] Line preview: ${trimmedLine.substring(0, 100)}...`);
        }
        
        // Skip this line and continue processing
        continue;
      }
    }
    
    if (errorCount > 0) {
      console.warn(`[JSONL Parser] Total parse errors: ${errorCount} out of ${lineCount} lines`);
    }
    
    // console.log(`[JSONL Parser] Processed ${lineCount} lines, found ${sessions.size} sessions`);
  } catch (error) {
    console.error('Error reading JSONL file:', error);
  }
  
  // Convert Map to Array and sort by last activity
  return Array.from(sessions.values()).sort((a, b) => 
    new Date(b.lastActivity) - new Date(a.lastActivity)
  );
}

// Get messages for a specific session
async function getSessionMessages(projectName, sessionId) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      return [];
    }
    
    const messages = [];
    
    // Process all JSONL files to find messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = path.join(projectDir, file);
      // Explicitly set encoding to utf8 for proper handling of Japanese characters
      const fileStream = fsSync.createReadStream(jsonlFile, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineCount = 0;
      for await (const line of rl) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
          lineCount++;
          try {
            // Parse the JSON without cleaning to preserve original content
            const entry = JSON.parse(trimmedLine);
            
            // Validate entry structure
            if (entry && typeof entry === 'object' && entry.sessionId === sessionId) {
              messages.push(entry);
            }
          } catch (parseError) {
            // Skip broken lines but log them for debugging
            console.warn(`[JSONL Parser] Skipping broken line ${lineCount} in ${file}:`, parseError.message);
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[JSONL Parser] Line preview:`, trimmedLine.substring(0, 100) + '...');
            }
          }
        } else if (trimmedLine && !trimmedLine.startsWith('{')) {
          // This is likely a continuation of a broken JSON line, skip it
          console.warn(`[JSONL Parser] Skipping non-JSON line ${lineCount} in ${file}`);
        }
      }
    }
    
    // Sort messages by timestamp
    return messages.sort((a, b) => 
      new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );
  } catch (error) {
    console.error(`Error reading messages for session ${sessionId}:`, error);
    return [];
  }
}

// Rename a project's display name
async function renameProject(projectName, newDisplayName) {
  const config = await loadProjectConfig();
  
  if (!newDisplayName || newDisplayName.trim() === '') {
    // Remove custom name if empty, will fall back to auto-generated
    delete config[projectName];
  } else {
    // Set custom display name
    config[projectName] = {
      displayName: newDisplayName.trim()
    };
  }
  
  await saveProjectConfig(config);
  return true;
}

// Delete a session from a project
async function deleteSession(projectName, sessionId) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      throw new Error('No session files found for this project');
    }
    
    // Check all JSONL files to find which one contains the session
    for (const file of jsonlFiles) {
      const jsonlFile = path.join(projectDir, file);
      const content = await fs.readFile(jsonlFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Check if this file contains the session
      const hasSession = lines.some(line => {
        try {
          const data = JSON.parse(line);
          return data.sessionId === sessionId;
        } catch {
          return false;
        }
      });
      
      if (hasSession) {
        // Filter out all entries for this session
        const filteredLines = lines.filter(line => {
          try {
            const data = JSON.parse(line);
            return data.sessionId !== sessionId;
          } catch {
            return true; // Keep malformed lines
          }
        });
        
        // Write back the filtered content
        await fs.writeFile(jsonlFile, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''));
        return true;
      }
    }
    
    throw new Error(`Session ${sessionId} not found in any files`);
  } catch (error) {
    console.error(`Error deleting session ${sessionId} from project ${projectName}:`, error);
    throw error;
  }
}

// Check if a project is empty (has no sessions)
async function isProjectEmpty(projectName) {
  try {
    const sessionsResult = await getSessions(projectName, 1, 0);
    return sessionsResult.total === 0;
  } catch (error) {
    console.error(`Error checking if project ${projectName} is empty:`, error);
    return false;
  }
}

// Delete an empty project
async function deleteProject(projectName) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  
  try {
    // First check if the project is empty
    const isEmpty = await isProjectEmpty(projectName);
    if (!isEmpty) {
      throw new Error('Cannot delete project with existing sessions');
    }
    
    // Remove the project directory
    await fs.rm(projectDir, { recursive: true, force: true });
    
    // Remove from project config
    const config = await loadProjectConfig();
    delete config[projectName];
    await saveProjectConfig(config);
    
    return true;
  } catch (error) {
    console.error(`Error deleting project ${projectName}:`, error);
    throw error;
  }
}

// Add a project manually to the config (without creating folders)
async function addProjectManually(projectPath, displayName = null, fileName = null, folderName = null) {
  // Expand ~ to home directory first
  const expandedPath = projectPath.replace(/^~/, process.env.HOME || require('os').homedir());
  const absolutePath = path.resolve(expandedPath);
  
  try {
    // Check if the path exists
    await fs.access(absolutePath);
  } catch (error) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }
  
  // Generate project name (encode path for use as directory name)
  const projectName = absolutePath.replace(/\//g, '-');
  
  // Check if project already exists in config or as a folder
  const config = await loadProjectConfig();
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  
  try {
    await fs.access(projectDir);
    throw new Error(`Project already exists for path: ${absolutePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  if (config[projectName]) {
    throw new Error(`Project already configured for path: ${absolutePath}`);
  }
  
  // Create initial file if fileName is provided
  if (fileName && fileName.trim()) {
    const filePath = path.join(absolutePath, fileName.trim());
    try {
      // Check if file already exists
      await fs.access(filePath);
      console.log(`File already exists: ${filePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create the file with basic content based on extension
        const extension = path.extname(fileName.trim()).toLowerCase();
        let content = '';
        
        switch (extension) {
          case '.py':
            content = '# Python script\n\nif __name__ == "__main__":\n    print("Hello, World!")\n';
            break;
          case '.js':
            content = '// JavaScript file\n\nconsole.log("Hello, World!");\n';
            break;
          case '.html':
            content = '<!DOCTYPE html>\n<html>\n<head>\n    <title>New Project</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>\n';
            break;
          case '.md':
            content = '# New Project\n\nThis is a new project created with Claude Code UI.\n';
            break;
          case '.txt':
            content = 'Hello, World!\n';
            break;
          default:
            content = '// New file\n';
        }
        
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`Created initial file: ${filePath}`);
      } else {
        throw error;
      }
    }
  }
  
  // Add to config as manually added project
  config[projectName] = {
    manuallyAdded: true,
    originalPath: absolutePath,
    createdAt: new Date().toISOString()
  };
  
  if (displayName) {
    config[projectName].displayName = displayName;
  }
  
  if (folderName) {
    config[projectName].folderName = folderName;
  }
  
  await saveProjectConfig(config);
  
  
  return {
    name: projectName,
    path: absolutePath,
    fullPath: absolutePath,
    displayName: displayName || await generateDisplayName(projectName, absolutePath),
    isManuallyAdded: true,
    createdAt: new Date().toISOString(),
    sessions: []
  };
}


export {
  getProjects,
  getSessions,
  getSessionMessages,
  parseJsonlSessions,
  renameProject,
  deleteSession,
  isProjectEmpty,
  deleteProject,
  addProjectManually,
  loadProjectConfig,
  saveProjectConfig,
  extractProjectDirectory,
  clearProjectDirectoryCache
};