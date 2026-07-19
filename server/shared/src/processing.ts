import { AnomalyId, Kmh, Meters, RouteId, Seconds, StopId, UnixMs, VehicleId } from "./brand";
import type { Latitude, Longitude } from "./brand";
import type { TelemetryFrame } from "./telemetry";

export interface FilteredState {
    readonly lat: Latitude
    readonly lon: Longitude
    readonly speedKmh: Kmh
    readonly distAlong: Meters
}

export interface EtaInfo{
    readonly stopId: StopId
    readonly stopName: string
    readonly distanceMeters: Meters
    readonly etaSeconds: Seconds
}

export const ANOMALY_CODES = ['SPEED_SPIKE', 'GPS_JUMP', 'STALE_FRAME', 'OFF_ROUTE'] as const

export type AnomalyCode = (typeof ANOMALY_CODES)[number]

export type ProcessedFrame = {
    readonly kind: 'accepted'
    readonly severity: 'ok'
    readonly raw: TelemetryFrame
    readonly filtered: FilteredState
    readonly eta: EtaInfo | null
} | {
    readonly kind: 'anomaly'
    readonly severity: 'warn'
    readonly code: Extract<AnomalyCode, 'SPEED_SPIKE'>
    readonly zScore: number
    readonly raw: TelemetryFrame
    readonly filtered: FilteredState
    readonly eta: EtaInfo | null
} | {
    readonly kind: 'anomaly'
    readonly severity: 'critical'
    readonly code: Extract<AnomalyCode, 'GPS_JUMP' | 'OFF_ROUTE'>
    readonly jumpMeters: Meters
    readonly raw: TelemetryFrame
    readonly filtered: FilteredState
    readonly eta: EtaInfo | null
} | {
    readonly kind: 'rejected'
    readonly severity: 'critical'
    readonly code: Extract<AnomalyCode, 'STALE_FRAME'>
    readonly raw: TelemetryFrame
}

export type FrameOf<K extends ProcessedFrame['kind']> = Extract<ProcessedFrame, { kind: K }>

export interface AnomalyRecord {
    readonly id: AnomalyId
    readonly vehicleId: VehicleId
    readonly routeId: RouteId
    readonly code: AnomalyCode
    readonly severity: 'warn' | 'critical'
    readonly message: string
    readonly value: number
    readonly ts: UnixMs
}