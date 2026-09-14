import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/map';

  const [email,    setEmail]    = useState('admin@sentinel.local');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Invalid credentials.'
          : err.response?.status === 429
          ? 'Too many attempts — wait 15 minutes.'
          : 'Connection error. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:      '100vh',
      background:     'var(--surface-dark-canvas)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontSize:    '28px',
            fontWeight:  700,
            color:       'var(--color-whiteout)',
            letterSpacing: '-0.03em',
            lineHeight:  1,
          }}>
            Sentinel
            <em style={{
              color:     'var(--color-twilight-blue)',
              fontStyle: 'italic',
              fontWeight: 400,
              marginLeft: '6px',
            }}>
              AI
            </em>
          </h1>
          <p style={{
            marginTop: '8px',
            fontSize:  '13px',
            color:     'rgba(255,255,255,0.40)',
          }}>
            Gujarat CCTV Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div className="card-haze" style={{ boxShadow: 'none' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Email</label>
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@sentinel.local"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p style={{
                fontSize:  '13px',
                color:     'var(--color-danger)',
                margin:    0,
              }}>
                {error}
              </p>
            )}

            <button
              className="btn-solid"
              type="submit"
              disabled={loading}
              style={{ marginTop: '4px', justifyContent: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <hr className="divider-dark-card" style={{ marginTop: '20px' }} />
          <p style={{ fontSize: '12px', color: 'rgba(27,27,27,0.45)', marginTop: '12px' }}>
            Demo accounts: admin@sentinel.local · operator@sentinel.local · viewer@sentinel.local
          </p>
        </div>
      </div>
    </div>
  );
}
