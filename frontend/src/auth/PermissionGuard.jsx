import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import usePermissions from '../hooks/usePermissions';

const STUDENT_LINKS = [
  { key: 'viewDashboard',     to: '/dashboard',               label: 'Dashboard' },
  { key: 'takeExams',         to: '/dashboard/selection',     label: 'Take Exam' },
  { key: 'viewReviewModules', to: '/dashboard/review',        label: 'Review Modules' },
  { key: null,                to: '/dashboard/announcements', label: 'Announcements' },
];

/**
 * Hinaharang ang page kapag naka-off ang permission sa Access Control.
 * <PermissionGuard permission="takeExams"><ExamPage /></PermissionGuard>
 */
export default function PermissionGuard({ permission, children }) {
  const { loading, perms } = usePermissions();

  if (loading) return null;
  if (!perms || perms[permission] !== false) return children;

  const links = STUDENT_LINKS.filter((l) => l.key !== permission && (l.key === null || perms[l.key] !== false));

  return (
    <div className="user-content" style={{ paddingTop: 48 }}>
      <div className="user-card">
        <div className="user-card-body" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <ShieldOff size={40} style={{ color: 'var(--user-text-muted)', marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--user-text)' }}>
            This feature is turned off
          </h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--user-text-sub)' }}>
            Your administrator has disabled this feature for your account.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="exam-btn exam-btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}