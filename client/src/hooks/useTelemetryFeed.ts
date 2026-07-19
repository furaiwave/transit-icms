import { useEffect, useState } from 'react';
import type {
  AnomalyRecord,
  ControlAck,
  SystemStatsDto,
  VehicleId,
  VehicleSnapshot,
  WsServerMessage,
} from '@icms/shared';
import { subscribeWs } from '@/lib/socket';

const ANOMALY_UI_LIMIT = 120;

export interface TelemetryFeed {
  readonly connected: boolean;
  readonly vehicles: ReadonlyMap<VehicleId, VehicleSnapshot>;
  readonly anomalies: readonly AnomalyRecord[];
  readonly stats: SystemStatsDto | null;
  readonly lastAck: ControlAck | null;
}

/**
 * Живое состояние системы из WS-шины.
 * switch по discriminated union WsServerMessage — исчерпывающий:
 * новое событие протокола не скомпилируется, пока не обработано здесь.
 */
export const useTelemetryFeed = (): TelemetryFeed => {
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<ReadonlyMap<VehicleId, VehicleSnapshot>>(new Map());
  const [anomalies, setAnomalies] = useState<readonly AnomalyRecord[]>([]);
  const [stats, setStats] = useState<SystemStatsDto | null>(null);
  const [lastAck, setLastAck] = useState<ControlAck | null>(null);

  useEffect(() => {
    const apply = (message: WsServerMessage): void => {
      switch (message.type) {
        case 'snapshot':
          setVehicles(new Map(message.payload.map((v) => [v.vehicleId, v] as const)));
          break;
        case 'vehicle':
          setVehicles((prev) => {
            const next = new Map(prev);
            next.set(message.payload.vehicleId, message.payload);
            return next;
          });
          break;
        case 'anomaly':
          setAnomalies((prev) => [message.payload, ...prev].slice(0, ANOMALY_UI_LIMIT));
          break;
        case 'stats':
          setStats(message.payload);
          break;
        case 'control-ack':
          setLastAck(message.payload);
          break;
        default:
          assertNever(message);
      }
    };
    return subscribeWs(apply, setConnected);
  }, []);

  return { connected, vehicles, anomalies, stats, lastAck };
};

const assertNever = (x: never): never => {
  throw new Error(`Невідоме повідомлення шини: ${JSON.stringify(x)}`);
};