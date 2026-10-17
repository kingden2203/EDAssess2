// 📁 frontend/src/pages/user/UserLayout.jsx
import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList,
  BarChart2, LogOut, GraduationCap, Menu, X
} from 'lucide-react';
import useAuthStore from '../../auth/useAuthStore';
import authApi from '../../api/authApi';
import ProfileModal from '../../components/ProfileModal';
import './user.css';
import '../../styles/dept-theme.css';
import './user-responsive.css'; // dapat PINAKAHULI para ma-override ang desktop styles

const NAV_ITEMS = [
  { to: '/dashboard',           label: 'Dashboard',       icon: LayoutDashboard, end: true },
  { to: '/dashboard/review',    label: 'Review Modules',  icon: BookOpen },
  { to: '/dashboard/selection', label: 'Take Exam',       icon: ClipboardList },
  { to: '/dashboard/scores',    label: 'My Scores',       icon: BarChart2 },
];

const DRAWER_BREAKPOINT = 900; // dapat kapareho ng max-width sa user-responsive.css

export default function UserLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dept = user?.department === 'CIT' ? 'CIT' : 'CTE'; // walang department = CTE

  // Isara ang drawer kapag lumipat ng page
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // I-lock ang scroll ng page habang bukas ang drawer
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Isara gamit ang Escape key, o kapag lumaki ang screen (rotate / desktop)
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onResize = () => { if (window.innerWidth > DRAWER_BREAKPOINT) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* still logout client-side */ }
    finally { logout(); navigate('/', { replace: true }); }
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'ST';

  return (
    <div className="user-shell dept-shell" data-dept={dept}>
      {/* Hamburger — lalabas lang sa mobile/tablet */}
      <button
        type="button"
        className="user-menu-btn"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        aria-expanded={menuOpen}
      >
        <Menu size={20} />
      </button>

      {/* Madilim na backdrop sa likod ng drawer */}
      <div
        className={`user-sidebar-backdrop ${menuOpen ? 'show' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`user-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="user-brand">
          <div className="user-brand-icon"><GraduationCap size={17} /></div>
          <div className="user-brand-text">
            <span>EduAssess</span>
            <span>{dept} Student Portal</span>
          </div>
          <button
            type="button"
            className="user-sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="user-sidebar-section">
          <div className="user-sidebar-label">Navigation</div>
          <ul className="user-nav">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `user-nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="user-sidebar-footer">
          <div className="user-sidebar-user">
            <div className="user-avatar">{initials}</div>
            <div
              className="user-info"
              onClick={() => { setShowProfile(true); setMenuOpen(false); }}
              style={{ cursor: 'pointer' }}
              title="Edit profile"
            >
              <span className="user-name">{user?.name || 'Student'}</span>
              <span className="user-role-label">{dept} Student</span>
            </div>
            <button className="user-logout-btn" onClick={handleLogout} title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="user-main">
        <Outlet />
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}