import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebglAddon } from '@xterm/addon-webgl';
import 'xterm/css/xterm.css';

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

// Global store for shell sessions to persist across tab switches
const shellSessions = new Map();

function Shell({ selectedProject, selectedSession, isActive }) {
  const terminalRef = useRef(null);
  const terminal = useRef(null);
  const fitAddon = useRef(null);
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [lastSessionId, setLastSessionId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Connect to shell function
  const connectToShell = () => {
    if (!isInitialized || isConnected || isConnecting) return;
    
    setIsConnecting(true);
    
    // Start the WebSocket connection
    connectWebSocket();
  };

  // Disconnect from shell function
  const disconnectFromShell = () => {
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    // Clear terminal content completely
    if (terminal.current) {
      terminal.current.clear();
      terminal.current.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  };

  // Restart shell function
  const restartShell = () => {
    setIsRestarting(true);
    
    // Clear ALL session storage for this project to force fresh start
    const sessionKeys = Array.from(shellSessions.keys()).filter(key => 
      key.includes(selectedProject.name)
    );
    sessionKeys.forEach(key => shellSessions.delete(key));
    
    
    // Close existing WebSocket
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    // Clear and dispose existing terminal
    if (terminal.current) {
      
      // Dispose terminal immediately without writing text
      terminal.current.dispose();
      terminal.current = null;
      fitAddon.current = null;
    }
    
    // Reset states
    setIsConnected(false);
    setIsInitialized(false);
    
    
    // Force re-initialization after cleanup
    setTimeout(() => {
      setIsRestarting(false);
    }, 200);
  };

  // Watch for session changes and restart shell
  useEffect(() => {
    const currentSessionId = selectedSession?.id || null;
    
    
    // Disconnect when session changes (user will need to manually reconnect)
    if (lastSessionId !== null && lastSessionId !== currentSessionId && isInitialized) {
      
      // Disconnect from current shell
      disconnectFromShell();
      
      // Clear stored sessions for this project
      const allKeys = Array.from(shellSessions.keys());
      allKeys.forEach(key => {
        if (key.includes(selectedProject.name)) {
          shellSessions.delete(key);
        }
      });
    }
    
    setLastSessionId(currentSessionId);
  }, [selectedSession?.id, isInitialized]);

  // Initialize terminal when component mounts
  useEffect(() => {
    
    if (!terminalRef.current || !selectedProject || isRestarting) {
      return;
    }

    // Create session key for this project/session combination
    const sessionKey = selectedSession?.id || `project-${selectedProject.name}`;
    
    // Check if we have an existing session
    const existingSession = shellSessions.get(sessionKey);
    if (existingSession && !terminal.current) {
      
      try {
        // Reuse existing terminal
        terminal.current = existingSession.terminal;
        fitAddon.current = existingSession.fitAddon;
        ws.current = existingSession.ws;
        setIsConnected(existingSession.isConnected);
        
        // Reattach to DOM - dispose existing element first if needed
        if (terminal.current.element && terminal.current.element.parentNode) {
          terminal.current.element.parentNode.removeChild(terminal.current.element);
        }
        
        terminal.current.open(terminalRef.current);
        
        setTimeout(() => {
          if (fitAddon.current) {
            fitAddon.current.fit();
            // Send terminal size to backend after reattaching
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({
                type: 'resize',
                cols: terminal.current.cols,
                rows: terminal.current.rows
              }));
            }
          }
        }, 100);
        
        setIsInitialized(true);
        return;
      } catch (error) {
        // Clear the broken session and continue to create a new one
        shellSessions.delete(sessionKey);
        terminal.current = null;
        fitAddon.current = null;
        ws.current = null;
      }
    }

    if (terminal.current) {
      return;
    }


    // Initialize new terminal
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, Menlo, "Courier New", monospace',
      allowProposedApi: true, // Required for clipboard addon
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      tabStopWidth: 4,
      // Enable full color support
      windowsMode: false,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: false,
      // Modern dark theme optimized for readability
      theme: {
        // Basic colors - modern dark theme
        background: '#0a0a0a',
        foreground: '#e1e5e9',
        cursor: '#00d9ff',
        cursorAccent: '#0a0a0a',
        selection: '#3b4252',
        selectionForeground: '#ffffff',
        
        // Standard ANSI colors (0-7) - enhanced for better contrast
        black: '#2e3440',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#5e81ac',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        
        // Bright ANSI colors (8-15) - vibrant modern palette
        brightBlack: '#4c566a',
        brightRed: '#d08770',
        brightGreen: '#8fbcbb',
        brightYellow: '#d8dee9',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#88c0d0',
        brightWhite: '#eceff4',
        
        // Extended colors for better Claude output
        extendedAnsi: [
          // Modern 16-color palette extension
          '#2e3440', '#3b4252', '#434c5e', '#4c566a',
          '#d8dee9', '#e5e9f0', '#eceff4', '#f0f4f8',
          '#bf616a', '#d08770', '#ebcb8b', '#a3be8c',
          '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac'
        ]
      }
    });

    fitAddon.current = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    const webglAddon = new WebglAddon();
    
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(clipboardAddon);
    
    try {
      terminal.current.loadAddon(webglAddon);
    } catch (error) {
    }
    
    terminal.current.open(terminalRef.current);

    // Wait for terminal to be fully rendered, then fit
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    }, 50);

    // Add keyboard shortcuts for copy/paste
    terminal.current.attachCustomKeyEventHandler((event) => {
      // Ctrl+C or Cmd+C for copy (when text is selected)
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && terminal.current.hasSelection()) {
        document.execCommand('copy');
        return false;
      }
      
      // Ctrl+V or Cmd+V for paste
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
              type: 'input',
              data: text
            }));
          }
        }).catch(err => {
          // Failed to read clipboard
        });
        return false;
      }
      
      return true;
    });
    
    // Ensure terminal takes full space and notify backend of size
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
        // Send terminal size to backend after fitting
        if (terminal.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'resize',
            cols: terminal.current.cols,
            rows: terminal.current.rows
          }));
        }
      }
    }, 100);
    
    setIsInitialized(true);

    // Handle terminal input
    terminal.current.onData((data) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });

    // Add resize observer to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon.current && terminal.current) {
        setTimeout(() => {
          fitAddon.current.fit();
          // Send updated terminal size to backend after resize
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
              type: 'resize',
              cols: terminal.current.cols,
              rows: terminal.current.rows
            }));
          }
        }, 50);
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      
      // Store session for reuse instead of disposing
      if (terminal.current && selectedProject) {
        const sessionKey = selectedSession?.id || `project-${selectedProject.name}`;
        
        try {
          shellSessions.set(sessionKey, {
            terminal: terminal.current,
            fitAddon: fitAddon.current,
            ws: ws.current,
            isConnected: isConnected
          });
          
        } catch (error) {
          // If storing fails, properly dispose to prevent memory leaks
          if (terminal.current) {
            try {
              terminal.current.dispose();
            } catch (disposeError) {
              // Ignore disposal errors
            }
          }
          if (ws.current) {
            try {
              ws.current.close();
            } catch (closeError) {
              // Ignore close errors
            }
          }
        }
      }
    };
  }, [terminalRef.current, selectedProject, selectedSession, isRestarting]);

  // Fit terminal when tab becomes active
  useEffect(() => {
    if (!isActive || !isInitialized) return;

    // Fit terminal when tab becomes active and notify backend
    const fitTimer = setTimeout(() => {
      if (fitAddon.current && terminal.current) {
        try {
          fitAddon.current.fit();
          // Send terminal size to backend after tab activation
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
              type: 'resize',
              cols: terminal.current.cols,
              rows: terminal.current.rows
            }));
          }
        } catch (error) {
          // Ignore fit errors during cleanup
        }
      }
    }, 100);

    return () => {
      clearTimeout(fitTimer);
    };
  }, [isActive, isInitialized]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      // Force cleanup on unmount to prevent navigation freezing
      if (ws.current) {
        try {
          ws.current.close();
          ws.current = null;
        } catch (error) {
          // Ignore close errors during cleanup
        }
      }
      
      // Clear any pending timers
      if (terminal.current) {
        try {
          // Detach from DOM if still attached
          if (terminal.current.element && terminal.current.element.parentNode) {
            terminal.current.element.parentNode.removeChild(terminal.current.element);
          }
        } catch (error) {
          // Ignore DOM manipulation errors during cleanup
        }
      }
    };
  }, []);

  // WebSocket connection function (called manually)
  const connectWebSocket = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      // Get authentication token
      const token = localStorage.getItem('auth-token');
      if (!token) {
        console.error('No authentication token found for Shell WebSocket connection');
        return;
      }
      
      // Fetch server configuration to get the correct WebSocket URL
      let wsBaseUrl;
      try {
        const configResponse = await fetch('/api/config', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const config = await configResponse.json();
        wsBaseUrl = config.wsUrl;
        
        // If the config returns localhost but we're not on localhost, use current host but with API server port
        if (wsBaseUrl.includes('localhost') && !window.location.hostname.includes('localhost')) {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          // For development, API server is typically on port 3002 when Vite is on 3001
          const apiPort = window.location.port === '3001' ? '3002' : window.location.port;
          wsBaseUrl = `${protocol}//${window.location.hostname}:${apiPort}`;
        }
      } catch (error) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // For development, API server is typically on port 3002 when Vite is on 3001
        const apiPort = window.location.port === '3001' ? '3002' : window.location.port;
        wsBaseUrl = `${protocol}//${window.location.hostname}:${apiPort}`;
      }
      
      // Include token in WebSocket URL as query parameter
      const wsUrl = `${wsBaseUrl}/shell?token=${encodeURIComponent(token)}`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        
        // Wait for terminal to be ready, then fit and send dimensions
        setTimeout(() => {
          if (fitAddon.current && terminal.current) {
            // Force a fit to ensure proper dimensions
            fitAddon.current.fit();
            
            // Wait a bit more for fit to complete, then send dimensions
            setTimeout(() => {
              const initPayload = {
                type: 'init',
                projectPath: selectedProject.fullPath || selectedProject.path,
                sessionId: selectedSession?.id,
                hasSession: !!selectedSession,
                cols: terminal.current.cols,
                rows: terminal.current.rows
              };
              
              ws.current.send(JSON.stringify(initPayload));
              
              // Also send resize message immediately after init
              setTimeout(() => {
                if (terminal.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({
                    type: 'resize',
                    cols: terminal.current.cols,
                    rows: terminal.current.rows
                  }));
                }
              }, 100);
            }, 50);
          }
        }, 200);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'output') {
            // Check for URLs in the output and make them clickable
            const urlRegex = /(https?:\/\/[^\s\x1b\x07]+)/g;
            let output = data.data;
            
            // Find URLs in the text (excluding ANSI escape sequences)
            const urls = [];
            let match;
            while ((match = urlRegex.exec(output.replace(/\x1b\[[0-9;]*m/g, ''))) !== null) {
              urls.push(match[1]);
            }
            
            // If URLs found, log them for potential opening
            
            terminal.current.write(output);
          } else if (data.type === 'url_open') {
            // Handle explicit URL opening requests from server
            window.open(data.url, '_blank');
          }
        } catch (error) {
        }
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);
        
        // Clear terminal content when connection closes
        if (terminal.current) {
          terminal.current.clear();
          terminal.current.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home
        }
        
        // Don't auto-reconnect anymore - user must manually connect
      };

      ws.current.onerror = (error) => {
        setIsConnected(false);
        setIsConnecting(false);
      };
    } catch (error) {
      setIsConnected(false);
      setIsConnecting(false);
    }
  };


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
          <p>プロジェクトを選択して、そのディレクトリでインタラクティブシェルを開きます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950 w-full">
      {/* Modern Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left section - Status and info */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {/* Status indicator */}
                <div className="flex items-center space-x-2">
                  <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    isConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 
                    isConnecting ? 'bg-amber-500 animate-pulse shadow-lg shadow-amber-500/50' : 
                    'bg-gray-400 dark:bg-gray-600'
                  }`} />
                  <span className={`text-sm font-medium ${
                    isConnected ? 'text-emerald-700 dark:text-emerald-400' : 
                    isConnecting ? 'text-amber-700 dark:text-amber-400' : 
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {isConnected ? '接続済み' : isConnecting ? '接続中' : '未接続'}
                  </span>
                </div>
              </div>
              
              {/* Project info */}
              <div className="hidden sm:flex items-center space-x-2 text-gray-600 dark:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium">{selectedProject.displayName}</span>
              </div>

              {/* Session info */}
              {selectedSession && (
                <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                    {selectedSession.summary.slice(0, 40)}...
                  </span>
                </div>
              )}
            </div>

            {/* Right section - Controls */}
            <div className="flex items-center space-x-3">
              {isConnected && (
                <button
                  onClick={disconnectFromShell}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  title="シェルから切断"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  切断
                </button>
              )}
              
              <button
                onClick={restartShell}
                disabled={isRestarting || isConnected}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50 dark:disabled:hover:bg-gray-800"
                title="シェルを再起動（先に切断してください）"
              >
                <svg className={`w-4 h-4 mr-1.5 ${isRestarting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRestarting ? '再起動中' : '再起動'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Container */}
      <div className="flex-1 bg-white dark:bg-gray-950 overflow-hidden relative">
        {/* Terminal Wrapper with modern styling */}
        <div className="h-full bg-gray-950 dark:bg-black rounded-lg mx-4 mb-4 shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Terminal header bar */}
          <div className="bg-gray-800 dark:bg-gray-900 px-4 py-2 border-b border-gray-700 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <div className="flex-1 text-center">
                <span className="text-sm font-medium text-gray-300">
                  {selectedProject.displayName} - Terminal
                </span>
              </div>
            </div>
          </div>
          
          {/* Terminal content */}
          <div className="h-full bg-gray-950 dark:bg-black relative">
            <div ref={terminalRef} className="h-full w-full focus:outline-none p-4" style={{ outline: 'none' }} />
            
            {/* Loading state */}
            {!isInitialized && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-gray-600 border-t-blue-500 animate-spin"></div>
                  <div className="text-gray-300 font-medium">ターミナルを初期化中...</div>
                  <div className="text-gray-500 text-sm mt-2">xterm.jsを読み込んでいます</div>
                </div>
              </div>
            )}
            
            {/* Connect button when not connected */}
            {isInitialized && !isConnected && !isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm p-6">
                <div className="text-center max-w-md w-full">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
                    <div className="w-16 h-16 mx-auto mb-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
                      <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                      シェルに接続
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {selectedSession ? 
                        `セッション「${selectedSession.summary.slice(0, 30)}...」でターミナルを開始` : 
                        '新しいセッションでインタラクティブシェルを開始'
                      }
                    </p>
                    <button
                      onClick={connectToShell}
                      className="w-full inline-flex items-center justify-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 shadow-lg"
                      title="シェルに接続"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      シェルで続ける
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Connecting state */}
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm p-6">
                <div className="text-center max-w-md w-full">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
                    <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
                      <div className="w-8 h-8 animate-spin rounded-full border-3 border-amber-600 border-t-transparent"></div>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                      接続中...
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedProject.displayName}でClaude CLIを起動中
                    </p>
                    <div className="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        WebSocket接続を確立しています...
                      </div>
                    </div>
                  </div>
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