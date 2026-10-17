// 📁 frontend/src/components/Navbar.jsx
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import '../styles/Navbar.css';
import useAuthStore from '../auth/useAuthStore';

const MOBILE_BREAKPOINT = 860; // dapat kapareho ng max-width sa Navbar.css

export default function Navbar() {
  const setAuthModal = useAuthStore((state) => state.setAuthModal);
  const [open, setOpen] = useState(false);

  // Isara ang menu kapag lumaki ang screen (rotate / desktop)
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > MOBILE_BREAKPOINT) setOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const close = () => setOpen(false);

  const openAuth = (view) => {
    close();
    setAuthModal(true, view);
  };

  return (
    <nav className="navbar">
      <a href="#" className="nav-brand" onClick={close}>
        <div className="nav-seal">
          <img
            src="https://prmsu-spms.cloud/assets/img/PRMSU.png"
            alt="PRMSU Logo"
          />
        </div>
        <div className="nav-wordmark">
          <span>EduAssess</span>
          <span>PRMSU · College of Teacher Education · College of Industrial Technology</span>
        </div>
      </a>

      {/* Hamburger — lalabas lang sa mobile */}
      <button
        type="button"
        className="nav-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="nav-menu"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <ul id="nav-menu" className={`nav-links ${open ? 'open' : ''}`}>
        <li><a href="#" className="active" onClick={close}>About</a></li>
        <li><a href="#mission" onClick={close}>Mission</a></li>
        <li><a href="#mac" onClick={close}>Access Model</a></li>
        <li><a href="#platform" onClick={close}>Platform</a></li>

        <li>
          <button onClick={() => openAuth('login')} className="nav-cta login-btn">
            Login
          </button>
        </li>

        <li>
          <button onClick={() => openAuth('register')} className="nav-cta register-btn">
            Register
          </button>
        </li>
      </ul>
    </nav>
  );
}