import React, { useState, useEffect } from 'react';

function HelpChatSettings({ isOpen, onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    // Load saved API key from localStorage
    const savedApiKey = localStorage.getItem('help-chat-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, [isOpen]);

  const validateApiKey = async (key) => {
    if (!key.startsWith('sk-')) {
      return { valid: false, message: 'APIキーは "sk-" で始まる必要があります' };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });

      if (response.ok) {
        return { valid: true, message: 'APIキーが正常に検証されました' };
      } else if (response.status === 401) {
        return { valid: false, message: 'APIキーが無効です' };
      } else {
        return { valid: false, message: 'APIキーの検証に失敗しました' };
      }
    } catch (error) {
      return { valid: false, message: 'ネットワークエラー: 検証できませんでした' };
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      // Clear the saved API key
      localStorage.removeItem('help-chat-api-key');
      setValidationMessage('APIキーがクリアされました');
      setTimeout(() => onClose(), 1500);
      return;
    }

    setIsValidating(true);
    setValidationMessage('APIキーを検証中...');

    const validation = await validateApiKey(apiKey.trim());
    
    if (validation.valid) {
      localStorage.setItem('help-chat-api-key', apiKey.trim());
      setValidationMessage(validation.message);
      setTimeout(() => onClose(), 1500);
    } else {
      setValidationMessage(validation.message);
    }
    
    setIsValidating(false);
  };

  const handleClear = () => {
    setApiKey('');
    localStorage.removeItem('help-chat-api-key');
    setValidationMessage('APIキーがクリアされました');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ヘルプチャット設定</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">OpenAI APIキーを設定</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              OpenAI APIキー
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              APIキーは <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-700 underline">OpenAI Platform</a> で取得できます
            </p>
          </div>

          {/* Validation Message */}
          {validationMessage && (
            <div className={`p-3 rounded-lg text-sm ${
              validationMessage.includes('正常') || validationMessage.includes('クリア') 
                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            }`}>
              {validationMessage}
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">APIキーについて：</p>
                <ul className="space-y-1 text-xs">
                  <li>• APIキーはブラウザにのみ保存されます</li>
                  <li>• より詳細で正確な回答が得られます</li>
                  <li>• 設定しなくても基本機能は利用可能です</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleClear}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            クリア
          </button>
          <button
            onClick={handleSave}
            disabled={isValidating}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {isValidating ? '検証中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HelpChatSettings;