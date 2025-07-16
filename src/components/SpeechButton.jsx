import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Settings } from 'lucide-react';
import { createSpeechRecognition, supportedLanguages, checkSpeechRecognitionSupport } from '../utils/speechRecognition';

export function SpeechButton({ 
  onTranscript, 
  onInterimTranscript, 
  className = '',
  size = 'default',
  showSettings = false,
  continuous = false,
  language = 'ja-JP',
  disabled = false 
}) {
  const [state, setState] = useState('idle'); // idle, listening, processing, error
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const menuRef = useRef(null);

  // 初期化とサポート確認
  useEffect(() => {
    const checkSupport = async () => {
      const support = checkSpeechRecognitionSupport();
      setIsSupported(support.isSupported && support.isSecureContext);
      
      if (!support.isSupported) {
        setError('このブラウザは音声認識をサポートしていません');
      } else if (!support.isSecureContext) {
        setError('音声認識にはHTTPS接続が必要です');
      }
    };
    
    checkSupport();
  }, []);

  // 音声認識の初期化
  useEffect(() => {
    if (!isSupported) return;

    const recognition = createSpeechRecognition({
      language: currentLanguage,
      continuous: continuous,
      interimResults: true,
      onResult: (result) => {
        setInterimText(result.interimTranscript);
        
        if (result.finalTranscript) {
          setFinalText(prev => prev + result.finalTranscript);
          if (onTranscript) {
            onTranscript(result.finalTranscript);
          }
        }
        
        if (onInterimTranscript && result.interimTranscript) {
          onInterimTranscript(result.interimTranscript);
        }
      },
      onError: (error) => {
        console.error('Speech recognition error:', error);
        setError(error.message);
        setState('error');
        
        // 一定時間後にエラーをクリア
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setError(null);
          setState('idle');
        }, 3000);
      },
      onStart: () => {
        setState('listening');
        setError(null);
        setInterimText('');
        setFinalText('');
      },
      onEnd: () => {
        setState('idle');
        setInterimText('');
        
        // 最終テキストがある場合の処理
        if (finalText && onTranscript) {
          onTranscript(finalText);
        }
      }
    });

    recognitionRef.current = recognition;

    return () => {
      if (recognition) {
        recognition.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isSupported, currentLanguage, continuous, onTranscript, onInterimTranscript, finalText]);

  // 言語メニューの外部クリック処理
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowLanguageMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 音声認識の開始/停止
  const toggleRecognition = () => {
    if (!isSupported || disabled) return;

    if (state === 'listening') {
      recognitionRef.current?.stop();
    } else if (state === 'idle') {
      const started = recognitionRef.current?.start();
      if (!started) {
        setError('音声認識の開始に失敗しました');
      }
    }
  };

  // 言語変更
  const changeLanguage = (langCode) => {
    setCurrentLanguage(langCode);
    setShowLanguageMenu(false);
    
    // 現在リスニング中の場合は再開
    if (state === 'listening') {
      recognitionRef.current?.stop();
      setTimeout(() => {
        recognitionRef.current?.start();
      }, 100);
    }
  };

  // ボタンサイズの設定
  const sizeClasses = {
    small: 'w-8 h-8',
    default: 'w-10 h-10',
    large: 'w-12 h-12'
  };

  const iconSizes = {
    small: 'w-4 h-4',
    default: 'w-5 h-5',
    large: 'w-6 h-6'
  };

  // ボタンの外観設定
  const getButtonAppearance = () => {
    if (!isSupported || disabled) {
      return {
        className: 'bg-gray-400 cursor-not-allowed',
        icon: <MicOff className={iconSizes[size]} />,
        disabled: true
      };
    }

    switch (state) {
      case 'listening':
        return {
          className: 'bg-red-500 hover:bg-red-600 animate-pulse',
          icon: <Mic className={`${iconSizes[size]} text-white`} />,
          disabled: false
        };
      case 'processing':
        return {
          className: 'bg-blue-500 hover:bg-blue-600',
          icon: <Volume2 className={`${iconSizes[size]} animate-pulse`} />,
          disabled: true
        };
      case 'error':
        return {
          className: 'bg-red-600 hover:bg-red-700',
          icon: <MicOff className={iconSizes[size]} />,
          disabled: false
        };
      default: // idle
        return {
          className: 'bg-gray-700 hover:bg-gray-600',
          icon: <Mic className={iconSizes[size]} />,
          disabled: false
        };
    }
  };

  const { className: buttonClass, icon, disabled: buttonDisabled } = getButtonAppearance();

  const currentLang = supportedLanguages.find(lang => lang.code === currentLanguage);

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center space-x-2">
        {/* メイン音声ボタン */}
        <button
          type="button"
          onClick={toggleRecognition}
          disabled={buttonDisabled}
          className={`
            ${sizeClasses[size]} ${buttonClass}
            rounded-full flex items-center justify-center
            text-white transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            dark:ring-offset-gray-800 touch-action-manipulation
            ${buttonDisabled ? 'opacity-75' : 'hover:opacity-90'}
          `}
          title={state === 'listening' ? '音声認識を停止' : '音声認識を開始'}
        >
          {icon}
        </button>

        {/* 設定ボタン */}
        {showSettings && (
          <button
            type="button"
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="w-8 h-8 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center text-white transition-colors"
            title="言語設定"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 言語選択メニュー */}
      {showLanguageMenu && (
        <div 
          ref={menuRef}
          className="absolute top-full mt-2 left-0 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 min-w-48"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">言語選択</h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {supportedLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`
                  w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700
                  ${currentLanguage === lang.code ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}
                `}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 animate-fade-in">
          {error}
        </div>
      )}

      {/* 音声認識中のビジュアル効果 */}
      {state === 'listening' && (
        <div className="absolute -inset-1 rounded-full border-2 border-red-500 animate-ping pointer-events-none" />
      )}

      {/* 中間結果表示 */}
      {interimText && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded border-l-2 border-blue-500 animate-fade-in">
          <span className="opacity-60">認識中:</span> {interimText}
        </div>
      )}

      {/* 現在の言語表示 */}
      {showSettings && currentLang && (
        <div className="absolute -bottom-6 left-0 text-xs text-gray-500 dark:text-gray-400">
          {currentLang.name}
        </div>
      )}
    </div>
  );
}