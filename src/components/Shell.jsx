import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getWebSocketUrl } from '../lib/utils';

// CSS to remove xterm focus outline
const xtermStyles = `
  .xterm .xterm-screen {
    outline: none !important;
  }
  .xterm:focus .xterm-screen {
    outline: none !important;
  }
  .xterm-screen:focus {
    outline: none !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = xtermStyles;
  document.head.appendChild(styleSheet);
}

function Shell({ selectedProject, selectedSession, isActive }) {
  const terminalRef = useRef(null);
  const terminal = useRef(null);
  const fitAddon = useRef(null);
  const ws = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  // Initialize WebSocket connection
  const connectWebSocket = () => {
    if (!selectedProject) return;
    
    const token = localStorage.getItem('auth-token');
    if (!token) {
      terminal.current?.write('\x1b[31mAuthentication required. Please login.\x1b[0m\r\n');
      return;
    }
    
    // Create WebSocket connection
    const wsBaseUrl = getWebSocketUrl();
    const wsUrl = `${wsBaseUrl}/shell?token=${encodeURIComponent(token)}`;
    
    console.log('Connecting to shell WebSocket:', wsUrl);
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log('Shell WebSocket connected');
      setIsConnected(true);
      terminal.current?.write('\x1b[32m✓ Connected\x1b[0m\r\n');
      showPrompt();
    };
    
    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'shell:output') {
          // Display stdout
          if (data.stdout) {
            terminal.current?.write(data.stdout.replace(/\n/g, '\r\n'));
          }
          
          // Display stderr in red
          if (data.stderr) {
            terminal.current?.write(`\x1b[31m${data.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
          }
          
          // Update current path if changed
          if (data.currentPath && data.currentPath !== currentPath) {
            setCurrentPath(data.currentPath);
          }
          
          // Show prompt after command completes
          showPrompt();
        } else if (data.type === 'shell:error') {
          terminal.current?.write(`\x1b[31mError: ${data.error}\x1b[0m\r\n`);
          showPrompt();
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.current.onerror = (error) => {
      console.error('Shell WebSocket error:', error);
      terminal.current?.write('\x1b[31mConnection error\x1b[0m\r\n');
      setIsConnected(false);
    };
    
    ws.current.onclose = () => {
      console.log('Shell WebSocket disconnected');
      terminal.current?.write('\r\n\x1b[33mDisconnected\x1b[0m\r\n');
      setIsConnected(false);
      ws.current = null;
    };
  };
  
  // Send command to server
  const sendCommand = (command) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      terminal.current?.write('\x1b[31mNot connected to server\x1b[0m\r\n');
      showPrompt();
      return;
    }
    
    ws.current.send(JSON.stringify({
      type: 'shell:command',
      command,
      projectPath: selectedProject?.fullPath
    }));
  };
  
  // Show prompt
  const showPrompt = () => {
    if (!terminal.current) return;
    const projectName = selectedProject?.displayName || 'shell';
    const path = currentPath || selectedProject?.fullPath || '~';
    const promptPath = path.replace(selectedProject?.fullPath || '', '~');
    terminal.current.write(`\r\n\x1b[32m${projectName}\x1b[0m:\x1b[34m${promptPath}\x1b[0m$ `);
  };
  
  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || !selectedProject) return;
    if (terminal.current) return;
    
    // Create terminal
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, Menlo, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e1e5e9',
        cursor: '#00d9ff',
        cursorAccent: '#0a0a0a',
        selection: '#3b4252',
        black: '#2e3440',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#5e81ac',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#d08770',
        brightGreen: '#8fbcbb',
        brightYellow: '#d8dee9',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#88c0d0',
        brightWhite: '#eceff4'
      }
    });
    
    fitAddon.current = new FitAddon();
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.open(terminalRef.current);
    
    // Initialize
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
      terminal.current.focus();
      terminal.current.write('Welcome to Ultrathink Shell\r\n');
      terminal.current.write('Connecting to server...\r\n');
      setIsInitialized(true);
      connectWebSocket();
    }, 50);
    
    // Handle input
    let inputBuffer = '';
    terminal.current.onData((data) => {
      const code = data.charCodeAt(0);
      
      if (code === 127) { // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          terminal.current.write('\b \b');
        }
      } else if (code === 13) { // Enter
        terminal.current.write('\r\n');
        if (inputBuffer.trim()) {
          // Handle local commands
          if (inputBuffer.trim() === 'clear') {
            terminal.current.clear();
            showPrompt();
          } else if (inputBuffer.trim() === 'help') {
            terminal.current.write('Available commands:\r\n');
            terminal.current.write('  help     - Show this help message\r\n');
            terminal.current.write('  clear    - Clear the terminal\r\n');
            terminal.current.write('  exit     - Close the connection\r\n');
            terminal.current.write('  Any other command will be executed on the server\r\n');
            showPrompt();
          } else if (inputBuffer.trim() === 'exit') {
            ws.current?.close();
          } else {
            // Send command to server
            sendCommand(inputBuffer);
          }
        } else {
          showPrompt();
        }
        inputBuffer = '';
      } else if (code === 3) { // Ctrl+C
        terminal.current.write('^C\r\n');
        inputBuffer = '';
        showPrompt();
      } else if (code >= 32) { // Printable characters
        inputBuffer += data;
        terminal.current.write(data);
      }
    });
    
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon.current && terminal.current) {
        setTimeout(() => {
          fitAddon.current.fit();
        }, 50);
      }
    });
    
    resizeObserver.observe(terminalRef.current);
    
    return () => {
      resizeObserver.disconnect();
      ws.current?.close();
      if (terminal.current) {
        terminal.current.dispose();
        terminal.current = null;
      }
    };
  }, [selectedProject]);
  
  // Reconnect when project changes
  useEffect(() => {
    if (selectedProject && terminal.current && isInitialized) {
      ws.current?.close();
      setCurrentPath('');
      terminal.current.clear();
      terminal.current.write('Reconnecting...\r\n');
      connectWebSocket();
    }
  }, [selectedProject?.fullPath]);
  
  // Fit terminal when tab becomes active
  useEffect(() => {
    if (!isActive || !isInitialized) return;
    
    setTimeout(() => {
      if (fitAddon.current && terminal.current) {
        fitAddon.current.fit();
        terminal.current.focus();
      }
    }, 100);
  }, [isActive, isInitialized]);
  
  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">プロジェクトを選択してください</h3>
          <p>プロジェクトを選択して、Ultrathinkシェルを開きます</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950 w-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-red-500 shadow-lg shadow-red-500/50'}`} />
                <span className={`text-sm font-medium ${isConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="hidden sm:flex items-center space-x-2 text-gray-600 dark:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium">{selectedProject.displayName}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {!isConnected && (
                <button
                  onClick={connectWebSocket}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Terminal Container */}
      <div className="flex-1 bg-white dark:bg-gray-950 overflow-hidden relative">
        <div className="h-full bg-gray-950 dark:bg-black rounded-lg mx-4 mb-4 shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="bg-gray-800 dark:bg-gray-900 px-4 py-2 border-b border-gray-700 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <div className="flex-1 text-center">
                <span className="text-sm font-medium text-gray-300">
                  Ultrathink Terminal
                </span>
              </div>
            </div>
          </div>
          
          <div className="h-full bg-gray-950 dark:bg-black relative">
            <div ref={terminalRef} className="h-full w-full focus:outline-none p-4" />
            
            {!isInitialized && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-gray-600 border-t-blue-500 animate-spin"></div>
                  <div className="text-gray-300 font-medium">ターミナルを初期化中...</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Shell;