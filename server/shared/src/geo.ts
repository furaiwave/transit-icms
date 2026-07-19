import { Kmh, Meters } from "./brand";
import type { Latitude, Longitude } from "./brand";

export type LatLon = readonly[Latitude, Longitude]

const EARTH_R = 6_371_000
const rad = (deg: number): number => (deg * Math.PI) / 180

export const haversineMaters = (
    aLat: Latitude,
    aLon: Longitude,
    bLat: Latitude,
    bLon: Longitude,
): Meters => {
    const dLat = rad(bLat - aLat)
    const dLon = rad(bLon - aLon)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
    return Meters(2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, s))))
}

export const metersPerSecToKmh = (ms: number): Kmh => Kmh(ms * 3.6)
export const kmhToMetersPerSec = (v: Kmh): number => v / 3.6