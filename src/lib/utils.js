export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ')
}

// Get the correct API base URL based on environment
export function getApiBaseUrl() {
  const apiPort = import.meta.env.VITE_API_PORT || '5010';
  
  // If we're on localhost, use the default ports
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:${apiPort}`;
  }
  
  // For production or other environments, use the same host but configured port
  const protocol = window.location.protocol;
  return `${protocol}//${window.location.hostname}:${apiPort}`;
}

// Get the correct WebSocket URL based on environment
export function getWebSocketUrl() {
  const apiPort = import.meta.env.VITE_API_PORT || '5010';
  
  // Always use the same logic as API base URL
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `ws://localhost:${apiPort}`;
  }
  
  // For production or other environments
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:${apiPort}`;
}