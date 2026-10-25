import { useEffect, useState } from 'react';
import authApi from '../api/authApi';
import useAuthStore from '../auth/useAuthStore';

// Maikling cache para hindi mag-request sa bawat pagpapalit ng page
let cache = { at: 0, userId: null, data: null };
const TTL_MS = 15000;

export default function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState({ loading: true, perms: null });

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    if (cache.userId === user.id && Date.now() - cache.at < TTL_MS && cache.data) {
      setState({ loading: false, perms: cache.data });
      return undefined;
    }

    authApi.getMyPermissions()
      .then((data) => {
        cache = { at: Date.now(), userId: user.id, data: data || {} };
        if (!cancelled) setState({ loading: false, perms: data || {} });
      })
      .catch(() => {
        // Kapag nag-fail ang request, huwag i-lock out ang user (ang backend pa rin ang may huling hatol)
        if (!cancelled) setState({ loading: false, perms: null });
      });

    return () => { cancelled = true; };
  }, [user]);

  return state;
}