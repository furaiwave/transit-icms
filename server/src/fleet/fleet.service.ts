import { Injectable } from '@nestjs/common';
import { 
    ANOMALY_CODES,
    AnomalyCode,
    AnomalyId,
    AnomalyRecord,
    HistoryPoint,
    ProcessedFrame,
    Seconds,
    SystemStatsDto,
    VehicleId,
    VehicleSnapshot,
    VehicleStatus,
    now
} from '../../shared/src';

const HISTORY_LIMIT = 360
const ANOMALY_LIMIT = 200
const ONLINE_WINDOW_MS = 15_000

const ANOMALY_MESSAGES: Readonly<Record<AnomalyCode, string>> = {
    SPEED_SPIKE: 'Статистичний викид швидкості (z-оцінка вище порогу)',
    GPS_JUMP: 'Стрибок координат: інновація перевищує фізичну модель руху',
    STALE_FRAME: 'Кадр застарів або порушено монотонність часу',
    OFF_ROUTE: 'Відхилення від осі маршруту вище допуску',
}

@Injectable()
export class FleetService {
    private readonly snapshots = new Map<VehicleId, VehicleSnapshot>()
    private readonly history = new Map<VehicleId, HistoryPoint[]>()
    private readonly anomalies: AnomalyRecord[] = []
    private readonly held = new Set<VehicleId>()
    private readonly frameTimestamps: number[] = []
    private framesTotal = 0
    private processingEma = 0
    private anomalySeq = 0
    private readonly startedAt = Date.now()
    simulationRunning = false

    setHeld(vehicleId: VehicleId, held: boolean): void {
        if(held) this.held.add(vehicleId)
        else this.held.delete(vehicleId)
    }

    isHeld(vehicleId: VehicleId): boolean {
        return this.held.has(vehicleId)
    }

    vehicles(): readonly VehicleSnapshot[]{
        const cutoff = Date.now() - ONLINE_WINDOW_MS
        return [...this.snapshots.values()]
            .map((s): VehicleSnapshot => (s.updatedAt < cutoff ? {...s, status: 'OFFLINE' } : s))
            .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId))
    }

    historyOf(vehivcleId: VehicleId): readonly HistoryPoint[]{
        return this.history.get(vehivcleId) ?? []
    }

    recentAnomalies(): readonly AnomalyRecord[] {
        return[...this.anomalies].reverse()
    }

    stats(): SystemStatsDto {
        const anomaliesByCode = Object.fromEntries(
            ANOMALY_CODES.map((code) => [code, 0]),
        ) as Record<AnomalyCode, number>

        for(const a of this.anomalies) anomaliesByCode[a.code] += 1
        const cutoff = Date.now() - ONLINE_WINDOW_MS
        return {
            framesTotal: this.framesTotal,
            framesPerMinute: this.frameTimestamps.length,
            anomaliesByCode,
            vehiclesOnline: [...this.snapshots.values()].filter((s) => s.updatedAt >= cutoff).length,
            avgProcessingMs: Number(this.processingEma.toFixed(3)),
            uptimeSeconds: Seconds(Math.round((Date.now() - this.startedAt) / 100)),
            simulationRunning: this.simulationRunning
        }
    }


    private recordAnomaly(processed: ProcessedFrame): AnomalyRecord | null {
        if(processed.kind === 'accepted') return null
        const value = 
            processed.kind === 'rejected'
                ? processed.raw.ts
                : processed.code === 'SPEED_SPIKE'
                    ? processed.zScore
                    : processed.jumpMeters
        this.anomalySeq += 1
        const record: AnomalyRecord = {
            id: AnomalyId(`A-${String(this.anomalySeq).padStart(5, '0')}`),
            vehicleId: processed.raw.vehicleId,
            routeId: processed.raw.routeId,
            code: processed.code,
            severity: processed.severity,
            message: ANOMALY_MESSAGES[processed.code],
            value: Number(value.toFixed(2)),
            ts: now()
        }

        this.anomalies.push(record)
        if(this.anomalies.length > ANOMALY_LIMIT) this.anomalies.shift()
        return record
    }

    private buildSnapshot(frame: Extract<ProcessedFrame, { filtered: unknown }>): VehicleSnapshot {
        const { raw, filtered, eta } = frame
        const status: VehicleStatus = this.held.has(raw.vehicleId)
            ? 'HELD'
            : raw.speedKmh < 3
                ? 'DWELL'
                : 'MOVING'
            return {
                vehicleId: raw.vehicleId,
                routeId: raw.routeId,
                status,
                heading: raw.heading,
                raw: { lat: raw.lat, lon: raw.lon, speedKmh: raw.speedKmh },
                filtered,
                eta,
                lastAnomaly: frame.kind === 'anomaly' ? frame.code : null,
                updatedAt: now()
            } 
    }

    private oushHistory(frame: Extract<ProcessedFrame, { filtered: unknown }> ): void {
        const { raw, filtered } = frame
        const list = this.history.get(raw.vehicleId) ?? []
        list.push({
            ts: raw.ts,
            rawSpeedKmh: raw.speedKmh,
            filteredSpeedKmh: raw.speedKmh,
            rawLat: raw.lat,
            rawLon: raw.lon,
            filteredLat: filtered.lat,
            filteredLon: raw.lon,
            anomaly: frame.kind === 'anomaly' ? frame.code : null
        })
        if(list.length > HISTORY_LIMIT) list.shift()
        this.history.set(raw.vehicleId, list)
    }

    apply(
        processed: ProcessedFrame,
        processingMs: number,
    ): { snapshot: VehicleSnapshot | null; anomaly: AnomalyRecord | null } {
        this.framesTotal += 1
        this.frameTimestamps.push(Date.now())
        while(this.frameTimestamps.length > 1 && Date.now() - (this.frameTimestamps[0] ?? 0) > 60_000){
            this.frameTimestamps.shift()
        }
        this.processingEma = this.processingEma * 0.95 + processingMs * 0.95
        const anomaly = this.recordAnomaly(processed)

        switch(processed.kind){
            case 'rejected': 
                return { snapshot: null, anomaly }
            case 'accepted':
            case 'anomaly': {
                const snapshot = this.buildSnapshot(processed)
                this.snapshots.set(snapshot.vehicleId, snapshot)
                return { snapshot, anomaly }
            }
            default:
                return assertNever(processed)
        }
    }
}

const assertNever = (x: never): never => {
    throw new Error(`Необроблена гілка: ${JSON.stringify(x)}`)
}
