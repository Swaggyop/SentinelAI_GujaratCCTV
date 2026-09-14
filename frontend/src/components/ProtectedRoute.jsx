import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

/**
 * ProtectedRoute — redirects to /login if not authenticated.
 * Optionally enforces a role check (roles=[]).
 */
export default function ProtectedRoute({ children, roles = [] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '13px',
      }}>
        Authenticating…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="page-root" style={{ padding: '48px 32px' }}>
        <p style={{ color: 'var(--color-whiteout)', fontWeight: 500 }}>
          Access denied — this page requires{' '}
          <span style={{ color: 'var(--color-signal-blue)' }}>
            {roles.join(' or ')}
          </span>{' '}
          role. You are logged in as <strong>{user.role}</strong>.
        </p>
      </div>
    );
  }

  return children;
}
