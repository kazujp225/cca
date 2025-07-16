import React, { useState } from 'react';
import { api } from '../utils/api';

const UsageAnalytics = () => {
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsageData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/usage', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setUsageData(data);
    } catch (err) {
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('ja-JP').format(num);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    
    // Handle dates like "2025\n06-14"
    const cleanDate = dateStr.replace(/\n/g, '-');
    const parts = cleanDate.split('-');
    
    if (parts.length === 2) {
      return `${parts[0]}年${parts[1]}月`;
    } else if (parts.length === 3) {
      return `${parts[0]}年${parts[1]}月${parts[2]}日`;
    }
    
    return cleanDate;
  };

  const calculateDailyAverage = (data) => {
    if (!data || data.length === 0) return 0;
    const totalCost = data.reduce((sum, item) => sum + item.cost, 0);
    return totalCost / data.length;
  };

  const getRecentUsage = (data) => {
    if (!data || data.length === 0) return [];
    return data.slice(-7); // 最新7日分
  };

  const getUsageStats = (data) => {
    if (!data || data.length === 0) return { highest: 0, lowest: 0, average: 0 };
    
    const costs = data.map(item => item.cost);
    return {
      highest: Math.max(...costs),
      lowest: Math.min(...costs),
      average: costs.reduce((sum, cost) => sum + cost, 0) / costs.length
    };
  };

  return (
    <div className="usage-analytics">
      <div className="analytics-header">
        <h2>📊 Claude Code 使用量分析</h2>
        <button 
          onClick={fetchUsageData}
          disabled={loading}
          className="fetch-button"
        >
          {loading ? '取得中...' : '使用量を取得'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {usageData && (
        <div className="analytics-content">
          {/* 総合統計カード */}
          <div className="stats-cards">
            <div className="stat-card total">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <h3>総使用料金</h3>
                <div className="stat-value">{formatCurrency(usageData.total?.cost || 0)}</div>
              </div>
            </div>
            
            <div className="stat-card input">
              <div className="stat-icon">📥</div>
              <div className="stat-content">
                <h3>総入力トークン</h3>
                <div className="stat-value">{formatNumber(usageData.total?.input || 0)}</div>
              </div>
            </div>
            
            <div className="stat-card output">
              <div className="stat-icon">📤</div>
              <div className="stat-content">
                <h3>総出力トークン</h3>
                <div className="stat-value">{formatNumber(usageData.total?.output || 0)}</div>
              </div>
            </div>
            
            <div className="stat-card average">
              <div className="stat-icon">📊</div>
              <div className="stat-content">
                <h3>1日平均料金</h3>
                <div className="stat-value">{formatCurrency(calculateDailyAverage(usageData.data))}</div>
              </div>
            </div>
          </div>

          {/* 詳細統計 */}
          <div className="usage-insights">
            <h3>📈 使用量統計</h3>
            <div className="insights-grid">
              {(() => {
                const stats = getUsageStats(usageData.data);
                return (
                  <>
                    <div className="insight-item">
                      <span className="insight-label">最高料金日:</span>
                      <span className="insight-value">{formatCurrency(stats.highest)}</span>
                    </div>
                    <div className="insight-item">
                      <span className="insight-label">最低料金日:</span>
                      <span className="insight-value">{formatCurrency(stats.lowest)}</span>
                    </div>
                    <div className="insight-item">
                      <span className="insight-label">平均料金:</span>
                      <span className="insight-value">{formatCurrency(stats.average)}</span>
                    </div>
                    <div className="insight-item">
                      <span className="insight-label">使用日数:</span>
                      <span className="insight-value">{usageData.data?.length || 0}日</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* 最新の使用履歴 */}
          <div className="recent-usage">
            <h3>📅 最新の使用履歴</h3>
            <div className="usage-list">
              {getRecentUsage(usageData.data).map((item, index) => (
                <div key={index} className="usage-item">
                  <div className="usage-date">{formatDate(item.date)}</div>
                  <div className="usage-details">
                    <div className="usage-models">
                      {item.models.length > 0 ? item.models.join(', ') : 'No models'}
                    </div>
                    <div className="usage-tokens">
                      入力: {formatNumber(item.input)} | 出力: {formatNumber(item.output)}
                    </div>
                  </div>
                  <div className="usage-cost">{formatCurrency(item.cost)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* フル履歴テーブル */}
          <div className="full-history">
            <h3>📋 全履歴</h3>
            <div className="table-container">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>モデル</th>
                    <th>入力トークン</th>
                    <th>出力トークン</th>
                    <th>料金</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.data?.map((item, index) => (
                    <tr key={index}>
                      <td>{formatDate(item.date)}</td>
                      <td className="models-cell">
                        {item.models.length > 0 ? (
                          <div className="models-list">
                            {item.models.map((model, i) => (
                              <span key={i} className="model-tag">{model}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="no-models">-</span>
                        )}
                      </td>
                      <td className="number-cell">{formatNumber(item.input)}</td>
                      <td className="number-cell">{formatNumber(item.output)}</td>
                      <td className="cost-cell">{formatCurrency(item.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="update-info">
            <small>最終更新: {new Date(usageData.timestamp).toLocaleString('ja-JP')}</small>
          </div>
        </div>
      )}

      {!usageData && !loading && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>使用量データを取得するには、上の「使用量を取得」ボタンをクリックしてください。</p>
        </div>
      )}
    </div>
  );
};

export default UsageAnalytics;