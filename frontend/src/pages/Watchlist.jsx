import { useState, useEffect, useCallback } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import { watchlistApi } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

/**
 * Watchlist Management — admin only (enforced server-side + ProtectedRoute).
 *
 * Features:
 * - Table of active watchlist entries
 * - Inline add-plate form (Ghost button toggles it)
 * - Deactivate per entry (with confirmation)
 * - Empty state when watchlist is empty
 */
export default function Watchlist() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formPlateRaw,  setFormPlateRaw]  = useState('');
  const [formReason,    setFormReason]    = useState('');
  const [formSubmitting,setFormSubmitting]= useState(false);
  const [formError,     setFormError]     = useState('');

  const load = useCallback(async () => {
    try {
      const res = await watchlistApi.list();
      setEntries(res.data);
      setError('');
    } catch (e) {
      setError('Failed to load watchlist: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Normalize plate: strip non-alnum, uppercase
  const normalizePlate = (raw) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    const normalized = normalizePlate(formPlateRaw);

    if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
      setFormError('Normalized plate must be 4–12 alphanumeric characters (e.g. GJ01AB1234).');
      return;
    }
    if (!formReason.trim()) {
      setFormError('Reason is required.');
      return;
    }

    setFormSubmitting(true);
    try {
      await watchlistApi.add({
        plate_raw:        formPlateRaw.trim(),
        plate_normalized: normalized,
        reason:           formReason.trim(),
      });
      setFormPlateRaw('');
      setFormReason('');
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Failed to add plate.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivate = async (entry) => {
    if (!window.confirm(`Deactivate watchlist entry for ${entry.plate_normalized}?`)) return;
    try {
      await watchlistApi.deactivate(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (e) {
      alert('Failed to deactivate: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="page-root">
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-whiteout)', margin: 0 }}>
              Watchlist
            </h2>
            <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px' }}>
              {entries.length} active entr{entries.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
          {isAdmin && (
            <button
              className="btn-ghost"
              onClick={() => { setShowForm(f => !f); setFormError(''); }}
            >
              {showForm ? '✕ Cancel' : '+ Add plate'}
            </button>
          )}
        </div>

        {/* Add plate form */}
        {showForm && isAdmin && (
          <div className="card-haze" style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '14px' }}>
              Add plate to watchlist
            </p>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label className="form-label">Plate (raw)</label>
                  <input
                    className="input-field"
                    value={formPlateRaw}
                    onChange={e => setFormPlateRaw(e.target.value)}
                    placeholder="GJ-01-AB-1234"
                    required
                    maxLength={20}
                  />
                  {formPlateRaw && (
                    <p style={{ fontSize: '11px', color: 'rgba(27,27,27,0.55)', marginTop: '3px' }}>
                      Normalized: <strong>{normalizePlate(formPlateRaw)}</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Reason</label>
                  <input
                    className="input-field"
                    value={formReason}
                    onChange={e => setFormReason(e.target.value)}
                    placeholder="Stolen vehicle / wanted person / court order ref"
                    required
                    maxLength={200}
                  />
                </div>
                <button className="btn-solid" type="submit" disabled={formSubmitting}>
                  {formSubmitting ? 'Adding…' : 'Add'}
                </button>
              </div>
              {formError && (
                <p style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '10px' }}>
                  {formError}
                </p>
              )}
            </form>
          </div>
        )}

        {/* Error */}
        {error && <p style={{ fontSize: '13px', color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</p>}

        {/* Table */}
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>Loading…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Watchlist is empty"
            subtitle={isAdmin ? 'Add a plate using the button above.' : 'No plates are currently being watched.'}
          />
        ) : (
          <div style={{ borderRadius: 'var(--radius-cards)', overflow: 'hidden', border: 'var(--border-on-dark)' }}>
            {/* Column headers */}
            <div style={{
              display:               'grid',
              gridTemplateColumns:   '140px 1fr 120px 80px',
              gap:                   '0 16px',
              padding:               '10px 20px',
              background:            'rgba(255,255,255,0.04)',
              borderBottom:          'var(--border-on-dark)',
              fontSize:              '11px',
              fontWeight:            500,
              color:                 'rgba(255,255,255,0.35)',
              textTransform:         'uppercase',
              letterSpacing:         '0.05em',
            }}>
              <span>Plate</span>
              <span>Reason</span>
              <span>Added</span>
              {isAdmin && <span>Action</span>}
            </div>

            {/* Rows */}
            {entries.map(entry => (
              <WatchlistRow
                key={entry.id}
                entry={entry}
                isAdmin={isAdmin}
                onDeactivate={handleDeactivate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WatchlistRow({ entry, isAdmin, onDeactivate }) {
  const addedDate = entry.added_at
    ? new Date(entry.added_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—';

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: '140px 1fr 120px 80px',
      gap:                 '0 16px',
      padding:             '12px 20px',
      borderBottom:        'var(--border-on-dark)',
      alignItems:          'center',
      fontSize:            '13px',
    }}>
      {/* Plate */}
      <span className="mono" style={{ fontWeight: 600, color: 'var(--color-whiteout)' }}>
        {entry.plate_normalized}
      </span>

      {/* Reason */}
      <span style={{
        color:    'rgba(255,255,255,0.65)',
        fontSize: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {entry.reason}
      </span>

      {/* Added date */}
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>
        {addedDate}
      </span>

      {/* Action */}
      {isAdmin && (
        <button
          className="btn-ghost btn-danger"
          onClick={() => onDeactivate(entry)}
          style={{ padding: '4px 10px', fontSize: '11px' }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
