import type { JSX } from 'react';
import type { AnomalyRecord } from '@icms/shared';
import { Badge } from '@/components/ui/badge';
import { fmtClock } from '@/lib/utils';

interface AnomalyLogProps {
  readonly anomalies: readonly AnomalyRecord[];
}

export const AnomalyLog = ({ anomalies }: AnomalyLogProps): JSX.Element => {
  if (anomalies.length === 0) {
    return (
      <p className="px-1 py-4 text-center font-mono text-xs text-dim">
        Аномалій не зафіксовано. Введіть несправність із панелі керування, щоб побачити роботу моделей.
      </p>
    );
  }
  return (
    <ul className="max-h-75 space-y-1 overflow-auto pr-1">
      {anomalies.map((a) => (
        <li key={a.id} className="rounded-sm border border-line bg-board/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-xs">
              <Badge variant={a.severity === 'critical' ? 'danger' : 'warn'}>{a.code}</Badge>
              <span className="text-ink">{a.vehicleId}</span>
            </span>
            <span className="font-mono text-[10px] tabular-nums text-dim">{fmtClock(a.ts)}</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-dim">
            {a.message} · значення {a.value}
          </p>
        </li>
      ))}
    </ul>
  );
};