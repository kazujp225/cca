import { useState, useEffect, useRef } from 'react';
import { getWebSocketUrl } from '../lib/utils';

export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const reconnectTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const isConnectingRef = useRef(false);
  const connectionAttemptsRef = useRef(0);
  const maxConnectionAttempts = 2; // 最大接続試行回数を削減

  useEffect(() => {
    // 認証トークンがない場合は接続を試行しない
    const token = localStorage.getItem('auth-token');
    if (!token) {
      console.log('No auth token found, skipping WebSocket connection');
      setConnectionStatus('no-token');
      return;
    }

    // 初期接続にタイムアウトを設定し、アプリケーションの表示をブロックしないようにする
    const initTimeout = setTimeout(() => {
      if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
        console.warn('WebSocket初期接続がタイムアウトしました - アプリケーションは正常に動作します');
        setConnectionStatus('timeout');
        isConnectingRef.current = false;
      }
    }, 3000); // 3秒でタイムアウト

    // 少し遅延させてからWebSocket接続を開始（認証完了を待つ）
    const connectDelay = setTimeout(() => {
      connect();
    }, 500);
    
    return () => {
      clearTimeout(initTimeout);
      clearTimeout(connectDelay);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close(1000, 'Component unmounting');
        } catch (error) {
          console.warn('WebSocket close error:', error);
        }
      }
      isConnectingRef.current = false;
    };
  }, []);

  const connect = async () => {
    // 同時接続試行を防止
    if (isConnectingRef.current) {
      console.log('WebSocket connection already in progress, skipping...');
      return;
    }

    // 最大試行回数に達した場合は接続を停止
    if (connectionAttemptsRef.current >= maxConnectionAttempts) {
      console.log('WebSocket接続の最大試行回数に達しました - リアルタイム更新は無効ですが、アプリは正常に動作します');
      setConnectionStatus('failed');
      return;
    }
    
    try {
      isConnectingRef.current = true;
      setConnectionStatus('connecting');
      connectionAttemptsRef.current += 1;
      
      // 認証トークンを取得
      const token = localStorage.getItem('auth-token');
      if (!token) {
        console.warn('No authentication token found for WebSocket connection');
        isConnectingRef.current = false;
        setConnectionStatus('no-token');
        return;
      }
      
      // WebSocket URLを取得
      const wsBaseUrl = getWebSocketUrl();
      const wsUrl = `${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`;
      
      console.log(`WebSocket接続試行 ${connectionAttemptsRef.current}/${maxConnectionAttempts}`);
      const websocket = new WebSocket(wsUrl);
      wsRef.current = websocket;

      // 接続タイムアウトを設定（5秒）
      const connectTimeout = setTimeout(() => {
        if (websocket.readyState === WebSocket.CONNECTING) {
          console.warn('WebSocket接続がタイムアウトしました');
          websocket.close();
          isConnectingRef.current = false;
          setConnectionStatus('timeout');
        }
      }, 5000);

      websocket.onopen = () => {
        clearTimeout(connectTimeout);
        console.log('WebSocket connected successfully!');
        setIsConnected(true);
        setWs(websocket);
        setConnectionStatus('connected');
        isConnectingRef.current = false;
        connectionAttemptsRef.current = 0; // 成功時にリセット
        
        // グローバル参照を設定（サーバー管理用）
        window.claudeWs = websocket;
      };

      websocket.onmessage = (event) => {
        try {
          // メッセージデータをクリーンアップしてからパース
          const cleanData = event.data.replace(/\u0000/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
          if (!cleanData.trim()) return;
          
          const data = JSON.parse(cleanData);
          setMessages(prev => [...prev, data]);
        } catch (error) {
          console.error('WebSocketメッセージのパースエラー:', error);
          // パースエラーはアプリケーションを停止させない
        }
      };

      websocket.onclose = (event) => {
        clearTimeout(connectTimeout);
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setWs(null);
        wsRef.current = null;
        isConnectingRef.current = false;
        setConnectionStatus('disconnected');
        
        // グローバル参照をクリア
        if (window.claudeWs === websocket) {
          window.claudeWs = null;
        }
        
        // 再接続条件を厳格化
        const shouldReconnect = 
          event.code !== 1000 && // 正常クローズではない
          event.code !== 1001 && // ブラウザがタブを閉じた等ではない
          event.code !== 1005 && // タイムアウトでのクローズ
          connectionAttemptsRef.current < maxConnectionAttempts &&
          localStorage.getItem('auth-token'); // トークンがある
        
        if (shouldReconnect) {
          const delay = Math.min(2000 * connectionAttemptsRef.current, 5000); // より短い間隔
          console.log(`WebSocket再接続を${delay}ms後に実行 (${connectionAttemptsRef.current + 1}/${maxConnectionAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.log('WebSocket再接続を停止しました - アプリケーションは引き続き利用できます');
          setConnectionStatus('failed');
        }
      };

      websocket.onerror = (error) => {
        clearTimeout(connectTimeout);
        console.error('WebSocket error:', error);
        isConnectingRef.current = false;
        setConnectionStatus('error');
        // WebSocketエラーでアプリケーションは停止しない
      };

    } catch (error) {
      console.error('WebSocket connection failed:', error);
      isConnectingRef.current = false;
      setConnectionStatus('failed');
      // WebSocketエラーでアプリケーションは停止しない
    }
  };

  const sendMessage = (message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('メッセージ送信エラー:', error);
        return false;
      }
    } else {
      console.warn('WebSocket接続がありません - メッセージを送信できませんでした');
      return false;
    }
  };

  return {
    ws,
    messages,
    isConnected,
    connectionStatus,
    sendMessage
  };
}