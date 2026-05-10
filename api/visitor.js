const SITE_KEY = "angziii:home";
const MAX_HOTSPOTS = 120;
let neonSql = null;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

function getHeaderNumber(req, name) {
  const value = req.headers[name];
  if (typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getGeo(req) {
  const headerLat = getHeaderNumber(req, "x-vercel-ip-latitude");
  const headerLon = getHeaderNumber(req, "x-vercel-ip-longitude");
  const country = typeof req.headers["x-vercel-ip-country"] === "string" ? req.headers["x-vercel-ip-country"] : "";
  const city = typeof req.headers["x-vercel-ip-city"] === "string" ? decodeURIComponent(req.headers["x-vercel-ip-city"]) : "";

  if (headerLat !== null && headerLon !== null) {
    return { latitude: headerLat, longitude: headerLon, country, city };
  }

  try {
    const ip = getClientIp(req);
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { "User-Agent": "angziii.github.io visitor map" },
    });
    if (!response.ok) throw new Error(`ipapi ${response.status}`);
    const data = await response.json();
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      country: data.country_code || data.country || "",
      city: data.city || "",
    };
  } catch {
    return { latitude: null, longitude: null, country: "", city: "" };
  }
}

function bucketFor(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const bucketLat = Math.round(lat / 6) * 6;
  const bucketLon = Math.round(lon / 6) * 6;
  return { lat: bucketLat, lon: bucketLon };
}

async function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!neonSql) {
    const { neon } = await import("@neondatabase/serverless");
    neonSql = neon(process.env.DATABASE_URL);
  }
  return neonSql;
}

async function ensureSchema(sql) {
  await sql`
    create table if not exists visitor_events (
      id bigserial primary key,
      site_key text not null,
      created_at timestamptz not null default now(),
      ip text,
      country text,
      city text,
      latitude double precision,
      longitude double precision
    )
  `;
  await sql`
    create table if not exists visitor_hotspots (
      site_key text not null,
      bucket_lat integer not null,
      bucket_lon integer not null,
      count integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (site_key, bucket_lat, bucket_lon)
    )
  `;
}

async function recordVisit(sql, req, geo) {
  const inserted = await sql`
    insert into visitor_events (site_key, ip, country, city, latitude, longitude)
    values (${SITE_KEY}, ${getClientIp(req)}, ${geo.country || ""}, ${geo.city || ""}, ${geo.latitude}, ${geo.longitude})
    returning id
  `;

  const bucket = bucketFor(geo.latitude, geo.longitude);
  if (bucket) {
    await sql`
      insert into visitor_hotspots (site_key, bucket_lat, bucket_lon, count)
      values (${SITE_KEY}, ${bucket.lat}, ${bucket.lon}, 1)
      on conflict (site_key, bucket_lat, bucket_lon)
      do update set count = visitor_hotspots.count + 1, updated_at = now()
    `;
  }

  const hotspots = await sql`
    select bucket_lat as lat, bucket_lon as lon, count
    from visitor_hotspots
    where site_key = ${SITE_KEY}
    order by count desc
    limit ${MAX_HOTSPOTS}
  `;

  return {
    visitorNumber: Number(inserted[0]?.id) || null,
    hotspots: hotspots.map((row) => ({
      lat: Number(row.lat),
      lon: Number(row.lon),
      count: Number(row.count),
    })),
  };
}

module.exports = async function visitor(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const geo = await getGeo(req);
    const sql = await getSql();
    let visitorNumber = null;
    let hotspots = [];

    if (sql) {
      await ensureSchema(sql);
      const result = await recordVisit(sql, req, geo);
      visitorNumber = result.visitorNumber;
      hotspots = result.hotspots;
    }

    json(res, 200, {
      ok: true,
      persistent: Boolean(sql),
      visitorNumber,
      geo,
      hotspots,
    });
  } catch (error) {
    json(res, 200, {
      ok: false,
      persistent: false,
      visitorNumber: null,
      geo: { latitude: null, longitude: null, country: "", city: "" },
      hotspots: [],
      error: error.message,
    });
  }
};
