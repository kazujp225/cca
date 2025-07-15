import React, { useState, useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

import { FolderOpen, Folder, Plus, MessageSquare, Clock, ChevronDown, ChevronRight, Edit3, Check, X, Trash2, Settings, FolderPlus, RefreshCw, Sparkles, Edit2, Star, Search, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import ClaudeLogo from './ClaudeLogo';
import { api } from '../utils/api';

// Move formatTimeAgo outside component to avoid recreation on every render
const formatTimeAgo = (dateString, currentTime) => {
  const date = new Date(dateString);
  const now = currentTime;
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return '不明';
  }
  
  const diffInMs = now - date;
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInSeconds < 60) return 'たった今';
  if (diffInMinutes === 1) return '1分前';
  if (diffInMinutes < 60) return `${diffInMinutes}分前`;
  if (diffInHours === 1) return '1時間前';
  if (diffInHours < 24) return `${diffInHours}時間前`;
  if (diffInDays === 1) return '1日前';
  if (diffInDays < 7) return `${diffInDays}日前`;
  return date.toLocaleDateString();
};

function Sidebar({ 
  projects, 
  selectedProject, 
  selectedSession, 
  onProjectSelect, 
  onSessionSelect, 
  onNewSession,
  onSessionDelete,
  onProjectDelete,
  isLoading,
  onRefresh,
  onShowSettings,
  updateAvailable,
  latestVersion,
  currentVersion,
  onShowVersionModal,
  isCollapsed = false,
  onToggleCollapse
}) {
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [editingProject, setEditingProject] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectMode, setProjectMode] = useState('new'); // 'existing' or 'new' - default to 'new' for easier use
  const [loadingSessions, setLoadingSessions] = useState({});
  const [additionalSessions, setAdditionalSessions] = useState({});
  const [initialSessionsLoaded, setInitialSessionsLoaded] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [projectSortOrder, setProjectSortOrder] = useState('name');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState({});
  const [searchFilter, setSearchFilter] = useState('');

  
  // Starred projects state - persisted in localStorage
  const [starredProjects, setStarredProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('starredProjects');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (error) {
      console.error('お気に入りプロジェクトの読み込みエラー:', error);
      return new Set();
    }
  });

  // Touch handler to prevent double-tap issues on iPad (only for buttons, not scroll areas)
  const handleTouchClick = (callback) => {
    return (e) => {
      // Only prevent default for buttons/clickable elements, not scrollable areas
      if (e.target.closest('.overflow-y-auto') || e.target.closest('[data-scroll-container]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      callback();
    };
  };

  // Auto-update timestamps every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+N or Cmd+N to open new project modal
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowNewProject(true);
      }
      // Escape to close modal
      if (e.key === 'Escape' && showNewProject) {
        setShowNewProject(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showNewProject]);

  // Save starred projects when they change
  useEffect(() => {
    try {
      localStorage.setItem('starredProjects', JSON.stringify(Array.from(starredProjects)));
    } catch (error) {
      console.error('お気に入りプロジェクトの保存エラー:', error);
    }
  }, [starredProjects]);

  // Check for Claude CLI settings when component mounts
  useEffect(() => {
    const checkClaudeSettings = () => {
      try {
        const savedSettings = localStorage.getItem('claude-tools-settings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          if (settings.autoExpandTools) {
            // Settings exist, no need to show notification
            return;
          }
        }
      } catch (error) {
        console.error('設定の確認エラー:', error);
      }
    };

    checkClaudeSettings();
  }, []);

  // Utility functions
  const getAllSessionsForProject = (project) => {
    const initialSessions = project.sessions || [];
    const additional = additionalSessions[project.name] || [];
    
    // Combine and deduplicate based on session ID
    const sessionMap = new Map();
    
    // Add initial sessions first
    initialSessions.forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    // Add additional sessions, overriding if there are duplicates
    additional.forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    return Array.from(sessionMap.values());
  };

  const sortSessionsByDate = (sessions) => {
    return sessions.sort((a, b) => {
      const dateA = new Date(a.lastModified || a.createdAt || 0);
      const dateB = new Date(b.lastModified || b.createdAt || 0);
      return dateB - dateA; // Most recent first
    });
  };

  const getProjectLastActivity = (project) => {
    const sessions = getAllSessionsForProject(project);
    if (sessions.length === 0) {
      return new Date(0); // Return epoch date for projects with no sessions
    }
    
    const mostRecentDate = sessions.reduce((latest, session) => {
      const sessionDate = new Date(session.lastModified || session.createdAt || 0);
      return sessionDate > latest ? sessionDate : latest;
    }, new Date(0));
    
    return mostRecentDate;
  };

  const sortProjects = (projects) => {
    return [...projects].sort((a, b) => {
      const aStarred = starredProjects.has(a.name);
      const bStarred = starredProjects.has(b.name);
      
      // Starred projects come first
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;
      
      // Then sort by the selected order
      if (projectSortOrder === 'recent') {
        // Sort by most recent activity
        return getProjectLastActivity(b) - getProjectLastActivity(a);
      } else {
        // Sort alphabetically
        const nameA = a.displayName?.toLowerCase() || a.name?.toLowerCase() || '';
        const nameB = b.displayName?.toLowerCase() || b.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
      }
    });
  };

  const toggleProjectExpansion = (projectName) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectName)) {
        newSet.delete(projectName);
      } else {
        newSet.add(projectName);
      }
      return newSet;
    });
  };

  const toggleStarProject = (projectName) => {
    setStarredProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectName)) {
        newSet.delete(projectName);
      } else {
        newSet.add(projectName);
      }
      return newSet;
    });
  };

  // Handle folder selection (using file input as fallback)
  const handleSelectFolder = () => {
    // For browser environment, we'll use a file input as fallback
    // In a real desktop app, this would open a native folder picker
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    
    input.onchange = (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        // Get the directory path from the first file
        const file = files[0];
        const pathParts = file.webkitRelativePath.split('/');
        if (pathParts.length > 1) {
          // Remove the filename to get directory path
          pathParts.pop();
          const directoryPath = pathParts.join('/');
          setNewProjectPath(directoryPath);
        }
      }
    };
    
    input.click();
  };

  // Handle file selection for existing project
  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*';
    input.webkitdirectory = true; // Try to allow directory selection
    input.directory = true;
    
    input.onchange = (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        // Get the directory path from the first file
        const file = files[0];
        // Extract directory path from file path
        const path = file.webkitRelativePath || file.name;
        const pathParts = path.split('/');
        
        if (pathParts.length > 1) {
          // If we have a path with folders, use the root folder
          const projectFolder = pathParts[0];
          setNewProjectPath(`~/Downloads/${projectFolder}`);
          console.log('検出されたプロジェクトフォルダ:', projectFolder);
        } else {
          // Fallback: just use the filename to suggest a project name
          const projectName = file.name.split('.')[0];
          setNewProjectPath(`~/Downloads/${projectName}-project`);
          console.log('ファイルから推測されたプロジェクト名:', projectName);
        }
      }
    };
    
    // If directory selection is not supported, fall back to file selection
    input.onerror = () => {
      input.webkitdirectory = false;
      input.directory = false;
      input.click();
    };
    
    input.click();
  };

  // Generate automatic project name based on timestamp
  const generateProjectName = () => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `claude-project-${timestamp}`;
  };

  // Handle project creation with optional file creation
  const handleCreateProject = async () => {
    let projectPath = newProjectPath.trim();
    
    // If in 'new' mode, use Downloads folder with auto-generated name
    if (projectMode === 'new') {
      const projectName = generateProjectName();
      projectPath = `~/Downloads/${projectName}`;
      console.log('自動生成プロジェクトパス:', projectPath);
    }
    
    if (!projectPath) return;
    
    setCreatingProject(true);
    try {
      console.log('プロジェクト作成中:', projectPath, 'モード:', projectMode);
      
      // For 'new' mode, create the directory first
      if (projectMode === 'new') {
        try {
          const mkdirResponse = await api.mkdir(projectPath);
          
          if (!mkdirResponse.ok) {
            const errorData = await mkdirResponse.json();
            throw new Error(errorData.error || 'ディレクトリの作成に失敗しました');
          }
          
          const mkdirResult = await mkdirResponse.json();
          console.log('ディレクトリ作成成功:', mkdirResult);
          
          // Use the expanded path from the server response
          if (mkdirResult.path) {
            projectPath = mkdirResult.path;
          }
        } catch (error) {
          console.error('ディレクトリ作成エラー:', error);
          throw error;
        }
      }
      
      // Call the API to create/initialize a new project
      const response = await api.createProject(projectPath);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'プロジェクトの作成に失敗しました');
      }
      
      const result = await response.json();
      console.log('プロジェクト作成成功:', result);
      
      // If filename is provided, create the file(s)
      if (newFileName.trim()) {
        const projectInfo = result.project || { name: projectPath.split('/').pop() };
        const files = newFileName.split(',').map(f => f.trim()).filter(f => f);
        
        for (const filename of files) {
          await createInitialFile(projectInfo, filename);
        }
      }
      
      // Close modal and reset form
      setShowNewProject(false);
      setNewProjectPath('');
      setNewFileName('');
      setProjectMode('new');
      
      // Refresh projects list
      if (onRefresh) {
        await onRefresh();
      }
      
      // Show success message
      console.log('プロジェクトが正常に作成されました');
      
    } catch (error) {
      console.error('プロジェクト作成エラー:', error);
      alert(`プロジェクトの作成に失敗しました: ${error.message}`);
    } finally {
      setCreatingProject(false);
    }
  };

  // Create initial file in the project
  const createInitialFile = async (project, filename) => {
    try {
      filename = filename.trim();
      const extension = filename.split('.').pop().toLowerCase();
      
      // Generate initial content based on file extension
      let initialContent = '';
      switch (extension) {
        case 'js':
          initialContent = `// ${filename}\nconsole.log('Hello, World!');\n`;
          break;
        case 'py':
          initialContent = `# ${filename}\nprint("Hello, World!")\n`;
          break;
        case 'html':
          initialContent = `<!DOCTYPE html>\n<html>\n<head>\n    <title>${filename}</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>\n`;
          break;
        case 'css':
          initialContent = `/* ${filename} */\nbody {\n    margin: 0;\n    padding: 0;\n    font-family: Arial, sans-serif;\n}\n`;
          break;
        case 'md':
          initialContent = `# ${filename.replace('.md', '')}\n\nプロジェクトの説明をここに記載してください。\n`;
          break;
        case 'json':
          initialContent = `{\n  "name": "${filename.replace('.json', '')}",\n  "version": "1.0.0"\n}\n`;
          break;
        case 'txt':
          initialContent = `${filename}\n\nテキストファイルの内容をここに記載してください。\n`;
          break;
        default:
          initialContent = `// ${filename}\n// ファイルの内容をここに記載してください\n`;
      }
      
      const response = await api.saveFile(project.name, filename, initialContent);
      
      if (!response.ok) {
        throw new Error('ファイルの作成に失敗しました');
      }
      
      console.log(`初期ファイル ${filename} が作成されました`);
      
    } catch (error) {
      console.error('ファイル作成エラー:', error);
      // Don't throw error here, as project creation was successful
      console.warn('プロジェクトは作成されましたが、ファイルの作成に失敗しました');
    }
  };

  // Rest of the component logic would go here...
  // For now, let's create a simplified version

  const filteredProjects = projects.filter(project => {
    if (!searchFilter.trim()) return true;
    
    const searchLower = searchFilter.toLowerCase();
    const displayName = (project.displayName || project.name || '').toLowerCase();
    const projectName = (project.name || '').toLowerCase();
    
    // Search in both display name and actual project name/path
    return displayName.includes(searchLower) || projectName.includes(searchLower);
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 md:select-none overflow-hidden">
      {/* Header */}
      <div>
        {/* Desktop Header - Minimalist Design */}
        <div className="hidden md:block">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700">
                <ClaudeLogo className="w-6 h-6" />
              </div>
              {!isCollapsed && (
                <div className="flex-1">
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    ZETTAI Monitor
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    AIコーディングアシスタント
                  </p>
                </div>
              )}
              <div className="flex items-center gap-1">
                {/* Refresh button */}
                {!isCollapsed && (
                  <button
                    onClick={async () => {
                      setIsRefreshing(true);
                      try {
                        await onRefresh();
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                    disabled={isRefreshing}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    title="プロジェクトとセッションを更新"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {/* Collapse Toggle */}
                <button
                  onClick={onToggleCollapse}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title={isCollapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
                >
                  {isCollapsed ? (
                    <ChevronRightIcon className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Header - Minimalist Design */}
        <div className="md:hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700">
                  <ClaudeLogo className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    ZETTAI Monitor
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">AIコーディングアシスタント</p>
                </div>
              </div>
              {/* Refresh button only */}
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await onRefresh();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="プロジェクトとセッションを更新"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* New Project Button Section - Minimalist Design */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Button
            variant="default"
            size="sm"
            className="w-full h-10 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white transition-colors rounded-lg"
            onClick={() => {
              console.log('新規プロジェクト作成ボタンクリック');
              setShowNewProject(true);
            }}
            title="新規プロジェクトを作成 (Ctrl+N)"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">新規プロジェクト作成</span>
          </Button>
        </div>
      )}
      
      {/* Collapsed New Project Button */}
      {isCollapsed && (
        <div className="px-2 py-3 border-b border-gray-200 dark:border-gray-800">
          <Button
            variant="default"
            size="sm"
            className="w-full h-10 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white transition-colors rounded-lg flex items-center justify-center"
            onClick={() => {
              console.log('新規プロジェクト作成ボタンクリック（折りたたみ版）');
              setShowNewProject(true);
            }}
            title="新規プロジェクトを作成 (Ctrl+N)"
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
        </div>
      )}
      
      {/* Search Filter - Minimalist Design */}
      {projects.length > 0 && !isLoading && !isCollapsed && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <Input
              type="text"
              placeholder="プロジェクトを検索..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-transparent"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Projects List */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-2 py-3 space-y-1">
            {isLoading ? (
              <div className="text-center py-12 md:py-8 px-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                  <div className="w-6 h-6 animate-spin rounded-full border-2 border-gray-400 dark:border-gray-600 border-t-transparent" />
                </div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2 md:mb-1">プロジェクトを読み込み中...</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Claudeプロジェクトとセッションを取得中
                </p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 md:py-8 px-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                  <Folder className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2 md:mb-1">プロジェクトが見つかりません</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  プロジェクトディレクトリでClaude CLIを実行してください
                </p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12 md:py-8 px-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4 md:mb-3">
                  <Search className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2 md:mb-1">検索結果が見つかりません</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  検索条件を変更してください
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortProjects(filteredProjects).map((project) => {
                  const isProjectSelected = selectedProject?.name === project.name;
                  const isProjectExpanded = expandedProjects.has(project.name);
                  const projectSessions = getAllSessionsForProject(project);
                  const sortedSessions = sortSessionsByDate(projectSessions);
                  
                  return (
                    <div key={project.name} className="space-y-1">
                      {/* Project item */}
                      <div className={`p-3 rounded-lg border transition-colors ${
                        isProjectSelected 
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                              onProjectSelect(project);
                              // Auto-expand project to show sessions
                              if (projectSessions.length > 0) {
                                setExpandedProjects(prev => {
                                  const newSet = new Set(prev);
                                  newSet.add(project.name);
                                  return newSet;
                                });
                              }
                            }}
                          >
                            {isCollapsed ? (
                              /* Collapsed view - show only icon */
                              <div className="flex items-center justify-center">
                                <Folder className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              </div>
                            ) : (
                              /* Expanded view - show full info */
                              <>
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {project.displayName || project.name}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {project.fullPath}
                                </p>
                              </>
                            )}
                          </div>
                          
                          {/* Project expand/collapse toggle */}
                          {!isCollapsed && projectSessions.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleProjectExpansion(project.name);
                              }}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            >
                              {isProjectExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Sessions list */}
                      {!isCollapsed && isProjectExpanded && projectSessions.length > 0 && (
                        <div className="ml-4 space-y-1">
                          {sortedSessions.map((session) => {
                            const isSessionSelected = selectedSession?.id === session.id;
                            return (
                              <div
                                key={session.id}
                                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                                  isSessionSelected
                                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                                onClick={() => onSessionSelect(session)}
                              >
                                <div className="flex items-center space-x-2">
                                  <MessageSquare className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {session.summary || 'セッション'}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatTimeAgo(session.lastModified || session.createdAt, currentTime)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowNewProject(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <FolderPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">新規プロジェクト作成</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">プロジェクトフォルダと初期ファイルを設定</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewProject(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  プロジェクト作成方法
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectMode('existing');
                      setNewProjectPath('');
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      projectMode === 'existing'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    ファイル選択
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProjectMode('new');
                      setNewProjectPath('');
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      projectMode === 'new'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    自動作成
                  </button>
                </div>
              </div>
              
              {/* Path input for existing mode */}
              {projectMode === 'existing' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    既存プロジェクトを選択
                  </label>
                  
                  {/* Direct path input */}
                  <div className="mb-3">
                    <Input
                      type="text"
                      value={newProjectPath}
                      onChange={(e) => setNewProjectPath(e.target.value)}
                      placeholder="プロジェクトパスを入力 (例: ~/Projects/my-app)"
                      className="w-full"
                    />
                  </div>
                  
                  {/* Or file selection */}
                  <div className="relative mb-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-300 dark:border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                        または
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleFileSelect}
                      className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center gap-2"
                    >
                      <Folder className="w-5 h-5" />
                      フォルダを選択
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    プロジェクトフォルダを直接選択するか、パスを入力してください
                  </p>
                  
                  {newProjectPath && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        選択されたパス: <span className="font-mono">{newProjectPath}</span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    自動生成プロジェクト
                  </label>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          ダウンロードフォルダに自動生成
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ~/Downloads/{generateProjectName()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    タイムスタンプ付きのプロジェクトフォルダが自動的に作成されます
                  </p>
                </div>
              )}
              
              {/* Initial file creation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  初期ファイル作成 (オプション)
                </label>
                <Input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="例: main.js, index.html, README.md (複数可、カンマ区切り)"
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ファイル名を入力すると、プロジェクト作成時に自動的に初期ファイルが作成されます。複数ファイルはカンマ区切りで指定可能です。
                </p>
              </div>
              
              {/* File type suggestions */}
              {newFileName && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    よく使われるファイル:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'JavaScript', file: 'main.js' },
                      { label: 'Python', file: 'main.py' },
                      { label: 'HTML', file: 'index.html' },
                      { label: 'CSS', file: 'style.css' },
                      { label: 'README', file: 'README.md' },
                      { label: 'package.json', file: 'package.json' }
                    ].map((suggestion) => (
                      <button
                        key={suggestion.file}
                        type="button"
                        onClick={() => setNewFileName(suggestion.file)}
                        className="px-2 py-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded border border-green-200 dark:border-green-800 transition-colors"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Quick path suggestions - only for existing mode */}
              {projectMode === 'existing' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    よく使われるパス:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'ホームディレクトリ', path: '~' },
                      { label: 'デスクトップ', path: '~/Desktop' },
                      { label: 'Documents', path: '~/Documents' },
                      { label: 'プロジェクト', path: '~/Projects' }
                    ].map((suggestion) => (
                      <button
                        key={suggestion.path}
                        type="button"
                        onClick={() => setNewProjectPath(suggestion.path)}
                        className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800 transition-colors"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowNewProject(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateProject}
                disabled={(projectMode === 'existing' && !newProjectPath.trim()) || creatingProject}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {creatingProject ? '作成中...' : newFileName ? 'プロジェクト + ファイル作成' : 'プロジェクト作成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="md:p-2 md:border-t md:border-border flex-shrink-0">
        {/* Mobile Settings */}
        <div className="md:hidden p-4 pb-20 border-t border-border/50">
          <button
            className="w-full h-14 bg-muted/50 hover:bg-muted/70 rounded-2xl flex items-center justify-start gap-4 px-4 active:scale-[0.98] transition-all duration-150"
            onClick={onShowSettings}
          >
            <div className="w-10 h-10 rounded-2xl bg-background/80 flex items-center justify-center">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-lg font-medium text-foreground">設定</span>
          </button>
        </div>
        
        {/* Desktop Settings */}
        <Button
          variant="ghost"
          className={`hidden md:flex w-full ${isCollapsed ? 'justify-center' : 'justify-start'} gap-2 p-2 h-auto font-normal text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200`}
          onClick={onShowSettings}
        >
          <Settings className="w-3 h-3" />
          {!isCollapsed && <span className="text-xs">ツール設定</span>}
        </Button>
      </div>
    </div>
  );
}

export default Sidebar;