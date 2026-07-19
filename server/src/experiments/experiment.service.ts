import { Injectable } from '@nestjs/common';
import {
  Meters,
  ProcessedFrame,
  RouteId,
  StopId,
  UnixMs,
  VehicleId,
  haversineMaters,
} from '../../shared/src';
import { GtfsService } from '../gtfs/gtfs.service';
import { RouteModel } from '../gtfs/route.model';

/** Еталонний стан борту до накладання шуму — його знає лише симулятор. */
export interface TruthSample {
  readonly vehicleId: VehicleId;
  readonly routeId: RouteId;
  readonly ts: UnixMs;
  readonly lat: number;
  readonly lon: number;
  readonly speedKmh: number;
  readonly dist: number;
  /** Яку несправність симулятор навмисно вніс саме в цей кадр */
  readonly injectedFault: 'GPS_JUMP' | 'SPEED_SPIKE' | null;
}

interface ErrorAccumulator {
  sumSqRaw: number;
  sumSqFiltered: number;
  sumAbsRaw: number;
  sumAbsFiltered: number;
  maxRaw: number;
  maxFiltered: number;
  n: number;
}

interface DetectionCounts {
  tp: number;
  fp: number;
  fn: number;
}

interface EtaPrediction {
  readonly stopId: StopId;
  readonly madeAt: number;
  readonly horizonSec: number;
  readonly predictedArrival: number;
}

interface EtaBucket {
  readonly label: string;
  readonly maxHorizonSec: number;
  sumAbsErr: number;
  sumErr: number;
  n: number;
}

const PERF_RING = 4_000;
const MAX_PREDICTIONS_PER_VEHICLE = 600;
/** Скільки кадрів детектор має на реакцію після ін'єкції, перш ніж це FN. */
const DETECTION_GRACE_FRAMES = 2;

const newBuckets = (): EtaBucket[] => [
  { label: 'до 60 с', maxHorizonSec: 60, sumAbsErr: 0, sumErr: 0, n: 0 },
  { label: '60–180 с', maxHorizonSec: 180, sumAbsErr: 0, sumErr: 0, n: 0 },
  { label: '180–300 с', maxHorizonSec: 300, sumAbsErr: 0, sumErr: 0, n: 0 },
  { label: 'понад 300 с', maxHorizonSec: Infinity, sumAbsErr: 0, sumErr: 0, n: 0 },
];

/**
 * Накопичувач експериментальних вимірів (розділ 3 звіту).
 *
 * Ключова ідея: симулятор знає ІСТИННЕ положення борту до накладання
 * гаусівського шуму, а також момент, коли він навмисно вніс несправність.
 * Це дає ground truth, недоступний у продуктивній системі, і саме тому
 * похибки фільтрації та повноту/точність детекторів можна порахувати чесно.
 */
@Injectable()
export class ExperimentService {
  constructor(private readonly gtfs: GtfsService) {}

  private startedAt = Date.now();
  private readonly pendingTruth = new Map<VehicleId, TruthSample>();
  private readonly prevDist = new Map<VehicleId, number>();
  private readonly expectation = new Map<VehicleId, { code: 'GPS_JUMP' | 'SPEED_SPIKE'; framesLeft: number }>();
  private readonly predictions = new Map<VehicleId, EtaPrediction[]>();

  private position: ErrorAccumulator = blankAccumulator();
  private readonly detection = new Map<string, DetectionCounts>();
  /** Спрацювання, для яких у симуляторі немає еталона (OFF_ROUTE, STALE_FRAME) */
  private readonly unmatched = new Map<string, number>();
  private buckets = newBuckets();
  private perf: number[] = [];
  private framesSeen = 0;
  private framesRejected = 0;

  reset(): void {
    this.startedAt = Date.now();
    this.pendingTruth.clear();
    this.prevDist.clear();
    this.expectation.clear();
    this.predictions.clear();
    this.position = blankAccumulator();
    this.detection.clear();
    this.unmatched.clear();
    this.buckets = newBuckets();
    this.perf = [];
    this.framesSeen = 0;
    this.framesRejected = 0;
  }

  /** Симулятор повідомляє еталон безпосередньо перед відправкою кадру в конвеєр. */
  recordTruth(sample: TruthSample): void {
    this.pendingTruth.set(sample.vehicleId, sample);
    if (sample.injectedFault) {
      this.expectation.set(sample.vehicleId, {
        code: sample.injectedFault,
        framesLeft: DETECTION_GRACE_FRAMES,
      });
    }
    this.resolveArrivals(sample);
  }

