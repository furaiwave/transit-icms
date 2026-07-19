import { useMemo, type JSX } from 'react';
import type {
  HistoryPoint,
  RouteDto,
  VehicleId,
  VehicleSnapshot,
} from '@icms/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const W = 1000;
const H = 600;
const PAD = 56;

interface SchematicMapProps {
  readonly routes: readonly RouteDto[];
  readonly vehicles: readonly VehicleSnapshot[];
  readonly selectedId: VehicleId | null;
  readonly selectedHistory: readonly HistoryPoint[];
  readonly onSelect: (id: VehicleId) => void;
}

type Project = (lat: number, lon: number) => readonly [number, number];

const markerTone = (v: VehicleSnapshot): string => {
  if (v.status === 'OFFLINE') return '#6B7A99';
  if (v.lastAnomaly === 'GPS_JUMP' || v.lastAnomaly === 'OFF_ROUTE') return '#FF4D4F';
  if (v.lastAnomaly === 'SPEED_SPIKE') return '#FFB020';
  if (v.status === 'HELD') return '#FFB020';
  return '#35D07F';
};

/**
 * Мнемосхема: SVG-проєкція геометрії маршрутів у власну систему координат.
 * Для вибраного борту показано «сирий» GPS проти фільтрованої траєкторії —
 * візуальна демонстрація роботи фільтра Калмана.
 */
export const SchematicMap = ({
  routes,
  vehicles,
  selectedId,
  selectedHistory,
  onSelect,
}: SchematicMapProps): JSX.Element => {
  const project = useMemo((): Project => {
    const lats = routes.flatMap((r) => r.polyline.map(([lat]) => lat as number));
    const lons = routes.flatMap((r) => r.polyline.map(([, lon]) => lon as number));
    if (lats.length === 0) return () => [W / 2, H / 2] as const;
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const kLon = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = Math.max(1e-6, (maxLon - minLon) * kLon);
    const spanY = Math.max(1e-6, maxLat - minLat);
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    return (lat, lon) =>
      [
        PAD + ((lon - minLon) * kLon * scale + ((W - PAD * 2) - spanX * scale) / 2),
        H - PAD - ((lat - minLat) * scale + ((H - PAD * 2) - spanY * scale) / 2),
      ] as const;
  }, [routes]);

  const selected = vehicles.find((v) => v.vehicleId === selectedId) ?? null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Мнемосхема мережі</CardTitle>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-dim">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-ok" /> норма</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-warn" /> увага</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-danger" /> критично</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-1.5">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Схема маршрутів">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16203A" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />

          {routes.map((route) => (
            <g key={route.routeId}>
              <polyline
                points={route.polyline.map(([lat, lon]) => project(lat, lon).join(',')).join(' ')}
                fill="none"
                stroke={route.color}
                strokeWidth="3"
                strokeOpacity="0.55"
                strokeLinejoin="round"
              />
              {route.stops.map((stop) => {
                const [x, y] = project(stop.lat, stop.lon);
                return (
                  <g key={stop.stopId}>
                    <circle cx={x} cy={y} r="4" fill="#0B1220" stroke={route.color} strokeWidth="1.6" />
                    <text x={x + 7} y={y - 6} fontSize="10" fill="#6B7A99" fontFamily="ui-monospace, monospace">
                      {stop.name}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {selected && selectedHistory.length > 1 && (
            <g>
              {selectedHistory.filter((_, i) => i % 2 === 0).map((p) => {
                const [x, y] = project(p.rawLat, p.rawLon);
                return <circle key={p.ts} cx={x} cy={y} r="1.6" fill="#6B7A99" fillOpacity="0.7" />;
              })}
              <polyline
                points={selectedHistory
                  .map((p) => project(p.filteredLat, p.filteredLon).join(','))
                  .join(' ')}
                fill="none"
                stroke="#FFB020"
                strokeWidth="1.8"
                strokeDasharray="none"
              />
            </g>
          )}

          {vehicles.map((v) => {
            const [fx, fy] = project(v.filtered.lat, v.filtered.lon);
            const [rx, ry] = project(v.raw.lat, v.raw.lon);
            const tone = markerTone(v);
            const isSel = v.vehicleId === selectedId;
            return (
              <g key={v.vehicleId} onClick={() => onSelect(v.vehicleId)} className="cursor-pointer">
                {isSel && (
                  <>
                    <line x1={rx} y1={ry} x2={fx} y2={fy} stroke="#6B7A99" strokeDasharray="3 3" />
                    <circle cx={rx} cy={ry} r="3" fill="none" stroke="#6B7A99" />
                    <circle cx={fx} cy={fy} r="13" fill="none" stroke={tone} strokeOpacity="0.5" />
                  </>
                )}
                <g transform={`translate(${fx} ${fy}) rotate(${v.heading})`}>
                  <polygon points="0,-8 5.5,7 -5.5,7" fill={tone} stroke="#0B1220" strokeWidth="1" />
                </g>
                <text
                  x={fx + 10}
                  y={fy + 4}
                  fontSize="10"
                  fill={isSel ? '#D7E0F0' : '#6B7A99'}
                  fontFamily="ui-monospace, monospace"
                >
                  {v.vehicleId}
                </text>
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
};