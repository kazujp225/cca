import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import SetupForm from './SetupForm';
import LoginForm from './LoginForm';
import { MessageSquare } from 'lucide-react';

const LoadingScreen = () => (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 flex items-center justify-center p-4">
    <div className="text-center">
      <div className="flex justify-center mb-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl blur-lg opacity-75 animate-pulse" />
          <div className="relative w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-2xl overflow-hidden">
            <img src="/icons/ZETTAILOGO.jpg" alt="ZETTAI" className="w-10 h-10 object-contain" />
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">ZETTAI Monitor</h1>
      <div className="flex items-center justify-center space-x-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <p className="text-gray-400 mt-2">読み込み中...</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (needsSetup) {
    return <SetupForm />;
  }

  if (!user) {
    return <LoginForm />;
  }

  return children;
};

export default ProtectedRoute;