// src/entrypoints/options/Dashboard.tsx
import { useState, useEffect } from 'react';
import { getApiClient } from '@/shared/api-client';
import type { DashboardStats, AuditLog } from '@/shared/api-client';
import Logo from '../../assets/icons/pasteproof-48.png';

type AnalyticsData = {
  totalDetections: number;
  detectionsByType: { type: string; count: number }[];
  recentDetections: {
    id: string;
    type: string;
    domain: string;
    timestamp: number;
    action: string;
  }[];
  topDomains: { domain: string; count: number }[];
};

export default function Dashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState(7);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [error, setError] = useState("");
  const [timeRange, setTimeRange] = useState<"7d" | "30d">("30d");

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError("");
      
      const authToken = await storage.getItem<string>('local:authToken');
      
      if (!authToken) {
        setError("Please sign in to view analytics");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/analytics?range=${timeRange}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': authToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load analytics: ${response.statusText}`);
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err: any) {
      console.error("Failed to load analytics:", err);
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #ddd',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #ff9800',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p style={{ color: '#666' }}>Loading analytics...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#ffebee',
        color: '#c62828',
        borderRadius: '8px',
        border: '1px solid #ef9a9a',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ fontWeight: '600', marginBottom: '4px' }}>Error loading analytics</div>
        <div>{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '2px dashed #ddd',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <h3 style={{ margin: '0 0 8px 0' }}>No analytics data yet</h3>
        <p style={{ color: '#666', margin: 0 }}>
          Start using Paste Proof to see your protection stats
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
        
        {/* Time Range Selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setTimeRange('7d')}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: timeRange === '7d' ? '#ff9800' : 'white',
              color: timeRange === '7d' ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: timeRange === '30d' ? '#ff9800' : 'white',
              color: timeRange === '30d' ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Last 30 Days
          </button>
          <button
            onClick={loadAnalytics}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats Card */}
      <div style={{
        padding: '24px',
        backgroundColor: '#fff3e0',
        borderRadius: '8px',
        border: '2px solid #ff9800',
        marginBottom: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', fontWeight: '700', color: '#ff9800', marginBottom: '8px' }}>
          {data.totalDetections.toLocaleString()}
        </div>
        <div style={{ fontSize: '16px', color: '#666' }}>
          Total Detections in the last {timeRange === '7d' ? '7' : '30'} days
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
        gap: '24px', 
        marginBottom: '24px' 
      }}>
        {/* Detections by Type */}
        <ChartCard title="Detections by Type">
          {data.detectionsByType.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.detectionsByType.map((item, index) => (
                <BarItem
                  key={item.type}
                  label={item.type.replace(/_/g, ' ')}
                  value={item.count}
                  maxValue={data.detectionsByType[0].count}
                  color={getPiiColor(item.type)}
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No PII detected yet" />
          )}
        </ChartCard>

        {/* Top Domains */}
        <ChartCard title="Most Protected Sites">
          {data.topDomains.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.topDomains.slice(0, 5).map((item, index) => (
                <BarItem
                  key={item.domain}
                  label={item.domain}
                  value={item.count}
                  maxValue={data.topDomains[0].count}
                  color="#f44336"
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No domains tracked yet" />
          )}
        </ChartCard>
      </div>

      {/* Recent Detections */}
      <ChartCard title="Recent Detections">
        {data.recentDetections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.recentDetections.map((detection) => (
              <div
                key={detection.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: detection.action === 'anonymized' ? '#4caf50' : 
                                      detection.action === 'blocked' ? '#f44336' : '#ff9800',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>
                      {detection.type.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {detection.domain}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      backgroundColor: detection.action === 'anonymized' ? '#e8f5e9' : 
                                      detection.action === 'blocked' ? '#ffebee' : '#fff3e0',
                      color: detection.action === 'anonymized' ? '#2e7d32' : 
                             detection.action === 'blocked' ? '#c62828' : '#e65100',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'capitalize',
                    }}
                  >
                    {detection.action}
                  </span>
                  <div style={{ fontSize: '12px', color: '#999', minWidth: '120px', textAlign: 'right' }}>
                    {new Date(detection.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No recent detections" />
        )}
      </ChartCard>
    </div>
  );
}

// Helper Components
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ 
      padding: '20px', 
      border: '1px solid #ddd', 
      borderRadius: '8px', 
      backgroundColor: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function BarItem({
  label,
  value,
  maxValue,
  color,
  rank,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  rank: number;
}) {
  const percentage = (value / maxValue) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ 
        minWidth: '24px', 
        height: '24px',
        borderRadius: '50%',
        backgroundColor: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: '600'
      }}>
        {rank}
      </div>
      <div style={{ 
        flex: 1, 
        fontWeight: '500', 
        fontSize: '13px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: '100px',
      }}>
        {label}
      </div>
      <div
        style={{
          flex: 2,
          height: '20px',
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
          minWidth: '100px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${percentage}%`,
            backgroundColor: color,
            borderRadius: '4px',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      <div style={{ 
        width: '40px', 
        textAlign: 'right', 
        fontWeight: '600', 
        fontSize: '13px' 
      }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
      <p>{message}</p>
    </div>
  );
}

// Helper functions
function getPiiColor(piiType: string): string {
  const colors: Record<string, string> = {
    CREDIT_CARD: '#f44336',
    SSN: '#e91e63',
    EMAIL: '#9c27b0',
    PHONE: '#673ab7',
    API_KEY: '#3f51b5',
    PASSWORD: '#d32f2f',
    ADDRESS: '#ff5722',
    EMPLOYEE_ID: '#ff9800',
  };
  return colors[piiType] || '#2196f3';
}
