/**
 * The outline of every F1 circuit, for the F1 tab's track maps.
 *
 * From bacinger/f1-circuits (MIT, © Tomislav Bacinger): each circuit is a
 * GeoJSON line in longitude/latitude. Here it is flattened onto a plane, fitted
 * into a 1000-unit box with its proportions kept, thinned to the points that
 * change its shape, and written out keyed by Jolpica's circuit id — so a race
 * from the calendar finds its track without a lookup at request time.
 *
 * Re-run when a new circuit joins the calendar:
 *   node_modules/.bin/tsx scripts/sync-f1-circuits.mts
 */
import { writeFileSync } from "node:fs";

const SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";
const OUT = new URL("../src/lib/f1-circuits.json", import.meta.url);

/** Jolpica's circuitId → bacinger's id. Old circuits included, for past seasons. */
const IDS: Record<string, string> = {
  albert_park: "au-1953",
  shanghai: "cn-2004",
  suzuka: "jp-1962",
  bahrain: "bh-2002",
  jeddah: "sa-2021",
  miami: "us-2022",
  villeneuve: "ca-1978",
  monaco: "mc-1929",
  catalunya: "es-1991",
  red_bull_ring: "at-1969",
  silverstone: "gb-1948",
  spa: "be-1925",
  hungaroring: "hu-1986",
  zandvoort: "nl-1948",
  monza: "it-1922",
  madring: "es-2026",
  baku: "az-2016",
  sepang: "my-1999",
  marina_bay: "sg-2008",
  americas: "us-2012",
  rodriguez: "mx-1962",
  interlagos: "br-1940",
  vegas: "us-2023",
  losail: "qa-2004",
  yas_marina: "ae-2009",
  imola: "it-1953",
  portimao: "pt-2008",
  istanbul: "tr-2005",
  ricard: "fr-1969",
  hockenheimring: "de-1932",
  nurburgring: "de-1927",
  mugello: "it-1914",
  sochi: "ru-2014",
};

type Feature = {
  properties: { id: string; Name: string; length: number; firstgp: number; altitude: number };
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type Pt = [number, number];

/** Ramer–Douglas–Peucker: drop points that lie within `eps` of the line through their neighbours. */
function simplify(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)!];
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i], a, b);
    if (d > worst) [worst, index] = [d, i];
  }
  if (worst <= eps) return [a, b];
  return [...simplify(points.slice(0, index + 1), eps).slice(0, -1), ...simplify(points.slice(index), eps)];
}

function distance([x, y]: Pt, [x1, y1]: Pt, [x2, y2]: Pt) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  return len === 0 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

const geo = (await (await fetch(SOURCE)).json()) as { features: Feature[] };
const byId = new Map(geo.features.map((f) => [f.properties.id, f]));

const out: Record<string, { name: string; length: number; firstGp: number; w: number; h: number; points: Pt[] }> = {};
for (const [jolpica, id] of Object.entries(IDS)) {
  const f = byId.get(id);
  if (!f) {
    console.warn(`no outline for ${jolpica} (${id})`);
    continue;
  }
  const coords = f.geometry.coordinates;
  // Flatten: a degree of longitude shrinks with the cosine of the latitude.
  const lat0 = (coords.reduce((s, c) => s + c[1], 0) / coords.length) * (Math.PI / 180);
  const flat: Pt[] = coords.map(([lon, lat]) => [lon * Math.cos(lat0), -lat]);
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const fitted: Pt[] = flat.map(([x, y]) => [((x - minX) / span) * 1000, ((y - minY) / span) * 1000]);
  const points = simplify(fitted, 2).map(([x, y]) => [Math.round(x), Math.round(y)] as Pt);
  out[jolpica] = {
    name: f.properties.Name,
    length: f.properties.length,
    firstGp: f.properties.firstgp,
    w: Math.max(...points.map((p) => p[0])),
    h: Math.max(...points.map((p) => p[1])),
    points,
  };
}

writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} circuits → ${OUT.pathname}`);
