import { useState, useEffect } from 'react';
import { getApiClient } from '@/shared/api-client';
import type { DashboardStats, AuditLog } from '@/shared/api-client';
import Logo from '../../assets/icons/pasteproof-48.png';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState(7);
  const [eventFilter, setEventFilter] = useState<string>('all');

  useEffect(() => {
    loadDashboard();
  }, [timeRange, eventFilter]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError('');
      const client = getApiClient();
      if (!client) {
        setError('Please configure your API key in Settings');
        return;
      }

      const [statsData, logsData] = await Promise.all([
        client.getStats(timeRange),
        client.getAuditLogs({
          limit: 100,
          eventType: eventFilter === 'all' ? undefined : eventFilter,
        }),
      ]);

      setStats(statsData);
      setLogs(logsData);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(`Failed to load dashboard: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '20px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <p>{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
        <p style={{ color: '#666' }}>No data available yet</p>
        <p style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
          Start using Paste Proof to see your privacy statistics
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div>
            <label
              style={{
                marginRight: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Time Range:
            </label>
            <select
              value={timeRange}
              onChange={e => setTimeRange(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          <div>
            <label
              style={{
                marginRight: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Event Type:
            </label>
            <select
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              <option value="all">All Events</option>
              <option value="detection">Detections Only</option>
              <option value="anonymization">Anonymizations Only</option>
              <option value="ai_scan">AI Scans Only</option>
            </select>
          </div>
        </div>

        <button
          onClick={loadDashboard}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <StatCard
          title="Total Detections"
          value={stats.total_detections}
          icon="🔍"
          color="#ff9800"
          subtitle="PII found"
        />
        <StatCard
          title="Anonymizations"
          value={stats.total_anonymizations}
          icon="🔒"
          color="#4caf50"
          subtitle="Data protected"
        />
        <StatCard
          title="AI Scans"
          value={stats.total_ai_scans}
          icon="🤖"
          color="#9c27b0"
          subtitle="Context analyzed"
        />
        <StatCard
          title="Protection Rate"
          value={
            stats.total_detections > 0
              ? Math.round(
                  (stats.total_anonymizations / stats.total_detections) * 100
                )
              : 0
          }
          icon={Logo}
          color="#2196f3"
          subtitle="% anonymized"
          isPercentage
        />
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {/* Most Common PII */}
        <ChartCard title="Most Common PII Types">
          {stats.most_common_pii.length > 0 ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {stats.most_common_pii.map((item, index) => (
                <BarItem
                  key={item.type}
                  label={item.type.replace(/_/g, ' ')}
                  value={item.count}
                  maxValue={stats.most_common_pii[0].count}
                  color={getPiiColor(item.type)}
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No PII detected yet" />
          )}
        </ChartCard>

        {/* Riskiest Domains */}
        <ChartCard title="Riskiest Domains">
          {stats.riskiest_domains.length > 0 ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {stats.riskiest_domains.map((item, index) => (
                <BarItem
                  key={item.domain}
                  label={item.domain}
                  value={item.count}
                  maxValue={stats.riskiest_domains[0].count}
                  color="#f44336"
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No detections yet" />
          )}
        </ChartCard>
      </div>

      {/* Detections Over Time */}
      <ChartCard title="Detections Over Time">
        {stats.detections_by_day.length > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              height: '200px',
              paddingTop: '20px',
            }}
          >
            {stats.detections_by_day.map(item => {
              const maxCount = Math.max(
                ...stats.detections_by_day.map(d => d.count),
                1
              );
              const height = (item.count / maxCount) * 180;

              return (
                <div
                  key={item.date}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#666',
                      minHeight: '16px',
                    }}
                  >
                    {item.count > 0 ? item.count : ''}
                  </div>
                  <div
                    title={`${item.count} detection${item.count !== 1 ? 's' : ''} on ${new Date(item.date).toLocaleDateString()}`}
                    style={{
                      width: '100%',
                      height: `${height}px`,
                      minHeight: item.count > 0 ? '4px' : '0px',
                      backgroundColor: '#ff9800',
                      borderRadius: '4px 4px 0 0',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = '#f57c00';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = '#ff9800';
                    }}
                  />
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#999',
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      height: '40px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {new Date(item.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No detection history yet" />
        )}
      </ChartCard>

      {/* Recent Activity Log */}
      <div
        style={{
          padding: '20px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginTop: '32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0 }}>Recent Activity</h3>
          <span style={{ fontSize: '14px', color: '#666' }}>
            Showing {logs.length} events
          </span>
        </div>

        {logs.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}
                >
                  <th
                    style={{
                      padding: '12px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#666',
                    }}
                  >
                    Time
                  </th>
                  <th
                    style={{
                      padding: '12px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#666',
                    }}
                  >
                    Event
                  </th>
                  <th
                    style={{
                      padding: '12px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#666',
                    }}
                  >
                    Domain
                  </th>
                  <th
                    style={{
                      padding: '12px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#666',
                    }}
                  >
                    PII Type
                  </th>
                  <th
                    style={{
                      padding: '12px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#666',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    style={{ borderBottom: '1px solid #f0f0f0' }}
                  >
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      {new Date(log.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      {getEventIcon(log.event_type)}{' '}
                      {log.event_type.replace(/_/g, ' ')}
                    </td>
                    <td
                      style={{
                        padding: '12px 8px',
                        fontSize: '13px',
                        color: '#666',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {log.domain}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: getPiiTypeColor(log.pii_type),
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                        }}
                      >
                        {log.pii_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      {log.was_anonymized ? (
                        <span style={{ color: '#4caf50' }}>✅ Anonymized</span>
                      ) : (
                        <span style={{ color: '#ff9800' }}>⚠️ Detected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No activity logged yet" />
        )}
      </div>

      {/* Export Button */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <button
          onClick={() => exportToCsv(logs)}
          disabled={logs.length === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: logs.length === 0 ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          📥 Export to CSV
        </button>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  isPercentage = false,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
  subtitle: string;
  isPercentage?: boolean;
}) {
  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '32px' }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            {title}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color }}>
            {value.toLocaleString()}
            {isPercentage ? '%' : ''}
          </div>
          <div style={{ fontSize: '11px', color: '#999' }}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: 'white',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{title}</h3>
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
      <div
        style={{
          minWidth: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: color,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600',
        }}
      >
        {rank}
      </div>
      <div
        style={{
          flex: 1,
          fontWeight: '500',
          fontSize: '14px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 2,
          height: '24px',
          backgroundColor: '#e0e0e0',
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
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
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          width: '50px',
          textAlign: 'right',
          fontWeight: '600',
          fontSize: '14px',
        }}
      >
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
function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'detection':
      return '🔍';
    case 'anonymization':
      return '🔒';
    case 'ai_scan':
      return '🤖';
    default:
      return '📝';
  }
}

function getPiiTypeColor(piiType: string): string {
  const colors: Record<string, string> = {
    CREDIT_CARD: '#f44336',
    SSN: '#e91e63',
    EMAIL: '#9c27b0',
    PHONE: '#673ab7',
    API_KEY: '#3f51b5',
    PASSWORD: '#d32f2f',
    ADDRESS: '#ff5722',
    EMPLOYEE_ID: '#ff9800',
    none: '#9e9e9e',
  };
  return colors[piiType] || '#ff9800';
}

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

function exportToCsv(logs: AuditLog[]) {
  const headers = ['Time', 'Event Type', 'Domain', 'PII Type', 'Anonymized'];
  const rows = logs.map(log => [
    new Date(log.timestamp).toISOString(),
    log.event_type,
    log.domain,
    log.pii_type,
    log.was_anonymized ? 'Yes' : 'No',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `paste-proof-audit-${Date.now()}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
