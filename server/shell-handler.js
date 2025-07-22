import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Execute shell command
export async function executeShellCommand(req, res) {
  try {
    const { command, projectPath, currentPath } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const workingDir = currentPath || projectPath || process.cwd();
    
    // Security: Enhanced command filtering
    const dangerousCommands = [
      'rm -rf /', 'format', 'del /f', 'sudo', 'su', 'chmod 777', 'chown',
      'passwd', 'fdisk', 'mkfs', 'dd if=', 'killall', 'pkill', 'halt',
      'reboot', 'shutdown', 'init', 'systemctl', 'service', 'mount',
      'umount', 'crontab', 'at ', 'batch', 'nohup', 'screen', 'tmux'
    ];
    
    const dangerousPatterns = [
      /rm\s+.*-rf?\s+[\/~]/, // rm -rf / or rm -rf ~
      />\s*\/dev\//, // Redirect to device files
      /\|\s*dd\s+/, // Piped dd commands
      /curl.*\|\s*sh/, // Curl piped to shell
      /wget.*\|\s*sh/, // Wget piped to shell
      /eval\s*\$/, // Eval with variables
      /sudo\s+/, // Any sudo usage
      /su\s+/, // Any su usage
    ];
    
    if (dangerousCommands.some(cmd => command.toLowerCase().includes(cmd.toLowerCase()))) {
      return res.status(403).json({ error: 'Command not allowed for security reasons' });
    }
    
    if (dangerousPatterns.some(pattern => pattern.test(command))) {
      return res.status(403).json({ error: 'Command pattern not allowed for security reasons' });
    }
    
    try {
      // Create clean environment without Claude Code UI specific variables
      const cleanEnv = { ...process.env };
      delete cleanEnv.PORT; // Remove PORT to allow Next.js to find available port
      delete cleanEnv.VITE_PORT;
      delete cleanEnv.CLAUDE_CODE_SSE_PORT;
      
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
      let newPath = workingDir;
      if (command.trim().startsWith('cd ')) {
        const targetDir = command.trim().slice(3).trim();
        if (targetDir) {
          newPath = path.resolve(workingDir, targetDir);
          try {
            await fs.access(newPath);
          } catch {
            newPath = workingDir;
          }
        }
      }
      
      res.json({
        stdout,
        stderr,
        currentPath: newPath
      });
    } catch (error) {
      res.json({
        stdout: '',
        stderr: error.message || 'Command failed',
        exitCode: error.code || 1
      });
    }
  } catch (error) {
    console.error('Shell command error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Execute ultrathink command
export async function executeUltrathink(req, res) {
  try {
    const { command, projectPath, currentPath } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const workingDir = currentPath || projectPath || process.cwd();
    
    // Parse ultrathink command
    const parts = command.trim().split(' ');
    const action = parts[0];
    
    let output = '';
    
    switch (action) {
      case 'create':
        output = await handleCreate(parts.slice(1), workingDir);
        break;
        
      case 'generate':
        output = await handleGenerate(parts.slice(1), workingDir);
        break;
        
      case 'analyze':
        output = await handleAnalyze(parts.slice(1), workingDir);
        break;
        
      case 'refactor':
        output = await handleRefactor(parts.slice(1), workingDir);
        break;
        
      case 'test':
        output = await handleTest(parts.slice(1), workingDir);
        break;
        
      case 'help':
        output = getUltrathinkHelp();
        break;
        
      default:
        output = `Unknown ultrathink command: ${action}\nType "ultrathink help" for available commands.`;
    }
    
    res.json({ output });
  } catch (error) {
    console.error('Ultrathink error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Handle create command
async function handleCreate(args, workingDir) {
  if (args.length < 3) {
    return 'Usage: ultrathink create <type> <name>\nExample: ultrathink create react component Button';
  }
  
  const [framework, type, name] = args;
  
  if (framework === 'react' && type === 'component') {
    const componentContent = `import React from 'react';

const ${name} = ({ children, ...props }) => {
  return (
    <div className="${name.toLowerCase()}" {...props}>
      {children}
    </div>
  );
};

export default ${name};`;
    
    const filePath = path.join(workingDir, `${name}.jsx`);
    await fs.writeFile(filePath, componentContent);
    return `Created React component: ${name}.jsx`;
  }
  
  if (framework === 'vue' && type === 'component') {
    const componentContent = `<template>
  <div class="${name.toLowerCase()}">
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: '${name}',
  props: {},
  data() {
    return {};
  }
};
</script>

<style scoped>
.${name.toLowerCase()} {
  /* Add styles here */
}
</style>`;
    
    const filePath = path.join(workingDir, `${name}.vue`);
    await fs.writeFile(filePath, componentContent);
    return `Created Vue component: ${name}.vue`;
  }
  
  return `Unsupported create command: ${framework} ${type}`;
}

// Handle generate command
async function handleGenerate(args, workingDir) {
  if (args.length < 1) {
    return 'Usage: ultrathink generate <type>\nExample: ultrathink generate readme';
  }
  
  const type = args[0];
  
  if (type === 'readme') {
    const readmeContent = `# Project Title

## Description
Brief description of your project.

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`bash
npm start
\`\`\`

## Contributing
Pull requests are welcome.

## License
MIT`;
    
    const filePath = path.join(workingDir, 'README.md');
    await fs.writeFile(filePath, readmeContent);
    return 'Generated README.md';
  }
  
  if (type === 'gitignore') {
    const gitignoreContent = `# Dependencies
node_modules/

# Build output
dist/
build/

# Environment files
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*`;
    
    const filePath = path.join(workingDir, '.gitignore');
    await fs.writeFile(filePath, gitignoreContent);
    return 'Generated .gitignore';
  }
  
  return `Unsupported generate type: ${type}`;
}

// Handle analyze command
async function handleAnalyze(args, workingDir) {
  if (args.length < 1) {
    return 'Usage: ultrathink analyze <file>\nExample: ultrathink analyze package.json';
  }
  
  const fileName = args[0];
  const filePath = path.join(workingDir, fileName);
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    if (fileName === 'package.json') {
      const pkg = JSON.parse(content);
      let output = `Package: ${pkg.name} v${pkg.version}\n`;
      output += `Description: ${pkg.description || 'N/A'}\n`;
      output += `\nDependencies: ${Object.keys(pkg.dependencies || {}).length}\n`;
      output += `Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).length}\n`;
      
      if (pkg.scripts) {
        output += `\nAvailable scripts:\n`;
        Object.keys(pkg.scripts).forEach(script => {
          output += `  npm run ${script}\n`;
        });
      }
      
      return output;
    }
    
    // Generic file analysis
    const lines = content.split('\n').length;
    const chars = content.length;
    return `File: ${fileName}\nLines: ${lines}\nCharacters: ${chars}`;
  } catch (error) {
    return `Error analyzing file: ${error.message}`;
  }
}

// Handle refactor command
async function handleRefactor(args, workingDir) {
  return 'Refactor command is coming soon!\nThis will allow intelligent code refactoring.';
}

// Handle test command
async function handleTest(args, workingDir) {
  try {
    // Check for test runner
    const packagePath = path.join(workingDir, 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(packageContent);
    
    if (pkg.scripts && pkg.scripts.test) {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: workingDir,
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      return stdout + (stderr ? `\n${stderr}` : '');
    }
    
    return 'No test script found in package.json';
  } catch (error) {
    return `Test command failed: ${error.message}`;
  }
}

// Get ultrathink help
function getUltrathinkHelp() {
  return `Ultrathink Commands:

create <framework> <type> <name>
  Create new files with boilerplate
  Examples:
    ultrathink create react component Button
    ultrathink create vue component Card

generate <type>
  Generate common files
  Examples:
    ultrathink generate readme
    ultrathink generate gitignore

analyze <file>
  Analyze file contents
  Example:
    ultrathink analyze package.json

refactor <file> <pattern>
  Refactor code (coming soon)

test [args]
  Run project tests

help
  Show this help message`;
}