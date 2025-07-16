import React from 'react';

function FloatingHelpButton({ onClick, isOpen }) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-4 sm:bottom-6 right-4 sm:right-6 w-12 sm:w-14 h-12 sm:h-14 bg-white border-2 border-gray-200 hover:border-gray-300 rounded-full shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-110 z-40 flex items-center justify-center group overflow-hidden ${
        isOpen ? 'rotate-45' : ''
      }`}
      title="Claude Code ヘルプ"
    >
      {isOpen ? (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      ) : (
        <div className="relative w-full h-full">
          <img 
            src="/icons/CHATBOTLOGO.png" 
            alt="AI Chatbot" 
            className="w-full h-full object-cover rounded-full"
          />
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full animate-pulse border border-white"></span>
        </div>
      )}
      
      {/* Tooltip on hover */}
      <div className={`absolute bottom-16 right-0 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${
        isOpen ? 'hidden' : ''
      }`}>
        Claude Code について質問する
      </div>
    </button>
  );
}

export default FloatingHelpButton;