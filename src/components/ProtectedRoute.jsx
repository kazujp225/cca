import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import SetupForm from './SetupForm';
import LoginForm from './LoginForm';
import { MessageSquare } from 'lucide-react';

const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="text-center">
      <div className="flex justify-center mb-4">
        <div className="relative">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-2xl overflow-hidden">
            <img src="/icons/ZETTAILOGO.jpg" alt="ZETTAI" className="w-10 h-10 object-contain" />
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">ZETTAI Monitor</h1>
      <div className="flex items-center justify-center space-x-2">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <p className="text-muted-foreground mt-2">読み込み中...</p>
    </div>
  </div>
);

// Fixed: Add timeout handling to prevent infinite loading
const TimeoutScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="max-w-md text-center">
      <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">接続タイムアウト</h2>
      <p className="text-muted-foreground mb-6">サーバーへの接続がタイムアウトしました。オフラインモードで継続できます。</p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
      >
        再試行
      </button>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, isLoading, needsSetup, isTimeout } = useAuth();

  // Fixed: Always call useEffect at the top level, regardless of conditions
  React.useEffect(() => {
    console.log('[ProtectedRoute] Auth state:', { user, isLoading, needsSetup, isTimeout });
  }, [user, isLoading, needsSetup, isTimeout]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isTimeout) {
    return <TimeoutScreen />;
  }

  if (needsSetup) {
    return <SetupForm />;
  }

  if (!user && !isTimeout) {
    return <LoginForm />;
  }

  return children;
};

export default ProtectedRoute;