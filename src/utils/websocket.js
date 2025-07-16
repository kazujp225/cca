import { useState, useEffect, useRef } from 'react';
import { getWebSocketUrl } from '../lib/utils';

export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const connect = async () => {
    try {
      // Get authentication token
      const token = localStorage.getItem('auth-token');
      if (!token) {
        console.warn('No authentication token found for WebSocket connection');
        return;
      }
      
      // Get WebSocket base URL
      const wsBaseUrl = getWebSocketUrl();
      
      // Include token in WebSocket URL as query parameter
      const wsUrl = `${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`;
      console.log('WebSocket connecting to:', wsUrl);
      console.log('WebSocket base URL:', wsBaseUrl);
      console.log('Token exists:', !!token);
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('WebSocket connected successfully!');
        setIsConnected(true);
        setWs(websocket);
        // Expose WebSocket globally for server management
        window.claudeWs = websocket;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages(prev => [...prev, data]);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        setIsConnected(false);
        setWs(null);
        // Clear global WebSocket reference
        if (window.claudeWs === websocket) {
          window.claudeWs = null;
        }
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        const errorMsg = `WebSocket failed to connect to ${wsUrl}`;
        console.error(errorMsg);
        console.error('Please check if:');
        console.error('1. The backend server is running on port 6666');
        console.error('2. No firewall is blocking port 6666');
        console.error('3. You are logged in (check for auth token)');
        console.error('4. The WebSocket endpoint /ws is accessible');
        console.error('Current token status:', token ? 'Token exists' : 'No token found');
        console.error('Token length:', token ? token.length : 0);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  };

  const sendMessage = (message) => {
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  };

  return {
    ws,
    sendMessage,
    messages,
    isConnected
  };
}