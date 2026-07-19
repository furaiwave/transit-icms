import { useState, type JSX } from 'react';
import type { ControlAck, VehicleId } from '@icms/shared';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fmtClock } from '@/lib/utils';

interface DispatchPanelProps {
  readonly selectedId: VehicleId | null;
  readonly simulationRunning: boolean;
  readonly lastAck: ControlAck | null;
}

/**
 * Керуюча частина ІКС. Кожна кнопка збирає конкретну гілку
 * discriminated union ControlCommand — невалідну команду не зібрати.
 */
export const DispatchPanel = ({
  selectedId,
  simulationRunning,
  lastAck,
}: DispatchPanelProps): JSX.Element => {
  const [speed, setSpeed] = useState('45');
  const [tick, setTick] = useState('1000');
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true);
    void action().finally(() => setBusy(false));
  };

  const disabled = busy || selectedId === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Диспетчерське керування</CardTitle>
        <span className="font-mono text-[10px] uppercase tracking-wide text-dim">
          {selectedId ?? 'борт не обрано'}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              selectedId &&
              run(() => api('POST /api/control', { type: 'HOLD_VEHICLE', vehicleId: selectedId }))
            }
          >
            Утримати
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              selectedId &&
              run(() => api('POST /api/control', { type: 'RESUME_VEHICLE', vehicleId: selectedId }))
            }
          >
            Відновити рух
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            inputMode="numeric"
            aria-label="Цільова швидкість, км/год"
            className="w-20"
          />
          <Button
            variant="outline"
            className="flex-1"
            disabled={disabled || Number.isNaN(Number(speed))}
            onClick={() =>
              selectedId &&
              run(() =>
                api('POST /api/control', {
                  type: 'SET_TARGET_SPEED',
                  vehicleId: selectedId,
                  speedKmh: Number(speed),
                }),
              )
            }
          >
            Задати швидкість
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() =>
              selectedId &&
              run(() =>
                api('POST /api/control', {
                  type: 'INJECT_FAULT',
                  vehicleId: selectedId,
                  fault: 'GPS_JUMP',
                }),
              )
            }
          >
            Збій GPS
          </Button>
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() =>
              selectedId &&
              run(() =>
                api('POST /api/control', {
                  type: 'INJECT_FAULT',
                  vehicleId: selectedId,
                  fault: 'SPEED_SPIKE',
                }),
              )
            }
          >
            Викид швидкості
          </Button>
        </div>

        <div className="border-t border-line pt-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            Симуляція потоку
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={simulationRunning ? 'outline' : 'default'}
              disabled={busy}
              onClick={() =>
                run(() =>
                  api('POST /api/simulation', { type: simulationRunning ? 'STOP' : 'START' }),
                )
              }
            >
              {simulationRunning ? 'Зупинити' : 'Запустити'}
            </Button>
            <Input
              value={tick}
              onChange={(e) => setTick(e.target.value)}
              inputMode="numeric"
              aria-label="Такт, мс"
              className="w-20"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || Number.isNaN(Number(tick))}
              onClick={() =>
                run(() => api('POST /api/simulation', { type: 'SET_TICK', tickMs: Number(tick) }))
              }
            >
              Такт, мс
            </Button>
          </div>
        </div>

        {lastAck && (
          <div className="rounded-sm border border-line bg-board/60 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <Badge variant={lastAck.accepted ? 'ok' : 'danger'}>
                {lastAck.accepted ? 'Виконано' : 'Відхилено'}
              </Badge>
              <span className="font-mono text-[10px] tabular-nums text-dim">
                {fmtClock(lastAck.ts)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-dim">{lastAck.message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};