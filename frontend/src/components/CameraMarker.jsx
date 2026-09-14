import { useEffect, useRef } from 'react';
import L from 'leaflet';

/**
 * CameraMarker — renders a single Leaflet circle marker for a camera.
 *
 * Status colors:
 *   live          → green  (#22c55e)
 *   offline       → gray   (#6b7280)
 *   deregistered  → red    (#ef4444)
 *
 * Uses vanilla Leaflet (not react-leaflet) so we can manage
 * marker lifetime precisely without re-creating the whole map.
 *
 * Props:
 *   map        — Leaflet map instance
 *   camera     — camera object from API { id, department, location, status, stream_health, latest_heartbeat }
 *   clusterGroup — L.markerClusterGroup instance
 *   onClick    — (camera) => void
 */
export default function CameraMarker({ map, camera, clusterGroup, onClick }) {
  const markerRef = useRef(null);

  useEffect(() => {
    if (!map || !camera?.location) return;

    const coords = camera.location?.coordinates;
    if (!coords) return;

    const [lng, lat] = coords; // GeoJSON: [lon, lat]

    const COLOR = {
      live:         '#22c55e',
      offline:      '#6b7280',
      deregistered: '#ef4444',
    }[camera.status] ?? '#6b7280';

    const marker = L.circleMarker([lat, lng], {
      radius:      7,
      fillColor:   COLOR,
      color:       COLOR,
      weight:      2,
      opacity:     0.9,
      fillOpacity: 0.75,
    });

    const hb = camera.latest_heartbeat;
    const hbText = hb
      ? `<span style="color:rgba(255,255,255,0.6);font-size:11px">${hb.status} · ${new Date(hb.reported_at).toLocaleTimeString('en-IN')}</span>`
      : '<span style="color:rgba(255,255,255,0.4);font-size:11px">No heartbeat</span>';

    marker.bindPopup(`
      <div style="min-width:180px;line-height:1.5">
        <div style="font-weight:600;font-size:13px;margin-bottom:4px">${camera.id}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:2px">${camera.department}</div>
        <div style="font-size:12px;color:${COLOR};font-weight:500;margin-bottom:4px">
          ${camera.status.toUpperCase()}
        </div>
        ${hbText}
      </div>
    `, { maxWidth: 240 });

    marker.on('click', () => onClick?.(camera));

    clusterGroup.addLayer(marker);
    markerRef.current = marker;

    return () => {
      clusterGroup.removeLayer(marker);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, camera?.id, camera?.status, camera?.location]);

  return null; // DOM managed by Leaflet
}