  /** Конвеєр повідомляє результат обробки того самого кадру. */
  recordProcessed(processed: ProcessedFrame, processingMs: number): void {
    this.framesSeen += 1;
    this.perf.push(processingMs);
    if (this.perf.length > PERF_RING) this.perf.shift();

    const vehicleId = processed.raw.vehicleId;
    const truth = this.pendingTruth.get(vehicleId);
    this.pendingTruth.delete(vehicleId);

    if (processed.kind === 'rejected') {
      this.framesRejected += 1;
      this.countUnmatched(processed.code);
      return;
    }

    if (truth && truth.injectedFault === null) {
      this.accumulatePosition(truth, processed);
    }
    this.scoreDetection(vehicleId, processed);
    if (processed.eta) {
      this.recordPrediction(vehicleId, processed.raw.ts, processed.eta.stopId, processed.eta.etaSeconds);
    }
  }

  private accumulatePosition(truth: TruthSample, processed: Extract<ProcessedFrame, { filtered: unknown }>): void {
    const errRaw = haversineMaters(
      truth.lat as never,
      truth.lon as never,
      processed.raw.lat,
      processed.raw.lon,
    );
    const errFiltered = haversineMaters(
      truth.lat as never,
      truth.lon as never,
      processed.filtered.lat,
      processed.filtered.lon,
    );
    const a = this.position;
    a.sumSqRaw += errRaw * errRaw;
    a.sumSqFiltered += errFiltered * errFiltered;
    a.sumAbsRaw += errRaw;
    a.sumAbsFiltered += errFiltered;
    a.maxRaw = Math.max(a.maxRaw, errRaw);
    a.maxFiltered = Math.max(a.maxFiltered, errFiltered);
    a.n += 1;
  }

  /**
   * Зіставлення «внесено» ↔ «виявлено». Детектору дається DETECTION_GRACE_FRAMES
   * кадрів на реакцію: стрибок GPS видно за інновацією вже в тому ж кадрі, але
   * сплеск швидкості може бути підтверджений наступним.
   */
  private scoreDetection(vehicleId: VehicleId, processed: ProcessedFrame): void {
    const detected = processed.kind === 'anomaly' ? processed.code : null;
    const expected = this.expectation.get(vehicleId);

    if (detected === 'GPS_JUMP' || detected === 'SPEED_SPIKE') {
      if (expected && expected.code === detected) {
        this.counts(detected).tp += 1;
        this.expectation.delete(vehicleId);
        return;
      }
      this.counts(detected).fp += 1;
    } else if (detected) {
      // OFF_ROUTE не інжектується симулятором — рахуємо окремо, не як FP
      this.countUnmatched(detected);
    }

    if (expected) {
      expected.framesLeft -= 1;
      if (expected.framesLeft <= 0) {
        this.counts(expected.code).fn += 1;
        this.expectation.delete(vehicleId);
      }
    }
  }

  private recordPrediction(vehicleId: VehicleId, ts: number, stopId: StopId, etaSeconds: number): void {
    const list = this.predictions.get(vehicleId) ?? [];
    list.push({
      stopId,
      madeAt: ts,
      horizonSec: etaSeconds,
      predictedArrival: ts + etaSeconds * 1000,
    });
    if (list.length > MAX_PREDICTIONS_PER_VEHICLE) list.shift();
    this.predictions.set(vehicleId, list);
  }

  /**
   * Фактичний час прибуття беремо з еталонного пробігу: борт «прибув» на
   * зупинку в тому такті, де істинна відстань вздовж маршруту перетнула її.
   */
  private resolveArrivals(sample: TruthSample): void {
    const route = this.gtfs.byId(sample.routeId);
    const prev = this.prevDist.get(sample.vehicleId);
    this.prevDist.set(sample.vehicleId, sample.dist);
    if (!route || prev === undefined || prev === sample.dist) return;

    for (const stop of crossedStops(route, prev, sample.dist)) {
      const list = this.predictions.get(sample.vehicleId);
      if (!list?.length) continue;
      const remaining: EtaPrediction[] = [];
      for (const p of list) {
        if (p.stopId !== stop.stopId) {
          remaining.push(p);
          continue;
        }
        const errSec = (sample.ts - p.predictedArrival) / 1000;
        const bucket = this.buckets.find((b) => p.horizonSec < b.maxHorizonSec) ?? this.buckets[this.buckets.length - 1];
        if (bucket) {
          bucket.sumAbsErr += Math.abs(errSec);
          bucket.sumErr += errSec;
          bucket.n += 1;
        }
      }
      this.predictions.set(sample.vehicleId, remaining);
    }
  }

