export declare const __brand: unique symbol

export interface BrandMark<B extends string> {
    readonly [__brand]: B
}

export type Brand<T, B extends string> = T & BrandMark<B>

export type VehicleId = Brand<string, 'VehicleId'>
export type RouteId = Brand<string, 'RouteId'>
export type StopId = Brand<string, 'StopId'>
export type AnomalyId = Brand<string, 'AnomalyId'>

export type Latitude = Brand<number, 'Latitude'>
export type Longitude = Brand<number, 'Longitude'>
export type Kmh = Brand<number, 'Kmh'>
export type Meters = Brand<number, 'Meters'>
export type Seconds = Brand<number, 'Seconds'>
export type UnixMs = Brand<number, 'UnixMs'>

export const VehicleId = (v: string): VehicleId => v as VehicleId
export const RouteId = (v: string): RouteId => v as RouteId
export const StopId = (v: string): StopId => v as StopId
export const AnomalyId = (v: string): AnomalyId => v as AnomalyId
export const Lat = (v: number): Latitude => v as Latitude
export const Lon = (v: number): Longitude => v as Longitude
export const Kmh = (v: number): Kmh => v as Kmh
export const Meters = (v: number): Meters => v as Meters
export const Seconds = (v: number): Seconds => v as Seconds
export const UnixMs = (v: number): UnixMs => v as UnixMs

export const now = (): UnixMs => UnixMs(Date.now())