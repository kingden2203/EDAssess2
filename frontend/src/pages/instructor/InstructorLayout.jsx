import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList,
  Users, Megaphone, LogOut, GraduationCap, FolderOpen
} from 'lucide-react';
import useAuthStore from '../../auth/useAuthStore';
import authApi from '../../api/authApi';
import ProfileModal from '../../components/ProfileModal';
import './instructor.css';
import '../../styles/dept-theme.css'; 


const NAV_ITEMS = [
  { to: '/instructor',               label: 'Dashboard',       icon: LayoutDashboard, end: true, permKey: 'viewDashboard' },
  { to: '/instructor/questions',     label: 'Question Bank',   icon: BookOpen,        permKey: 'configureExams' },
  { to: '/instructor/exams',         label: 'Exam Builder',    icon: ClipboardList,   permKey: 'configureExams' },
  { to: '/instructor/modules',       label: 'Review Modules',  icon: FolderOpen,      permKey: 'viewReviewModules' },
  { to: '/instructor/monitor',       label: 'Student Monitor', icon: Users,           permKey: 'viewReports' },
  { to: '/instructor/announcements', label: 'Announcements',   icon: Megaphone,       permKey: null },
];

export default function InstructorLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [perms, setPerms] = useState(null); // null = loading pa
  const [showProfile, setShowProfile] = useState(false);
  const dept = user?.department === 'CIT' ? 'CIT' : 'CTE';

  useEffect(() => {
    async function loadPerms() {
      try {
        const data = await authApi.getMyPermissions();
        setPerms(data || {});
      } catch (err) {
        console.error('Failed to load permissions:', err);
        setPerms({});
      }
    }
    loadPerms();
  }, []);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* still logout client-side */ }
    finally { logout(); navigate('/', { replace: true }); }
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'IN';

  const visibleNavItems = NAV_ITEMS.filter(({ permKey }) => {
    if (!permKey) return true;
    if (perms === null) return true;
    return perms[permKey] !== false;
  });

  return (
    <div className="inst-shell dept-shell" data-dept={dept}>
      <aside className="inst-sidebar">
        <div className="inst-brand">
          <div className="inst-brand-icon">
            <GraduationCap size={17} />
          </div>
          <div className="inst-brand-text">
            <span>EduAssess</span>
            <span>{dept} Instructor Panel</span>
          </div>
        </div>

        <div className="inst-sidebar-section">
          <div className="inst-sidebar-label">Main Menu</div>
          <ul className="inst-nav">
            {visibleNavItems.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => `inst-nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="inst-sidebar-footer">
          <div className="inst-sidebar-user">
            <div className="inst-avatar">{initials}</div>
            <div className="inst-user-info" onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }} title="Edit profile">
              <span className="inst-user-name">{user?.name || 'Instructor'}</span>
              <span className="inst-user-role">{user?.role || 'instructor'}</span>
            </div>
            <button className="inst-logout-btn" onClick={handleLogout} title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="inst-main">
        <Outlet />
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
