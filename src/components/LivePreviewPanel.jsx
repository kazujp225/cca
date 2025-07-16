import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ExternalLink, RefreshCw, Terminal, Code, Globe, FolderOpen, Settings, X } from 'lucide-react';
import Shell from './Shell';

function LivePreviewPanel({ 
  selectedProject, 
  serverStatus = 'stopped', 
  serverUrl = null,
  availableScripts = [],
  onStartServer,
  onStopServer,
  onScriptSelect,
  currentScript = null,
  isMobile = false,
  serverLogs = [],
  onClearLogs
}) {
  const [selectedScript, setSelectedScript] = useState(currentScript || 'npm start');
  const [customCommand, setCustomCommand] = useState('');
  const [showCustomCommand, setShowCustomCommand] = useState(false);
  const [projectScripts, setProjectScripts] = useState([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const logsRef = useRef(null);

  // Default common development commands
  const defaultCommands = [
    { name: 'npm start', description: 'NPM Start Server', icon: <Code className="w-4 h-4" /> },
    { name: 'npm run dev', description: 'NPM Dev Server', icon: <Code className="w-4 h-4" /> },
    { name: 'yarn start', description: 'Yarn Start Server', icon: <Code className="w-4 h-4" /> },
    { name: 'yarn dev', description: 'Yarn Dev Server', icon: <Code className="w-4 h-4" /> },
    { name: 'pnpm start', description: 'PNPM Start Server', icon: <Code className="w-4 h-4" /> },
    { name: 'pnpm dev', description: 'PNPM Dev Server', icon: <Code className="w-4 h-4" /> },
    { name: 'python -m http.server 8000', description: 'Python Simple Server', icon: <Globe className="w-4 h-4" /> },
    { name: 'python3 -m http.server 8000', description: 'Python3 Simple Server', icon: <Globe className="w-4 h-4" /> },
    { name: 'php -S localhost:8000', description: 'PHP Built-in Server', icon: <Globe className="w-4 h-4" /> },
    { name: 'live-server', description: 'Live Server', icon: <Globe className="w-4 h-4" /> }
  ];

  // Fetch package.json scripts when project changes
  useEffect(() => {
    if (selectedProject) {
      fetchProjectScripts();
    }
  }, [selectedProject]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [serverLogs]);

  const fetchProjectScripts = async () => {
    if (!selectedProject) return;
    
    setIsLoadingScripts(true);
    try {
      // Try to read package.json from the project
      const response = await fetch(`/api/projects/${selectedProject.name}/file?filePath=${encodeURIComponent(selectedProject.fullPath + '/package.json')}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const packageJson = JSON.parse(data.content);
        
        if (packageJson.scripts) {
          const scripts = Object.entries(packageJson.scripts).map(([name, command]) => ({
            name: `npm run ${name}`,
            description: `${name}: ${command}`,
            icon: <Code className="w-4 h-4" />,
            isProjectScript: true
          }));
          setProjectScripts(scripts);
          
          // Auto-select common dev scripts if available
          const devScript = scripts.find(s => s.name.includes('dev')) || 
                           scripts.find(s => s.name.includes('start')) ||
                           scripts[0];
          if (devScript && !currentScript) {
            setSelectedScript(devScript.name);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching package.json:', error);
    } finally {
      setIsLoadingScripts(false);
    }
  };

  const handleStartServer = () => {
    const command = showCustomCommand ? customCommand : selectedScript;
    console.log('🚀 handleStartServer called with:', { command, selectedProject: selectedProject?.name });
    
    if (command && selectedProject) {
      // Send WebSocket message to start server
      const message = {
        type: 'server:start',
        projectPath: selectedProject.fullPath || selectedProject.path,
        script: command
      };
      
      console.log('📤 Sending WebSocket message:', message);
      console.log('🔗 WebSocket state:', window.claudeWs ? window.claudeWs.readyState : 'not available');
      
      // Use existing WebSocket connection if available
      if (window.claudeWs && window.claudeWs.readyState === WebSocket.OPEN) {
        window.claudeWs.send(JSON.stringify(message));
        console.log('✅ WebSocket message sent successfully');
      } else {
        console.error('❌ WebSocket not available for server management');
        console.error('WebSocket state:', window.claudeWs ? window.claudeWs.readyState : 'undefined');
      }
      
      if (onStartServer) {
        console.log('📞 Calling onStartServer callback');
        onStartServer(command);
      }
      if (onScriptSelect) {
        console.log('📞 Calling onScriptSelect callback');
        onScriptSelect(command);
      }
    } else {
      console.error('❌ Missing command or selectedProject:', { command, selectedProject });
    }
  };

  const handleStopServer = () => {
    if (selectedProject) {
      // Send WebSocket message to stop server
      const message = {
        type: 'server:stop',
        projectPath: selectedProject.fullPath || selectedProject.path
      };
      
      // Use existing WebSocket connection if available
      if (window.claudeWs && window.claudeWs.readyState === WebSocket.OPEN) {
        window.claudeWs.send(JSON.stringify(message));
      } else {
        console.error('WebSocket not available for server management');
      }
    }
    
    if (onStopServer) {
      onStopServer();
    }
  };

  const handleOpenTerminal = () => {
    setShowTerminal(!showTerminal);
  };

  const handleScriptChange = (script) => {
    setSelectedScript(script);
    setShowCustomCommand(false);
  };

  const handleCustomCommandToggle = () => {
    setShowCustomCommand(!showCustomCommand);
    if (!showCustomCommand) {
      setCustomCommand('');
    }
  };

  const allCommands = [
    ...projectScripts,
    ...(projectScripts.length > 0 ? [{ name: 'divider', description: '--- Common Commands ---' }] : []),
    ...defaultCommands
  ];

  const getServerStatusColor = () => {
    switch (serverStatus) {
      case 'running': return 'text-green-600 dark:text-green-400';
      case 'starting': return 'text-yellow-600 dark:text-yellow-400';
      case 'stopping': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getServerStatusIcon = () => {
    switch (serverStatus) {
      case 'running': return <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />;
      case 'starting': return <RefreshCw className="w-3 h-3 animate-spin" />;
      case 'stopping': return <RefreshCw className="w-3 h-3 animate-spin" />;
      default: return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  if (!selectedProject) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <FolderOpen className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold mb-2">プロジェクトを選択してください</h3>
          <p>プロジェクトを選択して開発サーバーを起動します</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              ローカルプレビュー
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {selectedProject.displayName}
            </p>
          </div>
          
          {/* Server Status */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {getServerStatusIcon()}
              <span className={`text-sm font-medium ${getServerStatusColor()}`}>
                {serverStatus === 'running' ? '実行中' : 
                 serverStatus === 'starting' ? '起動中' : 
                 serverStatus === 'stopping' ? '停止中' : '停止'}
              </span>
            </div>
            
            <button
              onClick={handleOpenTerminal}
              className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showTerminal
                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
              }`}
              title={showTerminal ? "ターミナルを閉じる" : "ターミナルを開く"}
            >
              {showTerminal ? <X className="w-4 h-4 mr-1.5" /> : <Terminal className="w-4 h-4 mr-1.5" />}
              ターミナル
            </button>
            
            {serverUrl && serverStatus === 'running' && (
              <button
                onClick={() => window.open(serverUrl, '_blank')}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                ブラウザで開く
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            
            {/* Command Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900 dark:text-white">
                  開発コマンド
                </h3>
                <button
                  onClick={handleCustomCommandToggle}
                  className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    showCustomCommand
                      ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                      : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Settings className="w-3 h-3 mr-1" />
                  カスタム
                </button>
              </div>

              {showCustomCommand ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    placeholder="npm start, python -m http.server 8000, etc."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    カスタムコマンドを入力してください
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {isLoadingScripts ? (
                    <div className="text-center py-4">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        package.json を解析中...
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {allCommands.map((command, index) => {
                        if (command.name === 'divider') {
                          return (
                            <div key={index} className="border-t border-gray-200 dark:border-gray-700 my-2 pt-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                {command.description}
                              </p>
                            </div>
                          );
                        }
                        
                        return (
                          <button
                            key={command.name}
                            onClick={() => handleScriptChange(command.name)}
                            className={`flex items-center p-3 text-left border rounded-lg transition-all ${
                              selectedScript === command.name
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-white'
                            }`}
                          >
                            <div className="flex-shrink-0 mr-3">
                              {command.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{command.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {command.description}
                              </div>
                              {command.isProjectScript && (
                                <div className="inline-flex items-center mt-1">
                                  <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded">
                                    プロジェクト
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
              {serverStatus === 'stopped' ? (
                <button
                  onClick={handleStartServer}
                  disabled={!selectedScript && !customCommand}
                  className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4 mr-2" />
                  サーバーを起動
                </button>
              ) : (
                <button
                  onClick={handleStopServer}
                  className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 mr-2" />
                  サーバーを停止
                </button>
              )}
              
              {serverUrl && serverStatus === 'running' && (
                <button
                  onClick={() => window.open(serverUrl, '_blank')}
                  className="inline-flex items-center justify-center px-4 py-3 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Server URL Display */}
            {serverUrl && serverStatus === 'running' && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                      サーバーURL
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-400 font-mono">
                      {serverUrl}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(serverUrl);
                    }}
                    className="px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                  >
                    コピー
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Server Logs */}
        {serverLogs.length > 0 && !showTerminal && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                  サーバーログ
                </h4>
                <button
                  onClick={onClearLogs}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  クリア
                </button>
              </div>
            </div>
            <div
              ref={logsRef}
              className="h-48 overflow-y-auto p-4 bg-gray-900 text-green-400 font-mono text-xs"
            >
              {serverLogs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terminal */}
        {showTerminal && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-900" style={{ height: '400px' }}>
            <Shell 
              selectedProject={selectedProject} 
              selectedSession={null}
              isActive={showTerminal}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default LivePreviewPanel;