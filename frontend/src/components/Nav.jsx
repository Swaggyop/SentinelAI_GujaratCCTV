import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

const LINKS = [
  { to: '/map',       label: 'Live Map' },
  { to: '/alerts',    label: 'Alerts' },
  { to: '/search',    label: 'Search' },
  { to: '/route',     label: 'Route' },
  { to: '/watchlist', label: 'Watchlist', adminOnly: true },
];

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkStyle = ({ isActive }) => ({
    fontSize:    '13px',
    fontWeight:  500,
    color:       isActive ? 'var(--color-whiteout)' : 'rgba(255,255,255,0.50)',
    textDecoration: 'none',
    padding:     '4px 0',
    borderBottom: isActive ? '1px solid var(--color-whiteout)' : '1px solid transparent',
    transition:  'color 0.15s ease, border-color 0.15s ease',
    whiteSpace:  'nowrap',
  });

  return (
    <nav style={{
      height:         'var(--nav-height)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '0 24px',
      borderBottom:   'var(--border-on-dark)',
      background:     'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(12px)',
      flexShrink:     0,
      zIndex:         100,
      position:       'relative',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span style={{
          fontSize:   '14px',
          fontWeight: 600,
          color:      'var(--color-whiteout)',
          letterSpacing: '-0.02em',
        }}>
          Sentinel
          <span style={{
            color:      'var(--color-twilight-blue)',
            fontStyle:  'italic',
            marginLeft: '4px',
            fontWeight: 400,
          }}>
            AI
          </span>
        </span>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: '20px' }}>
          {LINKS.map(({ to, label, adminOnly }) => {
            if (adminOnly && user?.role !== 'admin') return null;
            return (
              <NavLink key={to} to={to} style={navLinkStyle}>
                {label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Right: user info + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {user && (
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
            {user.email}
            <span style={{
              marginLeft:   '6px',
              background:   'rgba(66,97,136,0.35)',
              color:        'var(--color-twilight-blue)',
              borderRadius: 'var(--radius-pills)',
              padding:      '1px 7px',
              fontSize:     '11px',
              fontWeight:   500,
            }}>
              {user.role}
            </span>
          </span>
        )}
        <button className="btn-ghost" onClick={handleLogout} style={{ padding: '6px 14px' }}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
