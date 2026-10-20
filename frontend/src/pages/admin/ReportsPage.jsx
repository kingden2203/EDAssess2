import { useState, useEffect } from 'react';
import { BarChart2, Download, TrendingUp, Users, CheckCircle, Clock } from 'lucide-react';
import { reportApi } from '../../api/reportApi';

export default function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [examStats, setExamStats] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function loadReports() {
      try {
        const data = await reportApi.getReports();
        setSummary(data.summary);
        setExamStats(data.exam_stats);
      } catch (err) {
        console.error('Failed to load reports:', err);
      } finally {
        setFetching(false);
      }
    }
    loadReports();
  }, []);

  if (fetching) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading reports...</div>;
  }

  const summaryStats = summary ? [
    { label: 'Total Submissions', value: String(summary.total_submissions), icon: CheckCircle, color: 'green' },
    { label: 'Avg. Score',        value: `${summary.avg_score}%`,          icon: TrendingUp,  color: 'blue'  },
    { label: 'Active Students',   value: String(summary.active_students),  icon: Users,       color: 'purple'},
    { label: 'Avg. Duration',     value: `${summary.avg_duration_minutes}m`, icon: Clock,     color: 'amber' },
  ] : [];

  return (
    <>
      {/* Topbar */}
      <div className="admin-topbar">
        <div className="topbar-left">
          <h1>Reports</h1>
          <p>Performance analytics and submission summaries</p>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm">
            <Download size={13} /> Export PDF
          </button>
        </div>
      </div>

      <div className="admin-content">

        {/* Summary Stats */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {summaryStats.map(({ label, value, icon: Icon, color }) => (
            <div className="stat-card" key={label}>
              <div className="stat-card-header">
                <span className="stat-card-label">{label}</span>
                <div className={`stat-card-icon ${color}`}><Icon size={16} /></div>
              </div>
              <div className="stat-card-value">{value}</div>
            </div>
          ))}
        </div>

        {/* Exam Performance Table */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Exam Performance Summary</h3>
              <p>Per-exam breakdown of submissions, scores, and pass rates</p>
            </div>
            <div className="stat-card-icon blue"><BarChart2 size={15} /></div>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Submissions</th>
                <th>Avg. Score</th>
                <th>Pass Rate</th>
                <th>Avg. Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {examStats.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--admin-text-sub)' }}>
                    No submissions yet.
                  </td>
                </tr>
              ) : (
                examStats.map((row) => (
                  <tr key={row.exam}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{row.exam}</td>
                    <td>{row.submissions}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          height: 6, width: 80, background: 'var(--admin-border)',
                          borderRadius: 4, overflow: 'hidden'
                        }}>
                          <div style={{
                            height: '100%', width: `${row.avg_score}%`,
                            background: 'var(--admin-accent)', borderRadius: 4
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{row.avg_score}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${row.pass_rate >= 75 ? 'badge-success' : 'badge-warning'}`}>
                        {row.pass_rate}%
                      </span>
                    </td>
                    <td style={{ color: 'var(--admin-text-sub)', fontSize: 13 }}>{row.avg_duration}</td>
                    <td>
                      <span className="badge badge-neutral">Completed</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="save-bar">
            <p>Data reflects all submissions to date. Export for full records.</p>
          </div>
        </div>
      </div>
    </>
  );
}