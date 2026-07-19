import { useEffect, type JSX } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtEta } from '@/lib/utils';

const REFRESH_MS = 5_000;

/** Табло прибуття: тип рядків виведено з ключа 'GET /api/eta' контракту. */
export const EtaBoard = (): JSX.Element => {
  const { data, refetch } = useApiQuery('GET /api/eta');

  useEffect(() => {
    const t = setInterval(refetch, REFRESH_MS);
    return () => clearInterval(t);
  }, [refetch]);

  return (
    <div className="max-h-75 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Зупинка</TableHead>
            <TableHead>Маршрут</TableHead>
            <TableHead>Борт</TableHead>
            <TableHead className="text-right">Прибуття</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).map((row) => (
            <TableRow key={`${row.vehicleId}-${row.stopId}`}>
              <TableCell className="max-w-35 truncate">{row.stopName}</TableCell>
              <TableCell className="text-dim">{row.routeShortName}</TableCell>
              <TableCell className="text-dim">{row.vehicleId}</TableCell>
              <TableCell className="text-right tabular-nums text-warn">
                {fmtEta(row.etaSeconds)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};