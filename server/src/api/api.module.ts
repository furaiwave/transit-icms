import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { GtfsModule } from '../gtfs/gtfs.module';
import { ProcessingModule } from '../processing/processing.module';
import { SimulationModule } from '../simulation/simulation.module';
import { ControlController } from './control.controller';
import { GtfsController } from './gtfs.controller';
import { QueryController } from './query.controller';
import { SimulationController } from './simulation.controller';
import { TelemetryController } from './telemetry.controller';

@Module({
  imports: [GtfsModule, FleetModule, ProcessingModule, SimulationModule],
  controllers: [
    QueryController,
    TelemetryController,
    ControlController,
    SimulationController,
    GtfsController,
  ],
})
export class ApiModule {}