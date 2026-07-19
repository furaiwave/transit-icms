import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { VehicleId } from '../../shared/src';
import type {
  AnomalyRecord,
  EtaBoardEntry,
  HistoryPoint,
  PathParams,
  RouteDto,
  SystemStatsDto,
  VehicleSnapshot,
} from '../../shared/src';
import { FleetService } from '../fleet/fleet.service';
import { GtfsService } from '../gtfs/gtfs.service';

/** Path-параметри виводяться з того самого контракту, що використовує клієнт. */
type HistoryParams = PathParams<'/api/vehicles/:vehicleId/history'>;

@Controller('api')
export class QueryController {
  constructor(
    private readonly fleet: FleetService,
    private readonly gtfs: GtfsService,
  ) {}

  @Get('routes')
  routes(): readonly RouteDto[] {
    return this.gtfs.toDto();
  }

  @Get('vehicles')
  vehicles(): readonly VehicleSnapshot[] {
    return this.fleet.vehicles();
  }

  @Get('vehicles/:vehicleId/history')
  history(@Param() params: HistoryParams): readonly HistoryPoint[] {
    const history = this.fleet.historyOf(VehicleId(params.vehicleId));
    if (history.length === 0) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: `Немає історії для борта ${params.vehicleId}`,
      });
    }
    return history;
  }

  @Get('anomalies')
  anomalies(): readonly AnomalyRecord[] {
    return this.fleet.recentAnomalies();
  }

  @Get('stats')
  stats(): SystemStatsDto {
    return this.fleet.stats();
  }

  @Get('eta')
  eta(): readonly EtaBoardEntry[] {
    const routeNames = new Map(this.gtfs.all.map((r) => [r.routeId, r.shortName] as const));
    return this.fleet
      .vehicles()
      .flatMap((v): EtaBoardEntry[] =>
        v.eta === null || v.status === 'OFFLINE'
          ? []
          : [
              {
                stopId: v.eta.stopId,
                stopName: v.eta.stopName,
                routeId: v.routeId,
                routeShortName: routeNames.get(v.routeId) ?? '—',
                vehicleId: v.vehicleId,
                etaSeconds: v.eta.etaSeconds,
              },
            ],
      )
      .sort((a, b) => a.etaSeconds - b.etaSeconds);
  }
}