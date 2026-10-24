import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import useAuthStore from '../auth/useAuthStore';

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
const KEY = 'eduassess:lastActivity';
const EXAM_PATH = '/dashboard/exam'; // huwag i-logout habang nasa exam

export default function useIdleLogout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return undefined;

    let minutes = null;
    let lastWrite = 0;

    const touch = () => {
      const now = Date.now();
      if (now - lastWrite > 1000) {
        lastWrite = now;
        localStorage.setItem(KEY, String(now));
      }
    };

    const loadConfig = () =>
      axiosInstance
        .get('/auth/session-config')
        .then((r) => { minutes = Number(r.data.sessionTimeout) || null; })
        .catch(() => {});

    touch();
    loadConfig();
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    // Kunin ulit ang setting kada 30s para sumunod agad sa binago ng admin
    const configId = setInterval(loadConfig, 30000);

    const checkId = setInterval(() => {
      if (!minutes) return;
      if (window.location.pathname.startsWith(EXAM_PATH)) return;

      // localStorage ang gamit para pati ibang tab ay bilang activity
      const lastSeen = Number(localStorage.getItem(KEY) || Date.now());
      if (Date.now() - lastSeen >= minutes * 60000) {
        clearInterval(checkId);
        clearInterval(configId);
        logout();
        navigate('/', { replace: true });
        alert('You were signed out due to inactivity.');
      }
    }, 5000);

    return () => {
      clearInterval(configId);
      clearInterval(checkId);
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [user, logout, navigate]);
}
