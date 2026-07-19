import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  RawTelemetryInput,
  RouteId,
  SimulationState,
  TelemetryFrameSchema,
  VehicleId,
} from '../../shared/src';
import { FleetService } from '../fleet/fleet.service';
import { TelemetryGateway } from '../gateway/telemetry.gateway';
import { GtfsService } from '../gtfs/gtfs.service';
import { IngestService } from '../processing/ingest.service';
import { pointAtDistance } from '../processing/route.projection';

const VEHICLES_PER_ROUTE = 3;
const GPS_NOISE_METERS = 12;
const DWELL_MS = 6_000;
const STOP_RADIUS_M = 25;

type PendingFault = 'GPS_JUMP' | 'SPEED_SPIKE' | null;

interface SimVehicle {
  readonly vehicleId: VehicleId;
  readonly routeId: RouteId;
  dist: number;
  speedKmh: number;
  targetSpeedKmh: number | null;
  dwellUntil: number;
  pendingFault: PendingFault;
}

/**
 * Імітаційна модель руху парку: борти рухаються вздовж геометрії маршрутів
 * (з GTFS), зупиняються на зупинках, GPS зашумлюється гаусівським шумом.
 * Кадри проходять ЧЕРЕЗ ТУ САМУ схему валідації, що й зовнішні пристрої.
 */
@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly vehicles: SimVehicle[] = [];
  private timer: NodeJS.Timeout | null = null;
  private tickMs = 1_000;

  constructor(
    private readonly gtfs: GtfsService,
    private readonly ingest: IngestService,
    private readonly fleet: FleetService,
    private readonly gateway: TelemetryGateway,
  ) {}

  onModuleInit(): void {
    this.seed();
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  state(): SimulationState {
    return { running: this.timer !== null, tickMs: this.tickMs, vehicles: this.vehicles.length };
  }

  start(): SimulationState {
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.tickMs);
      this.fleet.simulationRunning = true;
      this.logger.log(`Симуляція запущена: ${this.vehicles.length} бортів, такт ${this.tickMs} мс`);
    }
    return this.state();
  }

  stop(): SimulationState {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.fleet.simulationRunning = false;
    }
    return this.state();
  }

  setTick(tickMs: number): SimulationState {
    this.tickMs = tickMs;
    if (this.timer) {
      this.stop();
      this.start();
    }
    return this.state();
  }

  setTargetSpeed(vehicleId: VehicleId, speedKmh: number): boolean {
    const v = this.byId(vehicleId);
    if (v) v.targetSpeedKmh = speedKmh;
    return v !== undefined;
  }

  injectFault(vehicleId: VehicleId, fault: Exclude<PendingFault, null>): boolean {
    const v = this.byId(vehicleId);
    if (v) v.pendingFault = fault;
    return v !== undefined;
  }

  has(vehicleId: VehicleId): boolean {
    return this.byId(vehicleId) !== undefined;
  }

  private byId(vehicleId: VehicleId): SimVehicle | undefined {
    return this.vehicles.find((v) => v.vehicleId === vehicleId);
  }

  private seed(): void {
    this.vehicles.length = 0;
    for (const route of this.gtfs.all) {
      for (let i = 0; i < VEHICLES_PER_ROUTE; i += 1) {
        this.vehicles.push({
          vehicleId: VehicleId(`${route.shortName}-${String(i + 1).padStart(2, '0')}`),
          routeId: route.routeId,
          dist: (route.lengthMeters / VEHICLES_PER_ROUTE) * i,
          speedKmh: 0,
          targetSpeedKmh: null,
          dwellUntil: 0,
          pendingFault: null,
        });
      }
    }
  }

  private tick(): void {
    const dt = this.tickMs / 1000;
    const nowMs = Date.now();
    for (const v of this.vehicles) {
      const route = this.gtfs.byId(v.routeId);
      if (!route || route.lengthMeters <= 0) continue;

      const held = this.fleet.isHeld(v.vehicleId);
      const dwelling = nowMs < v.dwellUntil;
      const cruise =
        v.targetSpeedKmh ?? 32 + 10 * Math.sin(v.dist / 400) + gauss() * 2;
      const target = held || dwelling ? 0 : Math.max(8, cruise);
      // інерція розгону/гальмування
      v.speedKmh += Math.max(-12 * dt * 3.6, Math.min(8 * dt * 3.6, target - v.speedKmh));
      v.speedKmh = Math.max(0, v.speedKmh);
      v.dist = (v.dist + (v.speedKmh / 3.6) * dt) % route.lengthMeters;

      if (!dwelling && !held) {
        const nearStop = route.stops.some(
          (s) => Math.abs(s.distAlong - v.dist) < STOP_RADIUS_M && s.distAlong > 0,
        );
        if (nearStop && v.speedKmh < 15) v.dwellUntil = nowMs + DWELL_MS;
      }

      const { lat, lon, heading } = pointAtDistance(route, v.dist);
      let rawLat = lat + (gauss() * GPS_NOISE_METERS) / 111_320;
      let rawLon =
        lon + (gauss() * GPS_NOISE_METERS) / (111_320 * Math.cos((lat * Math.PI) / 180));
      let rawSpeed = v.speedKmh + Math.abs(gauss()) * 0.8;

      // ін'єкція несправностей для демонстрації моделей детекції
      if (v.pendingFault === 'GPS_JUMP') {
        rawLat += 0.01;
        rawLon += 0.012;
        v.pendingFault = null;
      } else if (v.pendingFault === 'SPEED_SPIKE') {
        rawSpeed = 128 + Math.abs(gauss()) * 10;
        v.pendingFault = null;
      }

      const input: RawTelemetryInput = {
        vehicleId: v.vehicleId,
        routeId: v.routeId,
        lat: clamp(rawLat, -90, 90),
        lon: clamp(rawLon, -180, 180),
        speedKmh: Math.min(399, rawSpeed),
        heading,
        ts: nowMs,
      };
      // симулятор — «зовнішній пристрій»: кадр проходить повну валідацію
      this.ingest.ingest(TelemetryFrameSchema.parse(input));
    }
    this.gateway.broadcast({ type: 'stats', payload: this.fleet.stats() });
  }
}

/** Бокс-Мюллер: стандартний нормальний шум. */
const gauss = (): number => {
  const u = Math.max(Number.EPSILON, Math.random());
  const v = Math.max(Number.EPSILON, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));