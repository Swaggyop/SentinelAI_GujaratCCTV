import { useState, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { FixedSizeList as VirtualList } from 'react-window';
import AlertRow from '../components/AlertRow.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { alertsApi } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const POLL_MS  = 5_000;
const ROW_HEIGHT = 44; // px — keep constant, used by react-window

/**
 * Alerts — real-time alert feed.
 *
 * PERFORMANCE:
 * - react-window FixedSizeList: only ~20 DOM nodes regardless of list size
 * - useDeferredValue: urgent state updates (new alerts arriving) don't block
 *   the browser — the list catches up without jank
 * - AlertRow is React.memo'd — no re-render unless the row's data changes
 */
export default function Alerts() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [alerts,  setAlerts]  = useState([]);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(true);
  const prevIdsRef = useRef(new Set());

  const deferred = useDeferredValue(alerts);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await alertsApi.list({ limit: 200 });
      const incoming = res.data;
      // Track which IDs are genuinely new for the flash animation
      const newIds = new Set(incoming.map(a => a.id).filter(id => !prevIdsRef.current.has(id)));
      prevIdsRef.current = new Set(incoming.map(a => a.id));
      setAlerts(incoming.map(a => ({ ...a, _isNew: newIds.has(a.id) })));
      setError('');
    } catch {
      setError('Failed to fetch alerts. Retrying…');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const handleReview = useCallback(async (alert) => {
    try {
      await alertsApi.review(alert.id);
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, reviewed: true, _isNew: false } : a));
    } catch {
      // silent — user can retry
    }
  }, []);

  // react-window row renderer — called only for visible rows
  const Row = useCallback(({ index, style }) => {
    const alert = deferred[index];
    return (
      <AlertRow
        alert={alert}
        style={style}
        isNew={alert._isNew}
        onReview={handleReview}
        isAdmin={isAdmin}
      />
    );
  }, [deferred, handleReview, isAdmin]);

  return (
    <div className="page-root">
      {/* Header */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        padding:       '20px 24px 16px',
        borderBottom:  'var(--border-on-dark)',
        flexShrink:    0,
      }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-whiteout)', margin: 0 }}>
            Alert Feed
          </h2>
          <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>
            {deferred.length} alert{deferred.length !== 1 ? 's' : ''} · polling every 5s
          </p>
        </div>
        {error && <span style={{ fontSize: '12px', color: 'var(--color-warning)' }}>{error}</span>}
      </div>

      {/* Column headers */}
      <div style={{
        display:       'grid',
        gridTemplateColumns: '130px 1fr 100px 70px 80px',
        gap:           '0 16px',
        padding:       '8px 20px',
        borderBottom:  'var(--border-on-dark)',
        fontSize:      '11px',
        fontWeight:    500,
        color:         'rgba(255,255,255,0.35)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        flexShrink:    0,
      }}>
        <span>Plate</span>
        <span>Camera</span>
        <span>Time</span>
        <span>Confidence</span>
        <span>Actions</span>
      </div>

      {/* Virtual list */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : deferred.length === 0 ? (
        <EmptyState
          icon="🚨"
          title="No alerts"
          subtitle="Watchlist matches will appear here as cameras detect vehicles"
        />
      ) : (
        <AutoSizedList rowCount={deferred.length} Row={Row} />
      )}
    </div>
  );
}

/**
 * AutoSizedList — measures its own container height and passes it to react-window.
 * This avoids a fixed height that breaks on different screen sizes.
 */
function AutoSizedList({ rowCount, Row }) {
  const containerRef = useRef(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
      <VirtualList
        height={height}
        itemCount={rowCount}
        itemSize={ROW_HEIGHT}
        width="100%"
        overscanCount={5}
      >
        {Row}
      </VirtualList>
    </div>
  );
}
