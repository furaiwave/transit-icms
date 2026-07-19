import { Module } from '@nestjs/common';
import { ReportModule } from '../experiments/report.module';
import { FleetModule } from '../fleet/fleet.module';
import { GtfsModule } from '../gtfs/gtfs.module';
import { ProcessingModule } from '../processing/processing.module';
import { SimulationModule } from '../simulation/simulation.module';
import { ControlController } from './control.controller';
import { GtfsController } from './gtfs.controller';
import { QueryController } from './query.controller';
import { ReportController } from './report.controller';
import { SimulationController } from './simulation.controller';
import { TelemetryController } from './telemetry.controller';

@Module({
  imports: [GtfsModule, FleetModule, ProcessingModule, SimulationModule, ReportModule],
  controllers: [
    QueryController,
    TelemetryController,
    ControlController,
    SimulationController,
    GtfsController,
    ReportController,
  ],
})
export class ApiModule {}