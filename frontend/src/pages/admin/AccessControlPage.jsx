import { useState, useEffect } from 'react';
import { ShieldCheck, Save } from 'lucide-react';
import { accessApi } from '../../api/accessApi';
import useAuthStore from '../../auth/useAuthStore';

/**
 * Super admin:
 *   - "Global" tab: ang ceiling para sa lahat (Dept Admin / Instructor / Student).
 *   - "CIT" / "CTE" tabs: access control ng bawat department.
 * Department admin:
 *   - Sariling department lang. Puwede lang i-off ang features ng instructors/students niya,
 *     at hindi niya mabubuksan ang na-off ng super admin.
 */

const GLOBAL_ROLES = ['admin', 'instructor', 'user'];
const DEPT_ROLES   = ['instructor', 'user'];

const ROLE_LABELS = {
  admin:      'Dept Admin',
  instructor: 'Instructor',
  user:       'Student',
};

const DEFAULT_PERMISSIONS = {
  admin: {
    viewDashboard: true, manageUsers: true, configureExams: true, viewReports: true,
    manageAccess: true, manageSettings: true, takeExams: false, viewReviewModules: true,
  },
  instructor: {
    viewDashboard: true, manageUsers: false, configureExams: true, viewReports: true,
    manageAccess: false, manageSettings: false, takeExams: false, viewReviewModules: true,
  },
  user: {
    viewDashboard: true, manageUsers: false, configureExams: false, viewReports: false,
    manageAccess: false, manageSettings: false, takeExams: true, viewReviewModules: true,
  },
};

// Settings, Exam Config, at Activity Log ay laging super admin lang kaya walang toggle dito.
const PERMISSION_LABELS = {
  viewDashboard:     { label: 'View Dashboard',      desc: 'Access to the main dashboard page' },
  manageUsers:       { label: 'Manage Users',        desc: 'Create, edit, and deactivate accounts in their own department' },
  configureExams:    { label: 'Exams & Questions',   desc: 'Build exams and manage the question bank' },
  viewReports:       { label: 'Student Monitor',        desc: 'Monitor student performance and exam attempts' },
  manageAccess:      { label: 'Department Access Control', desc: 'Let department admins control what their instructors and students can use' },
  takeExams:         { label: 'Take Exams',          desc: 'Participate in assessments as a student' },
  viewReviewModules: { label: 'View Review Modules', desc: 'Access LET review materials' },
};

// Global matrix: mga cell na hindi puwedeng galawin
//   'on' = laging naka-on, 'off' = walang ganitong feature sa role, 'super' = super admin lang
const LOCKED = {
  viewDashboard:  { admin: 'on' },
  manageUsers:    { instructor: 'off', user: 'off' },
  configureExams: { admin: 'super', user: 'off' },
  viewReports:    { user: 'off' },
  manageAccess:   { instructor: 'off', user: 'off' },
  takeExams:      { admin: 'off', instructor: 'off' },
};

const ROLE_COLORS = {
  admin:      'var(--admin-accent)',
  instructor: 'var(--admin-info)',
  user:       'var(--admin-text-sub)',
};

const errMsg = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.detail || err.message || fallback;

