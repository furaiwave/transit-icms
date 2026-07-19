import { Module } from '@nestjs/common';
import { ApiModule } from './api/api.module';
import { FleetModule } from './fleet/fleet.module';
import { GatewayModule } from './gateway/gateway.module';
import { GtfsModule } from './gtfs/gtfs.module';
import { ProcessingModule } from './processing/processing.module';
import { SimulationModule } from './simulation/simulation.module';

@Module({
  imports: [GtfsModule, FleetModule, GatewayModule, ProcessingModule, SimulationModule, ApiModule],
})
export class AppModule {}