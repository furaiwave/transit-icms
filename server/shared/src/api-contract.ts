import type { ControlAck, ControlCommand, EtaBoardEntry, GtfsLoadResult, HistoryPoint, RouteDto, SimulationCommand, SimulationState, SystemStatsDto, VehicleSnapshot } from "./dto";
import type { AnomalyRecord, ProcessedFrame } from "./processing";
import type { ReportCommand, ReportDto } from "./report";
import type { RawTelemetryInput } from "./telemetry";

export type HttpMethod = 'GET' | 'POST'

export interface ApiContract {
    'GET /api/routes': { response: readonly RouteDto[] }
    'GET /api/vehicles': { response: readonly VehicleSnapshot[] }
    'GET /api/vehicles/:vehicleId/history': { response: readonly HistoryPoint[] }
    'GET /api/anomalies': { response: readonly AnomalyRecord[] }
    'GET /api/stats': { response: SystemStatsDto }
    'GET /api/eta': { response: readonly EtaBoardEntry[] }
    'GET /api/report': { response: ReportDto }
    'POST /api/report': { body: ReportCommand; response: ReportDto }
    'POST /api/telemetry': { body: RawTelemetryInput; response: ProcessedFrame }
    'POST /api/control': { body: ControlCommand; response: ControlAck }
    'POST /api/simulation': { body: SimulationCommand; response: SimulationState }
    'POST /api/gtfs/reload': { body: { source: 'sample' }; response: GtfsLoadResult }
}

export type EndpointKey = keyof ApiContract & string

type SplitKey<K extends string> = K extends `${infer M extends HttpMethod} ${infer P}` 
    ? [method: M, path: P] 
    : never

export type MethodOf<K extends EndpointKey> = SplitKey<K>[0]
export type PathOf<K extends EndpointKey> = SplitKey<K>[1]

export type PathParams<P extends string> = 
    P extends `${string}:${infer Param}/${infer Rest}` 
     ? { readonly [K in Param | keyof PathParams<`/${Rest}`>]: string }
     : P extends `${string}:${infer Param}`
     ? { readonly [K in Param]: string }
     : Record<never, never>

export type BodyOf<K extends EndpointKey> = ApiContract[K] extends { body: infer B } ? B : never
export type ResponseOf<K extends EndpointKey> = ApiContract[K]['response']

type HasParams<K extends EndpointKey> = [keyof PathParams<PathOf<K>>] extends [never] ? false : true

export type RequestArgs<K extends EndpointKey> = [BodyOf<K>] extends[never] 
    ? HasParams<K> extends true
        ? [params: PathParams<PathOf<K>>]
        : []
    : HasParams<K> extends true
        ? [params: PathParams<PathOf<K>>, body: BodyOf<K>]
        : [body: BodyOf<K>]

export interface ApiErrorShape {
    readonly code: string
    readonly message: string
    readonly details?: unknown
}

export type ApiEnvelope<T> = 
    { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: ApiErrorShape }