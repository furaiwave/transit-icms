import { useEffect, useState, type JSX } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { VehicleId, VehicleSnapshot } from '@icms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtClock } from '@/lib/utils';

const CHART_LIMIT = 150;

interface SpeedPoint {
  readonly t: string;
  readonly raw: number;
  readonly filtered: number;
}

interface SpeedChartProps {
  readonly vehicleId: VehicleId;
  readonly live: VehicleSnapshot | null;
}

/**
 * Демонстрація моделей згладжування: «сира» швидкість (GPS) проти
 * фільтрованої (Калман + EMA). Історія — з REST, продовження — з WS.
 */
export const SpeedChart = ({ vehicleId, live }: SpeedChartProps): JSX.Element => {
  const { data: history } = useApiQuery('GET /api/vehicles/:vehicleId/history', { vehicleId });
  const [points, setPoints] = useState<readonly SpeedPoint[]>([]);

  useEffect(() => {
    if (history) {
      setPoints(
        history.slice(-CHART_LIMIT).map((p) => ({
          t: fmtClock(p.ts),
          raw: Number(p.rawSpeedKmh.toFixed(1)),
          filtered: Number(p.filteredSpeedKmh.toFixed(1)),
        })),
      );
    } else {
      setPoints([]);
    }
  }, [history]);

  const liveTs = live?.updatedAt ?? 0;
  useEffect(() => {
    if (!live || live.vehicleId !== vehicleId) return;
    setPoints((prev) =>
      [
        ...prev,
        {
          t: fmtClock(live.updatedAt),
          raw: Number(live.raw.speedKmh.toFixed(1)),
          filtered: Number(live.filtered.speedKmh.toFixed(1)),
        },
      ].slice(-CHART_LIMIT),
    );
    // залежність саме від updatedAt: нова точка — новий кадр
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTs, vehicleId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Швидкість {vehicleId}: сирий сигнал / модель</CardTitle>
      </CardHeader>
      <CardContent className="h-52.5 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...points]} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#1E2A44" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tick={{ fill: '#6B7A99', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              unit=""
              tick={{ fill: '#6B7A99', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: '#111A2E',
                border: '1px solid #1E2A44',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
              }}
              labelStyle={{ color: '#6B7A99' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }} />
            <Line
              type="monotone"
              dataKey="raw"
              name="сирий GPS"
              stroke="#6B7A99"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="filtered"
              name="фільтр Калмана + EMA"
              stroke="#FFB020"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};