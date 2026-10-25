import { useState, useEffect } from 'react';
import { BarChart2, Download, TrendingUp, Users, CheckCircle, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
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

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const left = 14;
      let y = 20;

      doc.setFontSize(16);
      doc.text('EduAssess - Student Monitor Report', left, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(
        `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        left, y
      );
      y += 12;

      doc.setFontSize(13);
      doc.text('Summary', left, y);
      y += 8;
      doc.setFontSize(11);
      if (summary) {
        doc.text(`Total submissions: ${summary.total_submissions}`, left, y); y += 7;
        doc.text(`Average score: ${summary.avg_score}%`, left, y); y += 7;
        doc.text(`Active students: ${summary.active_students}`, left, y); y += 7;
        doc.text(`Average duration: ${summary.avg_duration_minutes} min`, left, y); y += 7;
      } else {
        doc.text('No summary available.', left, y); y += 7;
      }

      y += 6;
      doc.setFontSize(13);
      doc.text('Exam Performance Summary', left, y);
      y += 8;

      const cols = { exam: left, subs: 100, avg: 120, pass: 142, dur: 165 };
      const drawHeader = () => {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.text('Exam', cols.exam, y);
        doc.text('Submissions', cols.subs, y);
        doc.text('Avg. Score', cols.avg, y);
        doc.text('Pass Rate', cols.pass, y);
        doc.text('Avg. Duration', cols.dur, y);
        doc.setFont(undefined, 'normal');
        y += 3;
        doc.line(left, y, 196, y);
        y += 5;
      };
      drawHeader();

      if (examStats.length === 0) {
        doc.setFontSize(10);
        doc.text('No submissions yet.', left, y);
      } else {
        doc.setFontSize(9);
        examStats.forEach((row) => {
          const nameLines = doc.splitTextToSize(String(row.exam), 82);
          const rowHeight = nameLines.length * 5 + 2;
          if (y + rowHeight > 280) {
            doc.addPage();
            y = 20;
            drawHeader();
            doc.setFontSize(9);
          }
          doc.text(nameLines, cols.exam, y);
          doc.text(String(row.submissions), cols.subs, y);
          doc.text(`${row.avg_score}%`, cols.avg, y);
          doc.text(`${row.pass_rate}%`, cols.pass, y);
          doc.text(String(row.avg_duration), cols.dur, y);
          y += rowHeight;
        });
      }

      doc.save('student-monitor-report.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not create the PDF. Please try again.');
    }
  };

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
          <h1>Student Monitor</h1>
          <p>Performance analytics and submission summaries</p>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={handleExportPDF}>
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