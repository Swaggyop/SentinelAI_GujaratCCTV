import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.markercluster';
import CameraMarker from '../components/CameraMarker.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { camerasApi, alertsApi } from '../api.js';
import HlsVideo from '../components/HlsVideo.jsx';

const POLL_MS = 5_000;
// Gujarat center
const MAP_CENTER = [22.2587, 71.1924];
const MAP_ZOOM   = 7;

/**
 * MapPage — the focal point of the dashboard.
 *
 * - Full-height Leaflet map with OpenStreetMap tiles
 * - Camera markers clustered via leaflet.markercluster
 * - 320px sidebar (Haze card) with last 10 alerts, polled every 5s
 * - Map instance is created ONCE, never recreated on re-renders
 */
export default function MapPage() {
  const location = useLocation();
  const mapRef      = useRef(null); // DOM node
  const leafletRef  = useRef(null); // L.Map instance
  const clusterRef  = useRef(null); // L.MarkerClusterGroup

  const [cameras,  setCameras]  = useState([]);
  const [alerts,   setAlerts]   = useState([]);
  const [selected, setSelected] = useState(null); // clicked camera

  // ── Initialize Leaflet once ───────────────────────────────
  useEffect(() => {
    if (leafletRef.current) return; // already created

    const map = L.map(mapRef.current, {
      center:    MAP_CENTER,
      zoom:      MAP_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(cluster);

    leafletRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      leafletRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // ── Fetch cameras (once on mount) ─────────────────────────
  useEffect(() => {
    camerasApi.list().then(r => setCameras(r.data)).catch(console.error);
  }, []);

  // ── Poll alerts every 5s ──────────────────────────────────
  const fetchAlerts = useCallback(() => {
    alertsApi.list({ limit: 10 })
      .then(r => setAlerts(r.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  return (
    <>
      {/* The Leaflet map — always in DOM, hidden via CSS on other pages */}
      <div
        ref={mapRef}
        className="map-root"
        style={{ display: location.pathname === '/map' ? 'block' : 'none' }}
      />

      {/* Camera markers rendered via imperatively-managed Leaflet */}
      {leafletRef.current && clusterRef.current && cameras.map(cam => (
        <CameraMarker
          key={cam.id}
          map={leafletRef.current}
          camera={cam}
          clusterGroup={clusterRef.current}
          onClick={setSelected}
        />
      ))}

      {/* Sidebar — Haze card floating over map */}
      <div style={{
        position:  'absolute',
        top:       '16px',
        right:     '16px',
        width:     '320px',
        zIndex:    500,
        display:   location.pathname === '/map' ? 'flex' : 'none',
        flexDirection: 'column',
        gap:       '12px',
        maxHeight: 'calc(100vh - var(--nav-height) - 32px)',
      }}>
        {/* Stats row */}
        <div className="card-haze" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>
              Live Map
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Stat
                label="Live"
                value={cameras.filter(c => c.status === 'live').length}
                color="#22c55e"
              />
              <Stat
                label="Offline"
                value={cameras.filter(c => c.status === 'offline').length}
                color="#6b7280"
              />
              <Stat
                label="Cameras"
                value={cameras.length}
                color="var(--color-ink)"
              />
            </div>
          </div>
        </div>

        {/* Selected camera detail */}
        {selected && (
          <div className="card-haze" style={{ padding: '14px 16px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-ink)', marginBottom: '2px' }}>
                  {selected.id}
                </p>
                <p style={{ fontSize: '12px', color: 'rgba(27,27,27,0.55)' }}>{selected.department}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{
                  fontSize:     '11px',
                  fontWeight:   500,
                  color:        selected.status === 'live' ? '#22c55e' : '#6b7280',
                  borderRadius: 'var(--radius-pills)',
                  border:       `1px solid ${selected.status === 'live' ? '#22c55e' : '#6b7280'}`,
                  padding:      '1px 7px',
                }}>
                  {selected.status}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'rgba(27,27,27,0.4)', fontSize: '14px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Live Video Feed Embed via Backend Proxy */}
            <div style={{ width: '100%', borderRadius: '6px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
              <HlsVideo src={`http://localhost:4000/api/v1/stream/${selected.id}/index.m3u8`} />
            </div>
          </div>
        )}

        {/* Recent alerts */}
        <div className="card-haze" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>
              Recent Alerts
            </span>
            <span style={{ fontSize: '11px', color: 'rgba(27,27,27,0.40)', marginLeft: '8px' }}>
              5s poll
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {alerts.length === 0
              ? <EmptyState icon="🔍" title="No alerts yet" subtitle="Watchlist matches will appear here" onDark={false} />
              : alerts.map(a => <SidebarAlertRow key={a.id} alert={a} />)
            }
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'rgba(27,27,27,0.45)', marginTop: '1px' }}>{label}</div>
    </div>
  );
}

function SidebarAlertRow({ alert }) {
  const ts = alert.signed_at
    ? new Date(alert.signed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const isFuzzy = alert.match_kind === 'fuzzy';

  return (
    <div style={{
      display:       'grid',
      gridTemplateColumns: '1fr auto auto',
      gap:           '8px',
      alignItems:    'center',
      padding:       '8px 16px',
      borderBottom:  '1px solid rgba(0,0,0,0.05)',
      fontSize:      '12px',
    }}>
      <div>
        <span className="mono" style={{
          fontWeight: 600,
          color: isFuzzy ? 'var(--color-warning)' : 'var(--color-ink)',
        }}>
          {alert.plate_matched}
        </span>
        {isFuzzy && <span style={{ fontSize: '10px', color: 'var(--color-warning)', marginLeft: '4px' }}>~</span>}
        <div style={{ fontSize: '11px', color: 'rgba(27,27,27,0.45)', marginTop: '1px' }}>
          {alert.camera_id}
        </div>
      </div>
      <ConfidenceBadge confidence={alert.confidence} size="sm" />
      <span style={{ fontSize: '11px', color: 'rgba(27,27,27,0.45)' }}>{ts}</span>
    </div>
  );
}
