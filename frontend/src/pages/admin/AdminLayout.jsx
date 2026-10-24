import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, ShieldCheck,
  BarChart2, Settings, LogOut, GraduationCap, FolderOpen, History,
} from 'lucide-react';
import useAuthStore from '../../auth/useAuthStore';
import authApi from '../../api/authApi';
import '../../styles/dept-theme.css';
import './admin.css';

// Bawat nav item, konektado sa permission key na nagpapakita/nagtatago nito.
// permKey: null = walang toggle na naka-tie dito.
// superOnly: super admin lang (laging nakatago sa department admins).
// Access Control: super admin = global + bawat department; department admin = sariling department lang
// (kung hindi ito na-off ng super admin).
const NAV_ITEMS = [
  { to: '/admin',          label: 'Dashboard',      icon: LayoutDashboard, end: true, permKey: 'viewDashboard' },
  { to: '/admin/users',    label: 'Users',          icon: Users,           permKey: 'manageUsers' },
  { to: '/admin/modules',  label: 'Review Modules', icon: FolderOpen,      permKey: 'viewReviewModules' },
  { to: '/admin/reports',  label: 'Student Monitor',        icon: BarChart2,       permKey: 'viewReports' },
  { to: '/admin/exams',    label: 'Exam Config',    icon: FileText,        permKey: 'configureExams', superOnly: true },
  { to: '/admin/access',   label: 'Access Control', icon: ShieldCheck,     permKey: 'manageAccess' },
  { to: '/admin/activity', label: 'Activity Log',   icon: History,         permKey: null,             superOnly: true },
  { to: '/admin/settings', label: 'Settings',       icon: Settings,        permKey: 'manageSettings', superOnly: true },
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [perms, setPerms] = useState(null); // null = loading pa; {} = walang laman

  // Admin na walang department = super admin. Dapat nasa loob ng component (galing sa `user`).
  const isSuper = user?.role === 'admin' && !user?.department;
  const dept = isSuper ? null : user?.department || null; // 'CIT' | 'CTE' | null

  useEffect(() => {
    async function loadPerms() {
      try {
        const data = await authApi.getMyPermissions();
        setPerms(data || {});
      } catch (err) {
        console.error('Failed to load permissions:', err);
        setPerms({}); // fail-safe: itago lahat ng may permKey kung hindi na-fetch
      }
    }
    loadPerms();
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // still logout client-side even if server fails
    } finally {
      logout();
      navigate('/', { replace: true });
    }
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  const roleLabel = isSuper ? 'Super Admin' : `${dept || ''} Admin`.trim();
  const panelLabel = isSuper ? 'Super Admin Panel' : `${dept || 'Admin'} Admin Panel`;

  // Super admin: lahat ng item, hindi sakop ng matrix.
  // Department admin: itago ang superOnly + ang mga naka-off sa Access Control.
  // Habang loading pa ang perms, ituring munang bisible (iwas flash-of-empty-sidebar).
  const visibleNavItems = NAV_ITEMS.filter(({ permKey, superOnly }) => {
    if (isSuper) return true;
    if (superOnly) return false;
    if (!permKey) return true;
    if (perms === null) return true;
    return perms[permKey] !== false;
  });

  return (
    <div
      className={`admin-shell${dept ? ' dept-shell' : ''}`}
      data-dept={dept || undefined}
    >
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <GraduationCap size={17} />
          </div>
          <div className="sidebar-brand-text">
            <span>EduAssess</span>
            <span>{panelLabel}</span>
          </div>
        </div>

        {/* Nav */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">Main Menu</div>
          <ul className="sidebar-nav">
            {visibleNavItems.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `sidebar-nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* User Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.name || 'Administrator'}</span>
              <span className="sidebar-user-role">{roleLabel}</span>
            </div>
            <button
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}