-- Sentinel DB init 07 — demo seed (~50 cameras, 3 RBAC users, sample watchlist)
-- Passwords are bcrypt via pgcrypto. Demo-only; rotate before any real deployment.

INSERT INTO users (email, password_hash, role)
VALUES
  ('admin@sentinel.local', crypt('ChangeMe_Admin1!', gen_salt('bf', 12)), 'admin'),
  ('operator@sentinel.local', crypt('ChangeMe_Operator1!', gen_salt('bf', 12)), 'operator'),
  ('viewer@sentinel.local', crypt('ChangeMe_Viewer1!', gen_salt('bf', 12)), 'readonly')
ON CONFLICT (email) DO NOTHING;

-- Gujarat sites from the problem statement + major cities. 50 cameras, slightly offset.
WITH sites(city, department, lon, lat) AS (
  VALUES
    ('Ahmedabad',     'Home Department',           72.5714, 23.0225),
    ('Gandhinagar',   'Home Department',           72.6369, 23.2156),
    ('Surat',         'Home Department',           72.8311, 21.1702),
    ('Vadodara',      'Home Department',           73.1812, 22.3072),
    ('Rajkot',        'Home Department',           70.8022, 22.3039),
    ('Bhavnagar',     'Home Department',           72.1519, 21.7645),
    ('Jamnagar',      'Home Department',           70.0577, 22.4707),
    ('Junagadh',      'Home Department',           70.4579, 21.5222),
    ('Bhuj',          'Home Department',           69.6669, 23.2420),
    ('Dwarka',        'Home Department',           68.9685, 22.2442),
    ('Somnath',       'Home Department',           70.3629, 20.9159),
    ('Porbandar',     'Home Department',           69.6293, 21.6417),
    ('Valsad',        'Home Department',           72.9342, 20.5992),
    ('Vapi',          'Home Department',           72.9106, 20.3893),
    ('Dahod',         'Home Department',           74.2551, 22.8341),
    ('Godhra',        'Home Department',           73.6149, 22.7755),
    ('Mehsana',       'Home Department',           72.3693, 23.5880),
    ('Palanpur',      'Home Department',           72.4346, 24.1725),
    ('Patan',         'Home Department',           72.1266, 23.8493),
    ('Bharuch',       'Home Department',           72.9959, 21.7051),
    ('Anand',         'RTO',                       72.9289, 22.5645),
    ('Nadiad',        'RTO',                       72.8634, 22.6916),
    ('Himmatnagar',   'RTO',                       72.9630, 23.5982),
    ('Morbi',         'RTO',                       70.8370, 22.8173),
    ('Surendranagar', 'RTO',                       71.6370, 22.7289)
), numbered AS (
  SELECT
    city,
    department,
    lon,
    lat,
    row_number() OVER (ORDER BY city) AS n
  FROM sites
), expanded AS (
  SELECT
    format('CAM-%s-%s', upper(left(city, 3)), lpad(((n - 1) * 2 + k)::text, 3, '0')) AS id,
    department,
    lon + (k * 0.004) AS lon,
    lat + (k * 0.003) AS lat,
    CASE WHEN k = 1 THEN 'live' ELSE 'offline' END::camera_status AS status
  FROM numbered
  CROSS JOIN generate_series(1, 2) AS k
)
INSERT INTO cameras (id, department, location, status, vendor, stream_health)
SELECT
  id,
  department,
  ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
  status,
  'ONVIF-demo',
  CASE WHEN status = 'live' THEN 'ok' ELSE 'down' END
FROM expanded
ON CONFLICT (id) DO NOTHING;

-- Two extra border/traffic sites to reach 50+
INSERT INTO cameras (id, department, location, status, vendor, stream_health)
VALUES
  ('CAM-FCS-001', 'Food & Civil Supplies', ST_SetSRID(ST_MakePoint(72.5800, 23.0300), 4326)::geography, 'live', 'ONVIF-demo', 'ok'),
  ('CAM-FCS-002', 'Food & Civil Supplies', ST_SetSRID(ST_MakePoint(72.8400, 21.1750), 4326)::geography, 'offline', 'ONVIF-demo', 'down')
ON CONFLICT (id) DO NOTHING;

INSERT INTO watchlist (plate_normalized, plate_raw, reason, added_by)
SELECT
  v.plate_normalized,
  v.plate_raw,
  v.reason,
  u.id
FROM users u
CROSS JOIN (
  VALUES
    ('GJ01AB1234', 'GJ-01-AB-1234', 'Demo stolen vehicle — live-eval track target'),
    ('GJ05XY9999', 'GJ-05-XY-9999', 'Demo wanted-person associated vehicle')
) AS v(plate_normalized, plate_raw, reason)
WHERE u.email = 'admin@sentinel.local'
  AND NOT EXISTS (
    SELECT 1 FROM watchlist w
    WHERE w.plate_normalized = v.plate_normalized AND w.active
  );

-- Mock adapter bases (HTTPS only). Real hosts are swapped when NIC provides them.
INSERT INTO outbound_allowlist (name, base_url, enabled)
VALUES
  ('VAHAN',    'https://vahan.placeholder.local/',    FALSE),
  ('SARTHI',   'https://sarthi.placeholder.local/',   FALSE),
  ('eGujCop',  'https://egujcop.placeholder.local/',  FALSE),
  ('AFIS',     'https://afis.placeholder.local/',     FALSE),
  ('NAFIS',    'https://nafis.placeholder.local/',    FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO audit_log (actor, actor_role, action, target_table, target_id, payload)
SELECT
  u.id,
  'admin',
  'seed.complete',
  'cameras',
  NULL,
  jsonb_build_object('source', '07_seed.sql', 'note', 'demo registry onboarded')
FROM users u
WHERE u.email = 'admin@sentinel.local';
