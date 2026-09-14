import { useState, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as VirtualList } from 'react-window';
import AlertRow from '../components/AlertRow.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { alertsApi, camerasApi } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const ROW_HEIGHT = 44;
const PAGE_SIZE  = 50;

export default function Search() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  // ── Filter state ──────────────────────────────────────────
  const [plate,    setPlate]    = useState('');
  const [cameraId, setCameraId] = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [reviewed, setReviewed] = useState('');

  // ── Results state ─────────────────────────────────────────
  const [results,  setResults]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [searched, setSearched] = useState(false);

  // ── Camera list for dropdown ──────────────────────────────
  const [cameras, setCameras] = useState([]);
  useEffect(() => {
    camerasApi.list().then(r => setCameras(r.data)).catch(() => {});
  }, []);

  const doSearch = useCallback(async (pageNum = 0) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit:  PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      };
      if (plate.trim())    params.plate     = plate.trim().toUpperCase();
      if (cameraId)        params.camera_id = cameraId;
      if (from)            params.from      = from;
      if (to)              params.to        = to;
      if (reviewed !== '') params.reviewed  = reviewed;

      const res = await alertsApi.list(params);
      setResults(res.data);
      // Backend doesn't return total count — estimate from page size
      setTotal(pageNum === 0 && res.data.length < PAGE_SIZE ? res.data.length : (pageNum + 1) * PAGE_SIZE + (res.data.length === PAGE_SIZE ? 1 : 0));
      setPage(pageNum);
      setSearched(true);
    } catch (e) {
      setError('Search failed. ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  }, [plate, cameraId, from, to, reviewed]);

  const handleSubmit = (e) => {
    e.preventDefault();
    doSearch(0);
  };

  const handleReview = useCallback(async (alert) => {
    try {
      await alertsApi.review(alert.id);
      setResults(prev => prev.map(a => a.id === alert.id ? { ...a, reviewed: true } : a));
    } catch { /* silent */ }
  }, []);

  // react-window row renderer
  const Row = useCallback(({ index, style }) => (
    <AlertRow
      alert={results[index]}
      style={style}
      isNew={false}
      onReview={handleReview}
      isAdmin={isAdmin}
    />
  ), [results, handleReview, isAdmin]);

  // Auto-height for virtual list
  const containerRef = useRef(null);
  const [listHeight, setListHeight] = useState(400);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => setListHeight(e[0].contentRect.height));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="page-root" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-whiteout)', margin: '0 0 16px' }}>
          Search History
        </h2>

        {/* Filter bar — Haze card */}
        <form onSubmit={handleSubmit}>
          <div className="card-haze" style={{ padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
              {/* Plate */}
              <div>
                <label className="form-label">Plate</label>
                <input
                  className="input-field"
                  value={plate}
                  onChange={e => setPlate(e.target.value)}
                  placeholder="GJ01AB1234"
                  maxLength={12}
                />
              </div>

              {/* Camera */}
              <div>
                <label className="form-label">Camera</label>
                <select
                  className="input-field"
                  value={cameraId}
                  onChange={e => setCameraId(e.target.value)}
                >
                  <option value="">All cameras</option>
                  {cameras.map(c => (
                    <option key={c.id} value={c.id}>{c.id}</option>
                  ))}
                </select>
              </div>

              {/* Date from */}
              <div>
                <label className="form-label">From</label>
                <input
                  className="input-field"
                  type="datetime-local"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </div>

              {/* Date to */}
              <div>
                <label className="form-label">To</label>
                <input
                  className="input-field"
                  type="datetime-local"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </div>

              {/* Reviewed */}
              <div>
                <label className="form-label">Reviewed</label>
                <select
                  className="input-field"
                  value={reviewed}
                  onChange={e => setReviewed(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="false">Unreviewed</option>
                  <option value="true">Reviewed</option>
                </select>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-solid" type="submit" disabled={loading}>
                  {loading ? 'Searching…' : 'Search'}
                </button>
                <button
                  className="btn-solid"
                  type="button"
                  onClick={() => { setPlate(''); setCameraId(''); setFrom(''); setTo(''); setReviewed(''); setResults([]); setSearched(false); }}
                  style={{ borderColor: 'rgba(27,27,27,0.3)', color: 'rgba(27,27,27,0.6)' }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Error */}
        {error && <p style={{ fontSize: '13px', color: 'var(--color-danger)', marginBottom: '8px' }}>{error}</p>}

        {/* Results count + pagination */}
        {searched && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
              {results.length === 0 ? 'No results' : `${results.length} result${results.length !== 1 ? 's' : ''}${results.length === PAGE_SIZE ? '+' : ''}`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {page > 0 && (
                <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => doSearch(page - 1)}>
                  ← Prev
                </button>
              )}
              {results.length === PAGE_SIZE && (
                <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => doSearch(page + 1)}>
                  Next →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Column headers */}
        {results.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr 100px 70px 80px',
            gap: '0 16px',
            padding: '8px 20px',
            borderTop: 'var(--border-on-dark)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            <span>Plate</span>
            <span>Camera</span>
            <span>Time</span>
            <span>Confidence</span>
            <span>Actions</span>
          </div>
        )}
      </div>

      {/* Virtual results list */}
      {!searched ? (
        <EmptyState icon="🔎" title="Search alert history" subtitle="Filter by plate, camera, date range, or review status" />
      ) : results.length === 0 ? (
        <EmptyState icon="🗂" title="No results" subtitle="Try broadening your filters" />
      ) : (
        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
          <VirtualList
            height={listHeight}
            itemCount={results.length}
            itemSize={ROW_HEIGHT}
            width="100%"
            overscanCount={5}
          >
            {Row}
          </VirtualList>
        </div>
      )}
    </div>
  );
}
