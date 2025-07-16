/**
 * Web Speech API を使用したリアルタイム音声認識ユーティリティ
 * 
 * Features:
 * - リアルタイム音声認識
 * - 継続的なリスニング
 * - 日本語・英語対応
 * - 音声認識の信頼度判定
 * - エラーハンドリング
 */

export class SpeechRecognition {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.language = 'ja-JP';
    this.continuous = false;
    this.interimResults = true;
    
    // コールバック関数
    this.onResult = null;
    this.onError = null;
    this.onStart = null;
    this.onEnd = null;
    
    this.init();
  }

  init() {
    // Web Speech API のサポート確認
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser');
      this.isSupported = false;
      return;
    }

    this.recognition = new SpeechRecognition();
    this.isSupported = true;
    
    // 基本設定
    this.recognition.lang = this.language;
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;
    this.recognition.maxAlternatives = 1;

    // イベントハンドラー設定
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStart) this.onStart();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (this.onResult) {
        this.onResult({
          finalTranscript,
          interimTranscript,
          confidence: event.results[event.results.length - 1][0].confidence
        });
      }
    };

    this.recognition.onerror = (event) => {
      const errorMessages = {
        'no-speech': '音声が検出されませんでした',
        'audio-capture': 'オーディオキャプチャに失敗しました',
        'not-allowed': 'マイクへのアクセスが拒否されました',
        'network': 'ネットワークエラーが発生しました',
        'service-not-allowed': '音声認識サービスが利用できません',
        'bad-grammar': '文法エラーが発生しました',
        'language-not-supported': '指定された言語はサポートされていません'
      };

      const message = errorMessages[event.error] || `音声認識エラー: ${event.error}`;
      
      if (this.onError) {
        this.onError({ error: event.error, message });
      }
    };
  }

  start() {
    if (!this.isSupported) {
      if (this.onError) {
        this.onError({ 
          error: 'not-supported', 
          message: 'Web Speech API はこのブラウザでサポートされていません' 
        });
      }
      return false;
    }

    if (this.isListening) {
      return false;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      if (this.onError) {
        this.onError({ 
          error: 'start-failed', 
          message: '音声認識の開始に失敗しました' 
        });
      }
      return false;
    }
  }

  stop() {
    if (!this.isSupported || !this.isListening) {
      return false;
    }

    try {
      this.recognition.stop();
      return true;
    } catch (error) {
      if (this.onError) {
        this.onError({ 
          error: 'stop-failed', 
          message: '音声認識の停止に失敗しました' 
        });
      }
      return false;
    }
  }

  abort() {
    if (!this.isSupported || !this.isListening) {
      return false;
    }

    try {
      this.recognition.abort();
      return true;
    } catch (error) {
      if (this.onError) {
        this.onError({ 
          error: 'abort-failed', 
          message: '音声認識の中止に失敗しました' 
        });
      }
      return false;
    }
  }

  // 設定メソッド
  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  setContinuous(continuous) {
    this.continuous = continuous;
    if (this.recognition) {
      this.recognition.continuous = continuous;
    }
  }

  setInterimResults(interimResults) {
    this.interimResults = interimResults;
    if (this.recognition) {
      this.recognition.interimResults = interimResults;
    }
  }

  // コールバック設定
  setOnResult(callback) {
    this.onResult = callback;
  }

  setOnError(callback) {
    this.onError = callback;
  }

  setOnStart(callback) {
    this.onStart = callback;
  }

  setOnEnd(callback) {
    this.onEnd = callback;
  }
}

// 便利なヘルパー関数
export function createSpeechRecognition(options = {}) {
  const recognition = new SpeechRecognition();
  
  if (options.language) recognition.setLanguage(options.language);
  if (options.continuous !== undefined) recognition.setContinuous(options.continuous);
  if (options.interimResults !== undefined) recognition.setInterimResults(options.interimResults);
  
  if (options.onResult) recognition.setOnResult(options.onResult);
  if (options.onError) recognition.setOnError(options.onError);
  if (options.onStart) recognition.setOnStart(options.onStart);
  if (options.onEnd) recognition.setOnEnd(options.onEnd);
  
  return recognition;
}

// 利用可能な言語リスト
export const supportedLanguages = [
  { code: 'ja-JP', name: '日本語' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'zh-CN', name: '中文 (简体)' },
  { code: 'zh-TW', name: '中文 (繁體)' },
  { code: 'ko-KR', name: '한국어' },
  { code: 'es-ES', name: 'Español' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'de-DE', name: 'Deutsch' },
  { code: 'it-IT', name: 'Italiano' },
  { code: 'ru-RU', name: 'Русский' }
];

// ブラウザサポート確認
export function checkSpeechRecognitionSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  return {
    isSupported: !!SpeechRecognition,
    isSecureContext: window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost',
    hasPermission: navigator.permissions ? navigator.permissions.query({ name: 'microphone' }) : null
  };
}