  private counts(code: string): DetectionCounts {
    const existing = this.detection.get(code);
    if (existing) return existing;
    const fresh: DetectionCounts = { tp: 0, fp: 0, fn: 0 };
    this.detection.set(code, fresh);
    return fresh;
  }

  private countUnmatched(code: string): void {
    this.unmatched.set(code, (this.unmatched.get(code) ?? 0) + 1);
  }

  /** Зріз накопичених вимірів для побудови таблиць звіту. */
  snapshot(): ExperimentSnapshot {
    const a = this.position;
    const rmseRaw = a.n ? Math.sqrt(a.sumSqRaw / a.n) : 0;
    const rmseFiltered = a.n ? Math.sqrt(a.sumSqFiltered / a.n) : 0;
    const sorted = [...this.perf].sort((x, y) => x - y);
    const p95 = sorted.length ? (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0) : 0;
    const sum = this.perf.reduce((s, x) => s + x, 0);

    return {
      collectingSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      framesSeen: this.framesSeen,
      framesRejected: this.framesRejected,
      position: {
        samples: a.n,
        rmseRaw,
        rmseFiltered,
        maeRaw: a.n ? a.sumAbsRaw / a.n : 0,
        maeFiltered: a.n ? a.sumAbsFiltered / a.n : 0,
        maxRaw: a.maxRaw,
        maxFiltered: a.maxFiltered,
        // K_ф — у скільки разів фільтр зменшив середньоквадратичну похибку
        improvement: rmseFiltered > 0 ? rmseRaw / rmseFiltered : 0,
      },
      detection: [...this.detection.entries()].map(([code, c]) => ({
        code,
        ...c,
        precision: c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : null,
        recall: c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : null,
      })),
      unmatched: [...this.unmatched.entries()].map(([code, n]) => ({ code, n })),
      eta: this.buckets.map((b) => ({
        label: b.label,
        samples: b.n,
        maeSeconds: b.n ? b.sumAbsErr / b.n : 0,
        biasSeconds: b.n ? b.sumErr / b.n : 0,
      })),
      performance: {
        samples: this.perf.length,
        avgMs: this.perf.length ? sum / this.perf.length : 0,
        p95Ms: p95,
        maxMs: sorted.length ? (sorted[sorted.length - 1] ?? 0) : 0,
      },
    };
  }
}

export interface ExperimentSnapshot {
  readonly collectingSeconds: number;
  readonly framesSeen: number;
  readonly framesRejected: number;
  readonly position: {
    readonly samples: number;
    readonly rmseRaw: number;
    readonly rmseFiltered: number;
    readonly maeRaw: number;
    readonly maeFiltered: number;
    readonly maxRaw: number;
    readonly maxFiltered: number;
    readonly improvement: number;
  };
  readonly detection: readonly {
    readonly code: string;
    readonly tp: number;
    readonly fp: number;
    readonly fn: number;
    readonly precision: number | null;
    readonly recall: number | null;
  }[];
  readonly unmatched: readonly { readonly code: string; readonly n: number }[];
  readonly eta: readonly {
    readonly label: string;
    readonly samples: number;
    readonly maeSeconds: number;
    readonly biasSeconds: number;
  }[];
  readonly performance: {
    readonly samples: number;
    readonly avgMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
  };
}

const blankAccumulator = (): ErrorAccumulator => ({
  sumSqRaw: 0,
  sumSqFiltered: 0,
  sumAbsRaw: 0,
  sumAbsFiltered: 0,
  maxRaw: 0,
  maxFiltered: 0,
  n: 0,
});

/** Зупинки, які борт проминув між двома тактами, з урахуванням замикання кільця. */
const crossedStops = (route: RouteModel, prev: number, now: number): readonly { stopId: StopId; distAlong: Meters }[] =>
  now >= prev
    ? route.stops.filter((s) => s.distAlong > prev && s.distAlong <= now)
    : route.stops.filter((s) => s.distAlong > prev || s.distAlong <= now);
