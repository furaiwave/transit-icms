import { z } from "zod";
import { Kmh, Meters, RouteId, Seconds, StopId, UnixMs, VehicleId } from "./brand";
import type { Latitude, Longitude } from "./brand";
import type { LatLon } from "./geo";
import type { AnomalyCode, EtaInfo } from "./processing";

export interface StopDto{
    readonly stopId: StopId
    readonly name: string
    readonly lat: Latitude
    readonly lon: Longitude
    readonly distAlong: Meters
}

export interface RouteDto {
    readonly routeId: RouteId
    readonly shortName: string
    readonly longName: string
    readonly color: string
    readonly lengthMeters: Meters
    readonly stops: readonly StopDto[]
    readonly polyline: readonly LatLon[]
}

export const VEHICLE_STATUSES = ['MOVING', 'DWELL', 'HELD', 'OFFLINE'] as const
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export interface VehicleSnapshot { 
    readonly vehicleId: VehicleId
    readonly routeId: RouteId
    readonly status: VehicleStatus
    readonly heading: number
    readonly raw: { readonly lat: Latitude; readonly lon: Longitude; readonly speedKmh: Kmh }
    readonly filtered: { 
        readonly lat: Latitude
        readonly lon: Longitude
        readonly speedKmh: Kmh
        readonly distAlong: Meters
    }
    readonly eta: EtaInfo | null
    readonly lastAnomaly: AnomalyCode | null
    readonly updatedAt: UnixMs
}

export interface HistoryPoint { 
    readonly ts: UnixMs
    readonly rawSpeedKmh: Kmh
    readonly filteredSpeedKmh: Kmh
    readonly rawLat: Latitude
    readonly rawLon: Longitude
    readonly filteredLat: Latitude
    readonly filteredLon: Longitude
    readonly anomaly: AnomalyCode | null
}

export interface SystemStatsDto {
    readonly framesTotal: number
    readonly framesPerMinute: number
    readonly anomaliesByCode: Readonly<Record<AnomalyCode, number>>
    readonly vehiclesOnline: number
    readonly avgProcessingMs: number
    readonly uptimeSeconds: Seconds
    readonly simulationRunning: boolean
}

export interface EtaBoardEntry {
    readonly stopId: StopId
    readonly stopName: string
    readonly routeId: string
    readonly routeShortName: string
    readonly vehicleId: VehicleId
    readonly etaSeconds: Seconds
}

export interface GtfsLoadResult {
    readonly routes: number
    readonly stops: number
    readonly source: string
}

const zVehicleId = z.string().min(1).transform((v): VehicleId => VehicleId(v))

export const ControlCommandSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('HOLD_VEHICLE'), vehicleId: zVehicleId}),
    z.object({ type: z.literal('RESUME_VEHICLE'), vehicleId: zVehicleId}),
    z.object({
        type: z.literal('SET_TARGET_SPEED'),
        vehicleId: zVehicleId,
        speedKmh: z.number().min(5).max(90),
    }),
    z.object({
        type: z.literal('INJECT_FAULT'),
        vehicleId: zVehicleId,
        fault: z.enum(['GPS_JUMP', 'SPEED_SPIKE'])
    })
])

export type ControlCommand = z.infer<typeof ControlCommandSchema>
export type ControlCommandType = ControlCommand['type']

export type CommandOf<T extends ControlCommandType> = Extract<ControlCommand, { type: T}>

export interface ControlAck {
    readonly accepted: boolean
    readonly command: ControlCommandType
    readonly vehicleId: VehicleId
    readonly message: string
    readonly ts: UnixMs
}

export const SimulationCommandSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('START') }),
    z.object({ type: z.literal('STOP') }),
    z.object({ type: z.literal('SET_TICK'), tickMs: z.number().int().min(200).max(5000)})
])

export type SimulationCommand = z.infer<typeof SimulationCommandSchema>

export interface SimulationState {
    readonly running: boolean
    readonly tickMs: number
    readonly vehicles: number
}