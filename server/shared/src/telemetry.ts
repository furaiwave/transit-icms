import { z } from 'zod'
import { Kmh, Lat, Lon, RouteId, UnixMs, VehicleId } from './brand'
import type { Latitude, Longitude } from './brand'

export const TelemetryFrameSchema = z.object({
    vehicleId: z.string().min(1).transform((v): VehicleId => VehicleId(v)),
    routeId: z.string().min(1).transform((v): RouteId => RouteId(v)),
    lat: z.number().min(-90).max(90).transform((v): Latitude => Lat(v)),
    lon: z.number().min(-180).max(180).transform((v): Longitude => Lon(v)),
    speedKmh: z.number().min(0).max(400).transform((v): Kmh => Kmh(v)),
    heading: z.number().min(0).lt(360),
    ts: z.number().int().positive().transform((v): UnixMs => UnixMs(v))
})

export type TelemetryFrame = z.infer<typeof TelemetryFrameSchema>
export type RawTelemetryInput = z.input<typeof TelemetryFrameSchema>