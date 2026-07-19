import type { JSX } from 'react';
import type { SystemStatsDto } from '@icms/shared';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  readonly stats: SystemStatsDto | null;
}

interface Metric {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'ok' | 'warn';
}

export const StatsCards = ({ stats }: StatsCardsProps): JSX.Element => {
  const anomaliesTotal = stats
    ? Object.values(stats.anomaliesByCode).reduce((a, b) => a + b, 0)
    : 0;

  const metrics: readonly Metric[] = [
    { label: 'Бортів online', value: stats ? String(stats.vehiclesOnline) : '—', tone: 'ok' },
    { label: 'Кадрів / хв', value: stats ? String(stats.framesPerMinute) : '—' },
    { label: 'Обробка, мс', value: stats ? stats.avgProcessingMs.toFixed(2) : '—' },
    { label: 'Аномалій', value: stats ? String(anomaliesTotal) : '—', tone: 'warn' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardContent className="p-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              {m.label}
            </div>
            <div
              className={`mt-1 font-mono text-lg tabular-nums ${
                m.tone === 'ok' ? 'text-ok' : m.tone === 'warn' ? 'text-warn' : 'text-ink'
              }`}
            >
              {m.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};