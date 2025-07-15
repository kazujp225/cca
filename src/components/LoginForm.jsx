import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Eye, EyeOff, Sparkles, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const LoginForm = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const { login } = useAuth();

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    
    setIsLoading(true);
    
    const result = await login(username, password);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white flex items-center justify-center p-4">
      {/* Modern Geometric Background */}
      <div className="absolute inset-0">
        {/* Subtle gradient orbs */}
        <div className="absolute top-20 -left-20 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-float" />
        <div className="absolute top-40 -right-20 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-20 left-40 w-96 h-96 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-float" style={{ animationDelay: '4s' }} />
        
        {/* Geometric pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23000000' stroke-width='0.5' opacity='0.1'%3E%3Ccircle cx='50' cy='50' r='40'/%3E%3Ccircle cx='50' cy='50' r='30'/%3E%3Ccircle cx='50' cy='50' r='20'/%3E%3Ccircle cx='50' cy='50' r='10'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px'
        }} />
      </div>

      {/* Floating elements */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-gray-200 rounded-full animate-float-slow"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 10}s`,
              animationDuration: `${15 + Math.random() * 10}s`
            }}
          />
        ))}
      </div>
      <div className="w-full max-w-md relative z-10">
        {/* Glassmorphism Card */}
        <div className="relative">
          {/* Subtle shadow for depth */}
          <div className="absolute inset-0 bg-gray-100 rounded-3xl blur-xl opacity-50 transform translate-y-4" />
          
          <div className="relative bg-white rounded-3xl shadow-xl p-10 space-y-8">
            {/* Logo and Title */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="relative w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300 hover:shadow-xl border border-gray-100">
                    <img src="/icons/ZETTAILOGO.jpg" alt="ZETTAI" className="w-20 h-20 object-contain" />
                  </div>
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-light text-gray-900 mb-2 tracking-tight">
                  Welcome to <span className="font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">ZETTAI</span>
                </h1>
                <p className="text-gray-500 text-base">
                  Please sign in to continue
                </p>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <div className="h-px w-12 bg-gray-300" />
                <Shield className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-400 uppercase tracking-wider">Secure Access</p>
                <Shield className="w-4 h-4 text-gray-400" />
                <div className="h-px w-12 bg-gray-300" />
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={cn(
                      "w-full pl-10 pr-3 py-3.5 bg-gray-50 border border-gray-200 rounded-xl",
                      "text-gray-900 placeholder-gray-400",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white",
                      "transition-all duration-200",
                      "hover:border-gray-300"
                    )}
                    placeholder="Enter your username"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "w-full pl-10 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl",
                      "text-gray-900 placeholder-gray-400",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white",
                      "transition-all duration-200",
                      "hover:border-gray-300"
                    )}
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl animate-in fade-in-0 slide-in-from-top-1">
                  <p className="text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full relative group",
                  "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700",
                  "text-white font-medium py-3.5 px-4 rounded-xl",
                  "transition-all duration-200 transform hover:-translate-y-0.5",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
                  "shadow-lg hover:shadow-xl"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-purple-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <div className="relative flex items-center justify-center">
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </div>
              </button>

            </form>

            {/* Footer */}
            <div className="text-center pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Protected by enterprise-grade security
              </p>
              <div className="flex items-center justify-center mt-4 space-x-4">
                <span className="text-xs text-gray-400">© 2024 ZETTAI</span>
                <span className="text-gray-300">•</span>
                <a href="#" className="text-xs text-gray-600 hover:text-gray-800 transition-colors">Privacy</a>
                <span className="text-gray-300">•</span>
                <a href="#" className="text-xs text-gray-600 hover:text-gray-800 transition-colors">Terms</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;