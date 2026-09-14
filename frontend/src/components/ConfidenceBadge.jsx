import { memo } from 'react';

/**
 * ConfidenceBadge — shows a color-coded confidence score.
 *
 * high   (>= 0.70): white badge  — authoritative read
 * medium (>= 0.50): signal blue  — plausible but review
 * low    (< 0.50):  amber warning — OCR uncertain, human review required
 *
 * Keeps DOM to a single <span> for performance in virtualized lists.
 */
const ConfidenceBadge = memo(function ConfidenceBadge({ confidence, size = 'sm' }) {
  if (confidence == null) return null;

  const pct = Math.round(confidence * 100);

  let bg, color;
  if (confidence >= 0.70) {
    bg = 'rgba(255,255,255,0.12)';
    color = 'var(--color-whiteout)';
  } else if (confidence >= 0.50) {
    bg = 'rgba(43,127,255,0.18)';
    color = 'var(--color-signal-blue)';
  } else {
    bg = 'rgba(245,158,11,0.18)';
    color = 'var(--color-warning)';
  }

  const fontSize = size === 'sm' ? '11px' : '13px';
  const padding  = size === 'sm' ? '2px 7px' : '4px 10px';

  return (
    <span style={{
      display:      'inline-block',
      background:   bg,
      color:        color,
      borderRadius: 'var(--radius-pills)',
      fontSize,
      fontWeight:   500,
      padding,
      letterSpacing: '0.02em',
      whiteSpace:   'nowrap',
    }}>
      {pct}%
    </span>
  );
});

export default ConfidenceBadge;
