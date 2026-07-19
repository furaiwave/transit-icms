import { Kmh, Latitude, Longitude, UnixMs } from "../../shared/src";
import { Ema } from "./ema";
import { Kalman1D } from "./kalman";
import { MODEL_PARAMS, R_MEASURE } from "./params";
import { RollingStats } from "./rolling-stats";

export class VehicleTracker {
    readonly kalmanLat: Kalman1D
    readonly kalmanLon: Kalman1D
    readonly emaSpeed = new Ema(MODEL_PARAMS.emaAlpha)
    readonly speedStats = new RollingStats(MODEL_PARAMS.rollingWindow)
    frames = 0
    lastTs: UnixMs

    constructor(lat: Latitude, lon: Longitude, ts: UnixMs) {
        this.kalmanLat = new Kalman1D(lat, MODEL_PARAMS.qProcess, R_MEASURE)
        this.kalmanLon = new Kalman1D(lon, MODEL_PARAMS.qProcess, R_MEASURE)
        this.lastTs = ts
    }

    /**
     * measured — сира виміряна швидкість, завжди йде у вікно статистики,
     * інакше детектор викидів отруює власний базовий рівень і залипає.
     * emaSpeed — захищене значення (на викиді підставляємо попередню EMA).
     */
    touch(ts: UnixMs, measured: Kmh, emaSpeed: Kmh = measured): void {
        this.lastTs = ts
        this.frames += 1
        this.emaSpeed.push(emaSpeed)
        this.speedStats.push(measured)
    }
}