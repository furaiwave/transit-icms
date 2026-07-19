import { Latitude, Longitude, Meters, RouteId, StopId } from "../../shared/src";

export interface RoutePoint {
    readonly lat: Latitude
    readonly lon: Longitude
    readonly distAlong: Meters
}

export interface RouteStopModel extends RoutePoint {
    readonly stopId: StopId
    readonly name: string
}

export interface RouteModel {
    readonly routeId: RouteId
    readonly shortName: string
    readonly longName: string
    readonly color: string
    readonly stops: readonly RouteStopModel[]
    readonly polyline: readonly RoutePoint[]
    readonly lengthMeters: Meters
}