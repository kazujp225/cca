import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

console.log('main.jsx loaded');

// グローバルエラーハンドラー
window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', event => {
  console.error('Global error:', event.error);
});

// フォールバックUI表示関数
const showFallbackUI = (errorMessage) => {
  document.body.innerHTML = `
    <div style="
      min-height: 100vh; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      padding: 20px; 
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    ">
      <div style="
        background: white; 
        padding: 2rem; 
        border-radius: 12px; 
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); 
        max-width: 500px; 
        text-align: center;
      ">
        <div style="color: #dc2626; font-size: 48px; margin-bottom: 1rem;">⚠️</div>
        <h1 style="color: #1f2937; margin: 0 0 1rem 0; font-size: 1.5rem;">Claude Code UI</h1>
        <p style="color: #6b7280; margin: 0 0 1.5rem 0;">アプリケーションの起動に失敗しました</p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
          <code style="color: #dc2626; font-size: 0.875rem; word-break: break-all;">${errorMessage}</code>
        </div>
        <button 
          onclick="location.reload()" 
          style="
            background: #3b82f6; 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 6px; 
            font-size: 1rem; 
            cursor: pointer;
            transition: background 0.2s;
          "
          onmouseover="this.style.background='#2563eb'"
          onmouseout="this.style.background='#3b82f6'"
        >
          ページを再読み込み
        </button>
      </div>
    </div>
  `;
};

// アプリケーション起動関数
const startApp = () => {
  try {
    const rootElement = document.getElementById('root');
    console.log('Root element:', rootElement);
    
    if (!rootElement) {
      throw new Error('Root element not found');
    }
    
    const root = ReactDOM.createRoot(rootElement);
    console.log('React root created');
    
    // Fixed: Conditionally use StrictMode only in development
    // StrictMode causes double rendering which can trigger infinite loops
    const AppComponent = (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    
    root.render(
      process.env.NODE_ENV === 'development' ? 
        <React.StrictMode>{AppComponent}</React.StrictMode> : 
        AppComponent
    );
    
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Error rendering app:', error);
    showFallbackUI(error.message);
  }
};

// 確実にDOMが読み込まれてから実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}