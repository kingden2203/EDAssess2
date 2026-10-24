import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from './useAuthStore';
import useIdleLogout from '../hooks/useIdleLogout';

/**
 * ProtectedRoute
 * Blocks access to any route that requires authentication.
 * Redirects unauthenticated users to "/" with the intended path saved in state.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  // Hook muna bago ang early returns. Walang ginagawa kapag walang naka-login.
  useIdleLogout();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
}
