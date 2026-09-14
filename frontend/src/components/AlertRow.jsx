import { memo, useCallback } from 'react';
import ConfidenceBadge from './ConfidenceBadge.jsx';

/**
 * AlertRow — a single row in the alert feed or search results table.
 *
 * PERFORMANCE CONTRACT:
 * - This component must stay as minimal DOM as possible.
 *   It is rendered inside react-window's FixedSizeList — only ~20
 *   instances exist in the DOM at any time regardless of total alerts.
 * - Wrapped in React.memo — only re-renders if the alert object reference changes.
 * - Uses a CSS Grid row (single div, 5 cells) — no wrappers, no fragments.
 * - style prop is passed from react-window (top/height/position for virtual scroll).
 */
const AlertRow = memo(function AlertRow({
  alert,
  style,        // from react-window — absolute positioning
  isNew,        // flash animation for newly-arrived alerts
  onReview,     // (alert) => void — admin only
  isAdmin,
}) {
  const ts = alert.signed_at
    ? new Date(alert.signed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const matchColor = alert.match_kind === 'fuzzy'
    ? 'var(--color-warning)'
    : 'var(--color-whiteout)';

  const handleReview = useCallback((e) => {
    e.stopPropagation();
    onReview?.(alert);
  }, [alert, onReview]);

  return (
    <div
      style={{
        ...style,
        display:       'grid',
        gridTemplateColumns: '130px 1fr 100px 70px 80px',
        alignItems:    'center',
        gap:           '0 16px',
        padding:       '0 20px',
        borderBottom:  '1px solid rgba(255,255,255,0.06)',
        fontSize:      '13px',
        fontWeight:    500,
      }}
      className={isNew ? 'alert-row-new' : undefined}
    >
      {/* Plate */}
      <span className="mono truncate" style={{ color: matchColor }}>
        {alert.plate_matched || alert.plate_normalized || '—'}
      </span>

      {/* Camera ID */}
      <span className="truncate text-dim" style={{ fontSize: '12px' }}>
        {alert.camera_id || '—'}
      </span>

      {/* Timestamp */}
      <span className="text-dim" style={{ fontSize: '12px' }}>{ts}</span>

      {/* Confidence */}
      <span>
        <ConfidenceBadge confidence={alert.confidence} />
      </span>

      {/* Actions */}
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {alert.match_kind === 'fuzzy' && (
          <span style={{
            fontSize: '10px',
            color: 'var(--color-warning)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-pills)',
            padding: '1px 6px',
          }}>
            FUZZY
          </span>
        )}
        {isAdmin && !alert.reviewed && (
          <button
            className="btn-ghost"
            onClick={handleReview}
            style={{ padding: '2px 8px', fontSize: '11px' }}
          >
            Review
          </button>
        )}
        {alert.reviewed && (
          <span style={{ fontSize: '11px', color: 'var(--color-success)' }}>✓</span>
        )}
      </span>
    </div>
  );
});

export default AlertRow;
