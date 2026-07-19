import { Injectable } from "@nestjs/common";
import { EtaInfo, FilteredState, FrameOf, Kmh, Lat, Lon, Meters, ProcessedFrame, Seconds, TelemetryFrame, VehicleId, haversineMaters, kmhToMetersPerSec } from "../../shared/src";
import { GtfsService } from "../gtfs/gtfs.service";
import { RouteModel } from "../gtfs/route.model";
import type { KalmanStep } from "./kalman";
import { MODEL_PARAMS } from "./params";
import { projectOnRoute } from "./route.projection";
import { VehicleTracker } from "./tracker";

const {
  staleMs: STALE_MS,
  jumpImpliedKmh: JUMP_IMPLIED_KMH,
  jumpMinMeters: JUMP_MIN_METERS,
  minFramesForJump: MIN_FRAMES_FOR_JUMP,
  offRouteMeters: OFF_ROUTE_METERS,
  zThreshold: Z_THRESHOLD,
  minSamplesForZ: MIN_SAMPLES_FOR_Z,
  etaLookaheadMeters: ETA_LOOKAHEAD_M,
  etaMinSpeedMs: ETA_MIN_SPEED_MS,
} = MODEL_PARAMS

@Injectable()
export class PipelineService{
  private readonly trackers = new Map<VehicleId, VehicleTracker>()

  constructor(private readonly gtfs: GtfsService) {}

  reset(): void {
    this.trackers.clear()
  }

  /** Борти, для яких уже існує стан фільтра. */
  get tracked(): readonly VehicleId[] {
    return [...this.trackers.keys()]
  }

  /**
   * Останній такт фільтра Калмана для борту — джерело числового прикладу
   * у звіті. Повертає null, доки борт не пройшов жодного update.
   */
  kalmanTrace(vehicleId: VehicleId): { lat: KalmanStep; lon: KalmanStep; frames: number } | null {
    const tracker = this.trackers.get(vehicleId)
    const lat = tracker?.kalmanLat.lastStep
    const lon = tracker?.kalmanLon.lastStep
    if (!tracker || !lat || !lon) return null
    return { lat, lon, frames: tracker.frames }
  }

  process(frame: TelemetryFrame): ProcessedFrame {
    const tracker = this.trackers.get(frame.vehicleId)

    const isStale = Date.now() - frame.ts > STALE_MS || (tracker !== undefined && frame.ts <= tracker.lastTs)
    if(isStale){
      return {
        kind: 'rejected',
        severity: 'critical',
        code: 'STALE_FRAME',
        raw: frame
      }
    }

    if(!tracker){
      const fresh = new VehicleTracker(frame.lat, frame.lon, frame.ts)
      this.trackers.set(frame.vehicleId, fresh)
      return this.firstFrame(frame, fresh)
    }

    const dt = Math.max(0.05, (frame.ts - tracker.lastTs) / 1000)
    const predictedLat = Lat(tracker.kalmanLat.predict(dt))
    const predictedLon = Lon(tracker.kalmanLon.predict(dt))

    const innovation = haversineMaters(predictedLat, predictedLon, frame.lat, frame.lon)
    const impliedKmh = (innovation / dt) * 3.6
    const isJump = tracker.frames > MIN_FRAMES_FOR_JUMP && innovation > JUMP_MIN_METERS && impliedKmh > JUMP_IMPLIED_KMH

    const zScore = tracker.speedStats.zScore(frame.speedKmh)
    const isSpike = tracker.speedStats.count >= MIN_SAMPLES_FOR_Z && Math.abs(zScore) > Z_THRESHOLD && frame.speedKmh > tracker.speedStats.mean

    let filteredLat = predictedLat
    let filteredLon = predictedLon
    if(!isJump){
      filteredLat = Lat(tracker.kalmanLat.update(frame.lat))
      filteredLon = Lon(tracker.kalmanLon.update(frame.lon))
    }

    tracker.touch(
      frame.ts,
      frame.speedKmh,
      isSpike ? Kmh(tracker.emaSpeed.current) : frame.speedKmh
    )

    const route = this.gtfs.byId(frame.routeId)
    const { filtered, eta, offRouteMeters } = this.finalize(
      route,
      filteredLat,
      filteredLon,
      Kmh(tracker.emaSpeed.current)
    )

    if(isJump){
      return {
        kind: 'anomaly',
        severity: 'critical',
        code: 'GPS_JUMP',
        jumpMeters: innovation,
        raw: frame,
        filtered,
        eta
      }
    }

    if(offRouteMeters !== null && offRouteMeters > OFF_ROUTE_METERS){
      return {
        kind: 'anomaly',
        severity: 'critical',
        code: 'OFF_ROUTE',
        jumpMeters: offRouteMeters,
        raw: frame,
        filtered,
        eta
      }
    }

    if(isSpike){
      return { 
        kind: 'anomaly',
        severity: 'warn',
        code: 'SPEED_SPIKE',
        zScore,
        raw: frame,
        filtered, 
        eta
      }
    }
    return { 
      kind: 'accepted',
      severity: 'ok',
      raw: frame,
      filtered,
      eta
    }
  }

  private firstFrame(frame: TelemetryFrame, tracker: VehicleTracker): FrameOf<'accepted'>{
    tracker.touch(frame.ts, frame.speedKmh)
    const route = this.gtfs.byId(frame.routeId)
    const { filtered, eta } = this.finalize(route, frame.lat, frame.lon, frame.speedKmh)
    return {
      kind: 'accepted',
      severity: 'ok',
      raw: frame,
      filtered,
      eta
    }
  }

  private finalize(
    route: RouteModel | undefined,
    lat: FilteredState['lat'],
    lon: FilteredState['lon'],
    speed: Kmh
  ): { filtered: FilteredState; eta: EtaInfo | null; offRouteMeters: Meters | null } {
    if(!route){
      return {
        filtered: { lat, lon, speedKmh: speed, distAlong: Meters(0) },
        eta: null,
        offRouteMeters: null
      }
    }
    const projection = projectOnRoute(route, lat, lon)
    const filtered: FilteredState = {
      lat, 
      lon,
      speedKmh: speed,
      distAlong: projection.distAlong
    }
    return { filtered, eta: this.eta(route, filtered), offRouteMeters: projection.offsetMeters }
  }

  private eta(route: RouteModel, state: FilteredState): EtaInfo | null {
    const next = route.stops.find((s) => s.distAlong > state.distAlong + ETA_LOOKAHEAD_M) ?? route.stops[0]
    if(!next) return null
    const rawDistance = next.distAlong - state.distAlong
    const distance = Meters(rawDistance >= 0 ? rawDistance : rawDistance + route.lengthMeters)
    const speedMs = Math.max(ETA_MIN_SPEED_MS, kmhToMetersPerSec(state.speedKmh))
    return {
      stopId: next.stopId,
      stopName: next.name,
      distanceMeters: distance,
      etaSeconds: Seconds(Math.round(distance / speedMs))
    }
  }
}