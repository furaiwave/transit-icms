import { Kmh, Latitude, Longitude, UnixMs } from "../../shared/src";
import { Ema } from "./ema";
import { Kalman1D } from "./kalman";
import { RollingStats } from "./rolling-stats";

const GPS_SIGMA_DEG = 15 / 111_320
const R_MEASURE = GPS_SIGMA_DEG * GPS_SIGMA_DEG
const Q_PROCESS = 2e-10

export class VehicleTracker {
    readonly kalmanLat: Kalman1D
    readonly kalmanLon: Kalman1D
    readonly emaSpeed = new Ema(0.3)
    readonly speedStats = new RollingStats(30)
    frames = 0
    lastTs: UnixMs

    constructor(lat: Latitude, lon: Longitude, ts: UnixMs) {
        this.kalmanLat = new Kalman1D(lat, Q_PROCESS, R_MEASURE)
        this.kalmanLon = new Kalman1D(lon, Q_PROCESS, R_MEASURE)
        this.lastTs = ts
    }

    touch(ts: UnixMs, speed: Kmh): void {
        this.lastTs = ts
        this.frames += 1
        this.emaSpeed.push(speed)
        this.speedStats.push(speed)
    }
}