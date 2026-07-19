import type { JSX } from 'react';
import type { RouteDto, RouteId, VehicleId, VehicleSnapshot, VehicleStatus } from '@icms/shared';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, fmtEta } from '@/lib/utils';

interface VehicleListProps {
  readonly vehicles: readonly VehicleSnapshot[];
  readonly routes: readonly RouteDto[];
  readonly selectedId: VehicleId | null;
  readonly onSelect: (id: VehicleId) => void;
}

const STATUS_LABEL: Readonly<Record<VehicleStatus, string>> = {
  MOVING: 'Рух',
  DWELL: 'Зупинка',
  HELD: 'Утримано',
  OFFLINE: 'Offline',
};

const statusVariant = (s: VehicleStatus): 'ok' | 'warn' | 'neutral' =>
  s === 'MOVING' ? 'ok' : s === 'OFFLINE' ? 'neutral' : 'warn';

export const VehicleList = ({
  vehicles,
  routes,
  selectedId,
  onSelect,
}: VehicleListProps): JSX.Element => {
  const colorOf = new Map<RouteId, string>(routes.map((r) => [r.routeId, r.color] as const));

  return (
    <div className="max-h-75 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Борт</TableHead>
            <TableHead>Стан</TableHead>
            <TableHead className="text-right">V сира</TableHead>
            <TableHead className="text-right">V фільтр</TableHead>
            <TableHead>Наступна зупинка</TableHead>
            <TableHead className="text-right">ETA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((v) => (
            <TableRow
              key={v.vehicleId}
              onClick={() => onSelect(v.vehicleId)}
              className={cn('cursor-pointer', v.vehicleId === selectedId && 'bg-line/40')}
            >
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <i
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colorOf.get(v.routeId) ?? '#6B7A99' }}
                  />
                  {v.vehicleId}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(v.status)}>{STATUS_LABEL[v.status]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums text-dim">
                {v.raw.speedKmh.toFixed(0)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-ink">
                {v.filtered.speedKmh.toFixed(0)}
              </TableCell>
              <TableCell className="max-w-32.5 truncate text-dim">
                {v.eta?.stopName ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {v.eta ? fmtEta(v.eta.etaSeconds) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};