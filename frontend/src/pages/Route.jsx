import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { alertsApi, camerasApi } from '../api.js';

/**
 * Route Reconstruction — given a plate, plots its alert locations
 * on a Leaflet map in chronological order to show vehicle path.
 *
 * Edge cases:
 * - Single alert: shows a single marker, no polyline, no error
 * - Zero alerts: EmptyState
 * - Cameras without location data: skip gracefully
 */
export default function RoutePage() {
  const [plate,    setPlate]    = useState('');
  const [input,    setInput]    = useState('');
  const [trail,    setTrail]    = useState([]); // sorted alerts with location
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [searched, setSearched] = useState(false);

  // Leaflet refs
  const mapRef     = useRef(null);
  const leafletRef = useRef(null);
  const layersRef  = useRef([]);   // markers + polyline — cleared on new search

  // ── Init Leaflet map ──────────────────────────────────────
  useEffect(() => {
    if (leafletRef.current) return;
    const map = L.map(mapRef.current, {
      center: [22.2587, 71.1924],
      zoom:   7,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    leafletRef.current = map;
    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  // ── Clear previous layers ─────────────────────────────────
  const clearLayers = useCallback(() => {
    layersRef.current.forEach(l => leafletRef.current?.removeLayer(l));
    layersRef.current = [];
  }, []);

  // ── Draw trail on map ─────────────────────────────────────
  const drawTrail = useCallback((points) => {
    if (!leafletRef.current) return;
    clearLayers();

    if (points.length === 0) return;

    const latlngs = points.map(p => [p.lat, p.lng]);

    // Polyline — only if 2+ points
    if (points.length >= 2) {
      const line = L.polyline(latlngs, {
        color:     '#2b7fff',
        weight:    3,
        opacity:   0.8,
        dashArray: '6 4',
      }).addTo(leafletRef.current);
      layersRef.current.push(line);
    }

    // Numbered circle markers
    points.forEach((p, i) => {
      const isFirst = i === 0;
      const isLast  = i === points.length - 1;

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:26px;height:26px;border-radius:50%;
          background:${isFirst ? '#22c55e' : isLast ? '#ef4444' : '#2b7fff'};
          border:2px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:700;color:#fff;
          font-family:Inter,sans-serif;
        ">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const ts = p.signed_at
        ? new Date(p.signed_at).toLocaleString('en-IN')
        : '—';

      const m = L.marker([p.lat, p.lng], { icon })
        .bindPopup(`
          <div style="min-width:160px;line-height:1.6">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">Stop ${i + 1}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6)">${p.camera_id}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6)">${ts}</div>
            <div style="font-size:12px;margin-top:4px">Confidence: ${Math.round(p.confidence * 100)}%</div>
          </div>
        `)
        .addTo(leafletRef.current);

      layersRef.current.push(m);
    });

    // Fit map to route bounds
    const bounds = L.latLngBounds(latlngs);
    leafletRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [clearLayers]);

  // ── Search handler ────────────────────────────────────────
  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    const q = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!q) return;

    setPlate(q);
    setLoading(true);
    setError('');
    setSearched(true);

    try {
      // Fetch all alerts for this plate (up to 200)
      const [alertsRes, camerasRes] = await Promise.all([
        alertsApi.list({ plate: q, limit: 200 }),
        camerasApi.list(),
      ]);

      const alerts  = alertsRes.data;
      const camMap  = Object.fromEntries(camerasRes.data.map(c => [c.id, c]));

      // Sort by signed_at ascending (chronological path)
      const sorted = [...alerts].sort((a, b) =>
        new Date(a.signed_at) - new Date(b.signed_at)
      );

      // Join with camera location
      const withCoords = sorted.reduce((acc, alert) => {
        const cam = camMap[alert.camera_id];
        const coords = cam?.location?.coordinates; // [lng, lat]
        if (!coords) return acc; // skip cameras without location
        acc.push({
          ...alert,
          lat: coords[1],
          lng: coords[0],
        });
        return acc;
      }, []);

      setTrail(withCoords);
      drawTrail(withCoords);
    } catch (e) {
      setError('Failed to load route: ' + (e.response?.data?.error || e.message));
      setTrail([]);
      clearLayers();
    } finally {
      setLoading(false);
    }
  }, [input, drawTrail, clearLayers]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Map */}
      <div ref={mapRef} style={{ flex: 1, height: '100%' }} />

      {/* Sidebar */}
      <div style={{
        width:         '320px',
        flexShrink:    0,
        display:       'flex',
        flexDirection: 'column',
        borderLeft:    'var(--border-on-dark)',
        background:    'var(--surface-dark-canvas)',
        overflow:      'hidden',
      }}>
        {/* Search input */}
        <div style={{ padding: '16px', borderBottom: 'var(--border-on-dark)', flexShrink: 0 }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-whiteout)', marginBottom: '10px' }}>
            Route Reconstruction
          </p>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input-dark"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="GJ01AB1234"
              maxLength={12}
              style={{ flex: 1 }}
            />
            <button className="btn-ghost" type="submit" disabled={loading} style={{ padding: '8px 14px', fontSize: '12px' }}>
              {loading ? '…' : 'Go'}
            </button>
          </form>
          {error && <p style={{ fontSize: '12px', color: 'var(--color-danger)', marginTop: '8px' }}>{error}</p>}
        </div>

        {/* Route summary */}
        {!searched ? (
          <EmptyState
            icon="🛣️"
            title="Enter a plate"
            subtitle="See its path across cameras in chronological order"
          />
        ) : trail.length === 0 && !loading ? (
          <EmptyState
            icon="📍"
            title={`No route for ${plate}`}
            subtitle="No alerts found. The plate may not have been detected or camera locations are unavailable."
          />
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-whiteout)' }}>
                {plate}
              </span>
              <span className="text-dim" style={{ fontSize: '11px', marginLeft: '8px' }}>
                {trail.length} stop{trail.length !== 1 ? 's' : ''}
                {trail.length === 1 ? ' — single detection' : ''}
              </span>
            </div>

            {/* Single-alert notice */}
            {trail.length === 1 && (
              <div style={{
                margin:       '0 12px 8px',
                padding:      '8px 12px',
                background:   'rgba(245,158,11,0.12)',
                border:       '1px solid rgba(245,158,11,0.3)',
                borderRadius: 'var(--radius-buttons)',
                fontSize:     '11px',
                color:        'var(--color-warning)',
              }}>
                Only one detection found — showing as a single point. No route line to draw.
              </div>
            )}

            {/* Timeline */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
              {trail.map((stop, i) => (
                <TimelineStop key={stop.id} stop={stop} index={i} total={trail.length} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineStop({ stop, index, total }) {
  const ts = stop.signed_at
    ? new Date(stop.signed_at).toLocaleString('en-IN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—';

  const isFirst = index === 0;
  const isLast  = index === total - 1;
  const dotColor = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#2b7fff';

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '10px 16px', position: 'relative' }}>
      {/* Timeline line + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          background: dotColor, border: '2px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9px', fontWeight: 700, color: '#fff',
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        {!isLast && (
          <div style={{ flex: 1, width: '1px', background: 'rgba(255,255,255,0.10)', minHeight: '16px', marginTop: '4px' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : '4px' }}>
        <p className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-whiteout)', margin: '0 0 2px' }}>
          {stop.camera_id}
        </p>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', margin: '0 0 4px' }}>{ts}</p>
        <ConfidenceBadge confidence={stop.confidence} size="sm" />
        {stop.match_kind === 'fuzzy' && (
          <span style={{
            marginLeft: '6px', fontSize: '10px', color: 'var(--color-warning)',
            border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-pills)', padding: '1px 5px',
          }}>
            FUZZY
          </span>
        )}
      </div>
    </div>
  );
}
