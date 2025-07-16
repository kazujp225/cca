export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ')
}

// Get the correct API base URL based on environment
export function getApiBaseUrl() {
  // If we're on localhost, use the default ports
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // For production or other environments, use the same host but port 3001
  const protocol = window.location.protocol;
  return `${protocol}//${window.location.hostname}:3001`;
}

// Get the correct WebSocket URL based on environment
export function getWebSocketUrl() {
  // Always use the same logic as API base URL
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:3001';
  }
  
  // For production or other environments
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:3001`;
}