export default function AccessControlPage() {
  const { user } = useAuthStore();
  const isSuper = user?.role === 'admin' && !user?.department;

  // 'GLOBAL' (super admin lang) | 'CIT' | 'CTE'
  const [scope, setScope] = useState(isSuper ? 'GLOBAL' : user?.department);

  const [globalPerms, setGlobalPerms] = useState(DEFAULT_PERMISSIONS);
  const [deptData, setDeptData]       = useState(null); // { department, permissions, ceiling, controllable }
  const [saved, setSaved]             = useState(false);
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(true);
  const [loadError, setLoadError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setFetching(true);
      setLoadError('');
      setSaved(false);
      try {
        if (scope === 'GLOBAL') {
          const data = await accessApi.getPermissions();
          if (!cancelled && data) setGlobalPerms(data);
        } else {
          const data = await accessApi.getDepartmentPermissions(isSuper ? scope : undefined);
          if (!cancelled) setDeptData(data);
        }
      } catch (err) {
        console.error('Failed to load permissions:', err);
        if (!cancelled) setLoadError(errMsg(err, 'Failed to load permissions.'));
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [scope, isSuper]);

  const toggleGlobal = (role, perm) => {
    setSaved(false);
    setGlobalPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role]?.[perm] },
    }));
  };

  const toggleDept = (role, perm) => {
    setSaved(false);
    setDeptData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [role]: { ...prev.permissions[role], [perm]: !prev.permissions[role][perm] },
      },
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (scope === 'GLOBAL') {
        await accessApi.savePermissions(globalPerms);
      } else {
        const data = await accessApi.saveDepartmentPermissions(scope, deptData.permissions);
        setDeptData(data);
      }
      setSaved(true);
    } catch (err) {
      alert(errMsg(err, 'Failed to save permissions.'));
    } finally {
      setLoading(false);
    }
  };

  const isGlobal = scope === 'GLOBAL';
  const roles = isGlobal ? GLOBAL_ROLES : DEPT_ROLES;

  // Mga row na ipapakita
  const rowKeys = isGlobal
    ? Object.keys(PERMISSION_LABELS)
    : Object.keys(PERMISSION_LABELS).filter((key) =>
        Object.values(deptData?.controllable || {}).some((keys) => keys.includes(key)));

  const renderGlobalCell = (role, key) => {
    const lock = LOCKED[key]?.[role];
    if (lock === 'off') {
      return <span style={{ color: 'var(--admin-text-muted)', fontSize: 12 }} title="Not available for this role">—</span>;
    }
    if (lock === 'super') {
      return <span className="badge badge-purple" title="Only the super admin can use this">Super only</span>;
    }
    return (
      <label className="toggle-switch" style={{ margin: '0 auto', display: 'block', width: 40 }}>
        <input
          type="checkbox"
          checked={lock === 'on' ? true : !!globalPerms[role]?.[key]}
          onChange={() => toggleGlobal(role, key)}
          disabled={lock === 'on'}
        />
        <span className="toggle-slider" />
      </label>
    );
  };

  const renderDeptCell = (role, key) => {
    const controllable = deptData.controllable?.[role]?.includes(key);
    if (!controllable) {
      return <span style={{ color: 'var(--admin-text-muted)', fontSize: 12 }} title="Not available for this role">—</span>;
    }
    if (!deptData.ceiling?.[role]?.[key]) {
      return <span className="badge badge-warning" title="Turned off by the super admin for everyone">Off by super admin</span>;
    }
    return (
      <label className="toggle-switch" style={{ margin: '0 auto', display: 'block', width: 40 }}>
        <input
          type="checkbox"
          checked={!!deptData.permissions[role]?.[key]}
          onChange={() => toggleDept(role, key)}
        />
        <span className="toggle-slider" />
      </label>
    );
  };

  const title = isGlobal ? 'Global Permissions' : `${scope} Access Control`;
  const subtitle = isGlobal
    ? 'The ceiling for everyone. Departments can only turn things off further, never on.'
    : `Choose what ${scope} instructors and students can use. This does not affect the other department.`;

  return (
    <>
      {/* Topbar */}
      <div className="admin-topbar">
        <div className="topbar-left">
          <h1>Access Control</h1>
          <p>
            {isSuper
              ? 'Control what each role and each department can use'
              : `Control what ${user?.department} instructors and students can use`}
          </p>
        </div>
        <div className="topbar-right">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={loading || fetching || !!loadError}
          >
            <Save size={13} />
            {loading ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="admin-content">

        {/* Scope tabs: super admin lang */}
        {isSuper && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { value: 'GLOBAL', label: 'Global' },
              { value: 'CIT', label: 'CIT' },
              { value: 'CTE', label: 'CTE' },
            ].map((t) => (
              <button
                key={t.value}
                className={`btn btn-sm ${scope === t.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setScope(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {loadError && (
          <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', fontSize: 13, color: 'var(--admin-danger)' }}>
            {loadError}
          </div>
        )}

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{title}</h3>
              <p>{subtitle}</p>
            </div>
            <div className="stat-card-icon purple">
              <ShieldCheck size={15} />
            </div>
          </div>

          {fetching ? (
            <div style={{ padding: 40, textAlign: 'center' }}>Loading permissions...</div>
          ) : (!isGlobal && !deptData) ? null : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '44%' }}>Permission</th>
                    {roles.map((role) => (
                      <th key={role} style={{ textAlign: 'center', color: ROLE_COLORS[role] }}>
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowKeys.map((key) => {
                    const { label, desc } = PERMISSION_LABELS[key];
                    return (
                      <tr key={key}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--admin-text-muted)' }}>{desc}</div>
                        </td>
                        {roles.map((role) => (
                          <td key={role} style={{ textAlign: 'center' }}>
                            {isGlobal ? renderGlobalCell(role, key) : renderDeptCell(role, key)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="save-bar">
            <p>
              {isGlobal
                ? 'Exam Config, Activity Log, and Settings are always super admin only. Changes apply on the next request.'
                : 'Changes apply to this department only, on the next request.'}
            </p>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={loading || fetching || !!loadError}
            >
              <Save size={13} />
              {loading ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}