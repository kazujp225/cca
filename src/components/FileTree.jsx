import React, { useState, useEffect } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Folder, FolderOpen, File, FileText, FileCode, List, TableProperties, Eye, Trash2, MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import CodeEditor from './CodeEditor';
import ImageViewer from './ImageViewer';
import { api } from '../utils/api';

function FileTree({ selectedProject, onFileCreated }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [viewMode, setViewMode] = useState('detailed'); // 'simple', 'detailed', 'compact'
  const [recentlyCreatedFiles, setRecentlyCreatedFiles] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showCreateFile, setShowCreateFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  useEffect(() => {
    if (selectedProject) {
      fetchFiles();
    }
  }, [selectedProject]);

  // Auto-refresh files every 30 seconds to catch new files
  useEffect(() => {
    if (!selectedProject) return;
    
    const interval = setInterval(() => {
      fetchFiles();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedProject]);

  // Load view mode preference from localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('file-tree-view-mode');
    if (savedViewMode && ['simple', 'detailed', 'compact'].includes(savedViewMode)) {
      setViewMode(savedViewMode);
    }
  }, []);

  const fetchFiles = async (markAsNew = false) => {
    setLoading(true);
    try {
      const response = await api.getFiles(selectedProject.name);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ File fetch failed:', response.status, errorText);
        setFiles([]);
        return;
      }
      
      const data = await response.json();
      
      // If this is a refresh after file creation, mark new files
      if (markAsNew) {
        const newFiles = data.filter(file => 
          file.type === 'file' && 
          !files.some(existingFile => existingFile.path === file.path)
        );
        
        const newFilePaths = new Set(newFiles.map(file => file.path));
        setRecentlyCreatedFiles(prev => new Set([...prev, ...newFilePaths]));
        
        // Remove the "new" marker after 30 seconds
        setTimeout(() => {
          setRecentlyCreatedFiles(prev => {
            const updated = new Set(prev);
            newFilePaths.forEach(path => updated.delete(path));
            return updated;
          });
        }, 30000);
      }
      
      setFiles(data);
    } catch (error) {
      console.error('❌ Error fetching files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh function to parent component
  React.useImperativeHandle(onFileCreated, () => ({
    refreshFiles: (markAsNew = true) => fetchFiles(markAsNew)
  }));

  const toggleDirectory = (path) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedDirs(newExpanded);
  };

  // Delete file function
  const deleteFile = async (filePath) => {
    try {
      const response = await api.deleteFile(selectedProject.name, filePath);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'ファイルの削除に失敗しました');
      }
      
      // Refresh file list
      fetchFiles();
      setShowDeleteConfirm(null);
      
      console.log('ファイルが正常に削除されました:', filePath);
    } catch (error) {
      console.error('ファイル削除エラー:', error);
      alert(`ファイルの削除に失敗しました: ${error.message}`);
    }
  };

  // Create new file function
  const createNewFile = async () => {
    if (!newFileName.trim()) return;
    
    try {
      const fileName = newFileName.trim();
      const projectPath = selectedProject.path || selectedProject.fullPath;
      const absoluteFilePath = `${projectPath}/${fileName}`;
      
      // Generate initial content based on file extension
      let initialContent = '';
      const extension = fileName.split('.').pop()?.toLowerCase();
      
      switch (extension) {
        case 'js':
          initialContent = `// ${fileName}\nconsole.log('Hello, World!');\n`;
          break;
        case 'py':
          initialContent = `# ${fileName}\nprint("Hello, World!")\n`;
          break;
        case 'html':
          initialContent = `<!DOCTYPE html>\n<html>\n<head>\n    <title>${fileName}</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>\n`;
          break;
        case 'css':
          initialContent = `/* ${fileName} */\nbody {\n    margin: 0;\n    padding: 0;\n    font-family: Arial, sans-serif;\n}\n`;
          break;
        case 'md':
          initialContent = `# ${fileName.replace('.md', '')}\n\nドキュメントの内容をここに記載してください。\n`;
          break;
        case 'json':
          initialContent = `{\n  "name": "${fileName.replace('.json', '')}",\n  "version": "1.0.0"\n}\n`;
          break;
        case 'txt':
          initialContent = `${fileName}\n\nテキストファイルの内容をここに記載してください。\n`;
          break;
        default:
          initialContent = `// ${fileName}\n// ファイルの内容をここに記載してください\n`;
      }
      
      const response = await api.saveFile(selectedProject.name, absoluteFilePath, initialContent);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'ファイルの作成に失敗しました');
      }
      
      console.log(`新しいファイル ${fileName} が作成されました:`, absoluteFilePath);
      
      // Mark this file as recently created
      setRecentlyCreatedFiles(prev => new Set([...prev, absoluteFilePath]));
      
      // Refresh file list
      fetchFiles(true);
      
      // Close modal and reset form
      setShowCreateFile(false);
      setNewFileName('');
      
    } catch (error) {
      console.error('ファイル作成エラー:', error);
      alert(`ファイルの作成に失敗しました: ${error.message}`);
    }
  };

  // Change view mode and save preference
  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('file-tree-view-mode', mode);
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date as relative time
  const formatRelativeTime = (date) => {
    if (!date) return '-';
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 60) return 'たった今';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分前`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}時間前`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}日前`;
    return past.toLocaleDateString();
  };

  // Check if file is recently created (within last 30 days for testing)
  const isRecentlyCreated = (item) => {
    if (!item) return false;
    
    // Check if this file was recently created via GUI
    if (recentlyCreatedFiles.has(item.path)) {
      return true;
    }
    
    if (!item.modified) {
      console.log('No modified date for file:', item.name);
      return false;
    }
    
    const now = new Date();
    const past = new Date(item.modified);
    const diffInHours = Math.floor((now - past) / (1000 * 60 * 60));
    const isRecent = diffInHours < (30 * 24); // 30 days for testing
    
    console.log('isRecentlyCreated check:', {
      fileName: item.name,
      modified: item.modified,
      now: now.toISOString(),
      past: past.toISOString(),
      diffInHours,
      isRecent
    });
    
    return isRecent;
  };

  const renderFileTree = (items, level = 0) => {
    return items.map((item) => (
      <div key={item.path} className="select-none">
        <div className="group relative">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start p-2 h-auto font-normal text-left hover:bg-accent",
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => {
              if (item.type === 'directory') {
                toggleDirectory(item.path);
              } else if (isImageFile(item.name)) {
                // Open image in viewer
                setSelectedImage({
                  name: item.name,
                  path: item.path,
                  projectPath: selectedProject.path,
                  projectName: selectedProject.name
                });
              } else {
                // Open file in editor
                setSelectedFile({
                  name: item.name,
                  path: item.path,
                  projectPath: selectedProject.path,
                  projectName: selectedProject.name
                });
              }
            }}
          >
            <div className="flex items-center gap-2 min-w-0 w-full">
              {item.type === 'directory' ? (
                expandedDirs.has(item.path) ? (
                  <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )
              ) : (
                getFileIcon(item.name)
              )}
              <span className="text-sm truncate text-foreground">
                {item.name}
              </span>
              {/* New file indicator */}
              {item.type === 'file' && isRecentlyCreated(item) && (
                <span className="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full flex-shrink-0 animate-pulse">
                  NEW
                </span>
              )}
            </div>
          </Button>
          
          {/* Delete button - only show for files */}
          {item.type === 'file' && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(item);
              }}
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </Button>
          )}
        </div>
        
        {item.type === 'directory' && 
         expandedDirs.has(item.path) && 
         item.children && 
         item.children.length > 0 && (
          <div>
            {renderFileTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  const isImageFile = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    return imageExtensions.includes(ext);
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs'];
    const docExtensions = ['md', 'txt', 'doc', 'pdf'];
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    
    if (codeExtensions.includes(ext)) {
      return <FileCode className="w-4 h-4 text-green-500 flex-shrink-0" />;
    } else if (docExtensions.includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    } else if (imageExtensions.includes(ext)) {
      return <File className="w-4 h-4 text-purple-500 flex-shrink-0" />;
    } else {
      return <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  // Render detailed view with table-like layout
  const renderDetailedView = (items, level = 0) => {
    return items.map((item) => (
      <div key={item.path} className="select-none">
        <div
          className={cn(
            "grid grid-cols-12 gap-2 p-2 hover:bg-accent cursor-pointer items-center",
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => {
            if (item.type === 'directory') {
              toggleDirectory(item.path);
            } else if (isImageFile(item.name)) {
              setSelectedImage({
                name: item.name,
                path: item.path,
                projectPath: selectedProject.path,
                projectName: selectedProject.name
              });
            } else {
              setSelectedFile({
                name: item.name,
                path: item.path,
                projectPath: selectedProject.path,
                projectName: selectedProject.name
              });
            }
          }}
        >
          <div className="col-span-5 flex items-center gap-2 min-w-0">
            {item.type === 'directory' ? (
              expandedDirs.has(item.path) ? (
                <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )
            ) : (
              getFileIcon(item.name)
            )}
            <span className="text-sm truncate text-foreground">
              {item.name}
            </span>
            {/* New file indicator */}
            {item.type === 'file' && isRecentlyCreated(item) && (
              <span className="ml-2 px-1.5 py-0.5 bg-green-500 text-white text-xs rounded-full flex-shrink-0 animate-pulse">
                NEW
              </span>
            )}
          </div>
          <div className="col-span-2 text-sm text-muted-foreground">
            {item.type === 'file' ? formatFileSize(item.size) : '-'}
          </div>
          <div className="col-span-3 text-sm text-muted-foreground">
            {formatRelativeTime(item.modified)}
          </div>
          <div className="col-span-2 text-sm text-muted-foreground font-mono">
            {item.permissionsRwx || '-'}
          </div>
        </div>
        
        {item.type === 'directory' && 
         expandedDirs.has(item.path) && 
         item.children && 
         renderDetailedView(item.children, level + 1)}
      </div>
    ));
  };

  // Render compact view with inline details
  const renderCompactView = (items, level = 0) => {
    return items.map((item) => (
      <div key={item.path} className="select-none">
        <div
          className={cn(
            "flex items-center justify-between p-2 hover:bg-accent cursor-pointer",
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => {
            if (item.type === 'directory') {
              toggleDirectory(item.path);
            } else if (isImageFile(item.name)) {
              setSelectedImage({
                name: item.name,
                path: item.path,
                projectPath: selectedProject.path,
                projectName: selectedProject.name
              });
            } else {
              setSelectedFile({
                name: item.name,
                path: item.path,
                projectPath: selectedProject.path,
                projectName: selectedProject.name
              });
            }
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {item.type === 'directory' ? (
              expandedDirs.has(item.path) ? (
                <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )
            ) : (
              getFileIcon(item.name)
            )}
            <span className="text-sm truncate text-foreground">
              {item.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {item.type === 'file' && (
              <>
                <span>{formatFileSize(item.size)}</span>
                <span className="font-mono">{item.permissionsRwx}</span>
              </>
            )}
          </div>
        </div>
        
        {item.type === 'directory' && 
         expandedDirs.has(item.path) && 
         item.children && 
         renderCompactView(item.children, level + 1)}
      </div>
    ));
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          ファイルを読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* View Mode Toggle */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">ファイル</h3>
        <div className="flex gap-1">
          {selectedProject && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                console.log('ファイル作成ボタンがクリックされました', 'selectedProject:', selectedProject);
                setShowCreateFile(true);
              }}
              title="新しいファイルを作成"
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant={viewMode === 'simple' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => changeViewMode('simple')}
            title="シンプル表示"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => changeViewMode('compact')}
            title="コンパクト表示"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'detailed' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => changeViewMode('detailed')}
            title="詳細表示"
          >
            <TableProperties className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Column Headers for Detailed View */}
      {viewMode === 'detailed' && files.length > 0 && (
        <div className="px-4 pt-2 pb-1 border-b border-border">
          <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-5">名前</div>
            <div className="col-span-2">サイズ</div>
            <div className="col-span-3">更新日時</div>
            <div className="col-span-2">権限</div>
          </div>
        </div>
      )}
      
      <ScrollArea className="flex-1 p-4">
        {!selectedProject ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3">
              <Folder className="w-6 h-6 text-muted-foreground" />
            </div>
            <h4 className="font-medium text-foreground mb-1">プロジェクトが選択されていません</h4>
            <p className="text-sm text-muted-foreground">
              左のサイドバーからプロジェクトを選択してください
            </p>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3">
              <Folder className="w-6 h-6 text-muted-foreground" />
            </div>
            <h4 className="font-medium text-foreground mb-1">ファイルが見つかりません</h4>
            <p className="text-sm text-muted-foreground">
              プロジェクトパスにアクセスできるかご確認ください
              <br />
              「+」ボタンから新しいファイルを作成できます
            </p>
          </div>
        ) : (
          <div className={viewMode === 'detailed' ? '' : 'space-y-1'}>
            {viewMode === 'simple' && renderFileTree(files)}
            {viewMode === 'compact' && renderCompactView(files)}
            {viewMode === 'detailed' && renderDetailedView(files)}
          </div>
        )}
      </ScrollArea>
      
      {/* Code Editor Modal */}
      {selectedFile && (
        <CodeEditor
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          projectPath={selectedFile.projectPath}
        />
      )}
      
      {/* Image Viewer Modal */}
      {selectedImage && (
        <ImageViewer
          file={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              ファイルを削除しますか？
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              <span className="font-medium">{showDeleteConfirm.name}</span> を削除します。
              この操作は元に戻すことができません。
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2"
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteFile(showDeleteConfirm.path)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700"
              >
                削除
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create File Dialog */}
      {console.log('showCreateFile状態:', showCreateFile)}
      {showCreateFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  新しいファイルを作成
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  作成するファイルの名前を入力してください（拡張子も含めて）
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateFile(false);
                  setNewFileName('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* File name input - more prominent */}
              <div className="space-y-2">
                <label className="block text-lg font-medium text-gray-900 dark:text-white">
                  📄 ファイル名を指定
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="ファイル名を入力してください（例: main.js, index.html, README.md）"
                    className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newFileName.trim()) {
                        createNewFile();
                      }
                    }}
                    autoFocus
                  />
                  {newFileName && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <span className="text-green-500 font-medium">✓</span>
                    </div>
                  )}
                </div>
                {newFileName && (
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    作成されるファイル: {newFileName}
                  </p>
                )}
              </div>
              
              {/* File type suggestions - more organized */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  💡 よく使われるファイルタイプ（クリックで入力）
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'JavaScript', file: 'main.js', icon: '🟨' },
                    { label: 'Python', file: 'main.py', icon: '🐍' },
                    { label: 'HTML', file: 'index.html', icon: '🌐' },
                    { label: 'CSS', file: 'style.css', icon: '🎨' },
                    { label: 'README', file: 'README.md', icon: '📝' },
                    { label: 'JSON', file: 'package.json', icon: '📦' }
                  ].map((suggestion) => (
                    <button
                      key={suggestion.file}
                      type="button"
                      onClick={() => setNewFileName(suggestion.file)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
                    >
                      <span>{suggestion.icon}</span>
                      <span className="font-medium">{suggestion.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                        {suggestion.file}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Custom file name examples */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  📚 カスタムファイル名の例
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'config.json',
                    'utils.js',
                    'styles.css',
                    'test.py',
                    'notes.txt',
                    'data.csv'
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setNewFileName(example)}
                      className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800 transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-8">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateFile(false);
                  setNewFileName('');
                }}
                className="px-6 py-2"
              >
                キャンセル
              </Button>
              <Button
                onClick={createNewFile}
                disabled={!newFileName.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {newFileName.trim() ? `「${newFileName}」を作成` : 'ファイルを作成'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTree;