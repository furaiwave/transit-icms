import { useEffect, useState, type JSX } from 'react';
import type { SystemStatsDto } from '@icms/shared';
import { Badge } from '@/components/ui/badge';
import { fmtClock } from '@/lib/utils';

interface HeaderProps {
  readonly connected: boolean;
  readonly stats: SystemStatsDto | null;
}

export const Header = ({ connected, stats }: HeaderProps): JSX.Element => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-warn">
          АСДУ · Транспорт
        </span>
        <span className="hidden text-[11px] text-dim md:inline">
          Моделі обробки даних в інформаційно-керуючих системах
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono">
        <Badge variant={stats?.simulationRunning ? 'ok' : 'neutral'}>
          {stats?.simulationRunning ? 'Симуляція: активна' : 'Симуляція: зупинена'}
        </Badge>
        <Badge variant={connected ? 'ok' : 'danger'}>
          {connected ? 'Канал: online' : 'Канал: offline'}
        </Badge>
        <span className="text-xs tabular-nums text-ink">{fmtClock(nowMs)}</span>
      </div>
    </header>
  );
};