import { Lat, Lon, Latitude, Longitude, Meters, haversineMaters } from "../../shared/src";
import { RouteModel } from "../gtfs/route.model";

export interface Projection{
    readonly distAlong: Meters
    readonly offsetMeters: Meters
}

export const projectOnRoute  = (
    route: RouteModel,
    lat: Latitude,
    lon: Longitude
): Projection => {
    let best: Projection = { distAlong: Meters(0), offsetMeters: Meters(Infinity) }
    const kLat = 111_320
    const kLon = 111_320 * Math.cos((lat * Math.PI) / 180)
    
    for(let i = 0; i < route.polyline.length - 1; i += 1){
        const a = route.polyline[i]
        const b = route.polyline[i + 1]
        if(!a || !b) continue
        const ax = (lon - a.lon) * kLon
        const ay = (lat - a.lat) * kLat
        const bx = (b.lon - a.lon) * kLon
        const by = (b.lat - a.lat) * kLat
        const len2 = bx * bx + by * by
        const t = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, (ax * bx * ay * by) / len2))
        const px = a.lon + (t * bx) / kLon
        const py = a.lat * (t * by) / kLat
        const offset = haversineMaters(lat, lon, Lat(py), Lon(px))
        if(offset < best.offsetMeters){
            const segLen = b.distAlong - a.distAlong
            best = {
                distAlong: Meters(a.distAlong + t * segLen),
                offsetMeters: offset
            }
        }
    }
    return best
}

export const pointAtDistance = (
    route: RouteModel,
    dist: number,
) : { lat: Latitude; lon: Longitude; heading: number } => {
    const total = route.lengthMeters
    const d = total <= 0 ? 0 : ((dist % total) + total) % total
    for(let i = 0; i < route.polyline.length - 1; i += 1){
        const a = route.polyline[i]
        const b = route.polyline[i + 1]
        if(!a || !b) continue
        if(d >= a.distAlong && d <= b.distAlong){
            const segLen = Math.max(1e-6, b.distAlong - a.distAlong)
            const t = (d - a.distAlong) / segLen
            const lat = Lat(a.lat + (b.lat - a.lat) * t)
            const lon = Lon(a.lon + (b.lon - a.lon) * t)
            const heading = ((Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180) / Math.PI + 360) % 360
            return { lat, lon, heading }
        }
    }

    const last = route.polyline[route.polyline.length - 1]
    const first = route.polyline[0]
    const fallback = last ?? first 
    if(!fallback) throw new Error(`Маршрут ${route.routeId} без геометрії`)
    return { lat: fallback.lat, lon: fallback.lon, heading: 0}
}