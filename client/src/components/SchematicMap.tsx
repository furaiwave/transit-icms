import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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

/** Межі масштабу: ширина вікна перегляду у власних одиницях схеми. */
const MIN_W = W / 16;
const MAX_W = W * 2;
const BASE_VIEW = { x: 0, y: 0, w: W, h: H };

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface SchematicMapProps {
  readonly routes: readonly RouteDto[];
  readonly vehicles: readonly VehicleSnapshot[];
  readonly selectedId: VehicleId | null;
  readonly selectedHistory: readonly HistoryPoint[];
  readonly onSelect: (id: VehicleId) => void;
}

type Project = (lat: number, lon: number) => readonly [number, number];

const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

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
 *
 * Масштаб і панорамування — через viewBox. Товщини, радіуси й кегль
 * ділимо на зум, щоб підписи й маркери мали сталий розмір на екрані.
 */
export const SchematicMap = ({
  routes,
  vehicles,
  selectedId,
  selectedHistory,
  onSelect,
}: SchematicMapProps): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewBox>(BASE_VIEW);
  // дзеркало стану для обробників, підписаних один раз
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ cx: number; cy: number; vx: number; vy: number; scale: number } | null>(null);
  const movedRef = useRef(false);
  const [panning, setPanning] = useState(false);

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

  /** Масштаб «екранний піксель → одиниця схеми» з поправкою на поля preserveAspectRatio. */
  const fitScale = useCallback((rect: DOMRect, v: ViewBox): number =>
    Math.min(rect.width / v.w, rect.height / v.h), []);

  const toViewBox = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg) return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const rect = svg.getBoundingClientRect();
    const scale = fitScale(rect, v);
    const offX = (rect.width - v.w * scale) / 2;
    const offY = (rect.height - v.h * scale) / 2;
    return {
      x: v.x + (clientX - rect.left - offX) / scale,
      y: v.y + (clientY - rect.top - offY) / scale,
    };
  }, [fitScale]);

  /** Зум із фіксацією точки (cx, cy): вона лишається під курсором. */
  const zoomAt = useCallback((factor: number, cx: number, cy: number): void => {
    setView((v) => {
      const w = clamp(v.w * factor, MIN_W, MAX_W);
      const h = w * (H / W);
      const rx = (cx - v.x) / v.w;
      const ry = (cy - v.y) / v.h;
      return { x: cx - rx * w, y: cy - ry * h, w, h };
    });
  }, []);

  const zoomCenter = useCallback((factor: number): void => {
    const v = viewRef.current;
    zoomAt(factor, v.x + v.w / 2, v.y + v.h / 2);
  }, [zoomAt]);

  // wheel вішаємо вручну: React-обробник пасивний, preventDefault у ньому не спрацює
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const p = toViewBox(e.clientX, e.clientY);
      zoomAt(Math.exp(e.deltaY * 0.0015), p.x, p.y);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toViewBox, zoomAt]);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const svg = svgRef.current;
    if (!svg || e.button !== 0) return;
    const v = viewRef.current;
    drag.current = {
      cx: e.clientX,
      cy: e.clientY,
      vx: v.x,
      vy: v.y,
      scale: fitScale(svg.getBoundingClientRect(), v),
    };
    movedRef.current = false;
    setPanning(true);
    svg.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    // поріг у 3 px відрізняє панорамування від кліку по борту
    if (!movedRef.current && Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    setView((v) => ({ ...v, x: d.vx - dx / d.scale, y: d.vy - dy / d.scale }));
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    drag.current = null;
    setPanning(false);
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  const selected = vehicles.find((v) => v.vehicleId === selectedId) ?? null;
  // k = 1 у базовому масштабі, < 1 при наближенні
  const k = view.w / W;
  const pick = (id: VehicleId) => (): void => {
    if (!movedRef.current) onSelect(id);
  };

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
      <CardContent className="relative min-h-0 flex-1 p-1.5">
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-line bg-panel/90 p-1 font-mono text-xs backdrop-blur">
          <button
            type="button"
            onClick={() => zoomCenter(1 / 1.4)}
            className="h-6 w-6 rounded hover:bg-board"
            aria-label="Наблизити"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomCenter(1.4)}
            className="h-6 w-6 rounded hover:bg-board"
            aria-label="Віддалити"
          >
            −
          </button>
          <span className="w-12 text-center text-dim tabular-nums">{(1 / k).toFixed(1)}×</span>
          <button
            type="button"
            onClick={() => setView(BASE_VIEW)}
            className="h-6 rounded px-1.5 text-dim hover:bg-board"
            aria-label="Скинути масштаб"
          >
            скид
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="h-full w-full touch-none select-none"
          style={{ cursor: panning ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="img"
          aria-label="Схема маршрутів"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16203A" strokeWidth={k} />
            </pattern>
          </defs>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" />

          {routes.map((route) => (
            <g key={route.routeId}>
              <polyline
                points={route.polyline.map(([lat, lon]) => project(lat, lon).join(',')).join(' ')}
                fill="none"
                stroke={route.color}
                strokeWidth={3 * k}
                strokeOpacity="0.55"
                strokeLinejoin="round"
              />
              {route.stops.map((stop) => {
                const [x, y] = project(stop.lat, stop.lon);
                return (
                  <g key={stop.stopId}>
                    <circle cx={x} cy={y} r={4 * k} fill="#0B1220" stroke={route.color} strokeWidth={1.6 * k} />
                    {k < 1.15 && (
                      <text
                        x={x + 7 * k}
                        y={y - 6 * k}
                        fontSize={10 * k}
                        fill="#6B7A99"
                        fontFamily="ui-monospace, monospace"
                      >
                        {stop.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {selected && selectedHistory.length > 1 && (
            <g>
              {selectedHistory.filter((_, i) => i % 2 === 0).map((p) => {
                const [x, y] = project(p.rawLat, p.rawLon);
                return <circle key={p.ts} cx={x} cy={y} r={1.6 * k} fill="#6B7A99" fillOpacity="0.7" />;
              })}
              <polyline
                points={selectedHistory
                  .map((p) => project(p.filteredLat, p.filteredLon).join(','))
                  .join(' ')}
                fill="none"
                stroke="#FFB020"
                strokeWidth={1.8 * k}
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
              <g key={v.vehicleId} onClick={pick(v.vehicleId)} className="cursor-pointer">
                {isSel && (
                  <>
                    <line
                      x1={rx}
                      y1={ry}
                      x2={fx}
                      y2={fy}
                      stroke="#6B7A99"
                      strokeWidth={k}
                      strokeDasharray={`${3 * k} ${3 * k}`}
                    />
                    <circle cx={rx} cy={ry} r={3 * k} fill="none" stroke="#6B7A99" strokeWidth={k} />
                    <circle cx={fx} cy={fy} r={13 * k} fill="none" stroke={tone} strokeOpacity="0.5" strokeWidth={k} />
                  </>
                )}
                <g transform={`translate(${fx} ${fy}) rotate(${v.heading}) scale(${k})`}>
                  <polygon points="0,-8 5.5,7 -5.5,7" fill={tone} stroke="#0B1220" strokeWidth="1" />
                </g>
                <text
                  x={fx + 10 * k}
                  y={fy + 4 * k}
                  fontSize={10 * k}
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
