import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GtfsLoadResult, Lat, Lon, Meters, RouteDto, RouteId, StopId, haversineMaters } from "../../shared/src";
import { ParseCSV } from "./csv";
import { RouteModel, RoutePoint, RouteStopModel } from "./route.model";

const ROUTE_COLORS = ['#38BDF8', '#FFB020', '#A78BFA', '#34D399', '#FB7185'] as const 

/** Скільки записів дав кожен файл GTFS — джерело таблиці 1.2 звіту. */
export interface GtfsFileStat {
    readonly file: string
    readonly rows: number
    readonly bytes: number
}

@Injectable()
export class GtfsService implements OnModuleInit {
    private readonly logger = new Logger(GtfsService.name)
    private routes: readonly RouteModel[] = []
    private fileStats: readonly GtfsFileStat[] = []

    onModuleInit(): void {
        this.reload()
    }

    get all(): readonly RouteModel[]{
        return this.routes
    }

    /** Статистика останнього завантаження — рахується під час reload(). */
    get files(): readonly GtfsFileStat[] {
        return this.fileStats
    }

    byId(routeId: RouteId): RouteModel | undefined {
        return this.routes.find((r) => r.routeId === routeId)
    }

    toDto(): readonly RouteDto[] {
        return this.routes.map((r) => ({
            routeId: r.routeId,
            shortName: r.shortName,
            longName: r.longName,
            color: r.color,
            lengthMeters: r.lengthMeters,
            stops: r.stops,
            polyline: r.polyline.map((p) => [p.lat, p.lon] as const)
        }))
    }

    reload(): GtfsLoadResult {
        const dir = join(process.cwd(), 'data', 'gtfs')
        const sizes = new Map<string, number>()
        const read = (name: string): string => {
            const text = readFileSync(join(dir, name), 'utf8')
            sizes.set(name, Buffer.byteLength(text, 'utf8'))
            return text
        }
        const stops = ParseCSV(read('stops.txt'), ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'])
        const routes = ParseCSV(read('routes.txt'), ['route_id', 'route_short_name', 'route_long_name'])
        const trips = ParseCSV(read('trips.txt'), ['route_id', 'trip_id'])
        const stopTime = ParseCSV(read('stop_times.txt'), ['trip_id', 'stop_id', 'stop_sequence'])
        this.fileStats = [
            { file: 'routes.txt', rows: routes.length, bytes: sizes.get('routes.txt') ?? 0 },
            { file: 'trips.txt', rows: trips.length, bytes: sizes.get('trips.txt') ?? 0 },
            { file: 'stops.txt', rows: stops.length, bytes: sizes.get('stops.txt') ?? 0 },
            { file: 'stop_times.txt', rows: stopTime.length, bytes: sizes.get('stop_times.txt') ?? 0 },
        ]
        const stopById = new Map(stops.map((s) => [s.stop_id, s] as const))

        this.routes = routes.map((route, i): RouteModel => {
            const trip = trips.find((t) => t.route_id === route.route_id)
            const sequence = stopTime
                .filter((st) => st.trip_id === trip?.trip_id)
                .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))

            let dist = 0
            let prev: RoutePoint | null = null
            const routeStops: RouteStopModel[] = []
            for (const st of sequence) {
                const stop = stopById.get(st.stop_id)
                if(!stop) continue
                const lat = Lat(Number(stop.stop_lat))
                const lon = Lon(Number(stop.stop_lon))
                if(prev) dist += haversineMaters(prev.lat, prev.lon, lat, lon)
                const point: RouteStopModel = {
                    stopId: StopId(stop.stop_id),
                    name: stop.stop_name,
                    lat,
                    lon,
                    distAlong: Meters(dist)
                }
                routeStops.push(point)
                prev = point
            }

            return {
                routeId: RouteId(route.route_id),
                shortName: route.route_short_name,
                longName: route.route_long_name,
                color: ROUTE_COLORS[i % ROUTE_COLORS.length] ?? '#38BDF8',
                stops: routeStops,
                polyline: routeStops.map(({ lat, lon, distAlong }) => ({ lat, lon, distAlong })),
                lengthMeters: Meters(dist)
            }
        })

        const result: GtfsLoadResult = {
            routes: this.routes.length,
            stops: stops.length,
            source: dir,
        }
        this.logger.log(`GTFS: ${result.routes} routes, ${result.stops} stops from ${dir}`)
        return result
    }
}