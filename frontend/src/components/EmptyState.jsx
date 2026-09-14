/**
 * EmptyState — designed empty states for lists, tables, and search results.
 * Every list/table in the app uses this rather than rendering a blank screen.
 */
export default function EmptyState({ icon = '—', title, subtitle, onDark = true }) {
  const textColor   = onDark ? 'rgba(255,255,255,0.35)' : 'rgba(27,27,27,0.40)';
  const titleColor  = onDark ? 'rgba(255,255,255,0.70)' : 'rgba(27,27,27,0.70)';

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            '8px',
      padding:        '48px 24px',
      textAlign:      'center',
    }}>
      <span style={{ fontSize: '28px', lineHeight: 1, opacity: 0.4 }}>{icon}</span>
      {title && (
        <p style={{
          fontSize:   '14px',
          fontWeight: 500,
          color:      titleColor,
          margin:     0,
        }}>
          {title}
        </p>
      )}
      {subtitle && (
        <p style={{
          fontSize:   '13px',
          fontWeight: 400,
          color:      textColor,
          margin:     0,
          maxWidth:   '280px',
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
