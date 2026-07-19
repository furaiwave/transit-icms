import type { AnomalyRecord } from "./processing";
import type { ControlAck, SystemStatsDto, VehicleSnapshot } from "./dto";

export type WsServerMessage = 
    | { readonly type: 'snapshot'; readonly payload: readonly VehicleSnapshot[] }
    | { readonly type: 'vehicle'; readonly payload: VehicleSnapshot }
    | { readonly type: 'anomaly'; readonly payload: AnomalyRecord }
    | { readonly type: 'stats'; readonly payload: SystemStatsDto }
    | { readonly type: 'control-ack'; readonly payload: ControlAck }

export type WsMessageType = WsServerMessage['type']

export type WsPayload<T extends WsMessageType> = Extract<WsServerMessage, { type: T }>['payload']

export type WsHandlerMap = {
    readonly [T in WsMessageType]?: (payload: WsPayload<T>) => void
}

export const WS_EVENT = 'icms' as const