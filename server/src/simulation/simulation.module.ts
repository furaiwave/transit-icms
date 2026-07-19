import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ExperimentsModule } from '../experiments/experiments.module';
import { GtfsModule } from '../gtfs/gtfs.module';
import { ProcessingModule } from '../processing/processing.module';
import { ControlService } from './control.service';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [GtfsModule, ProcessingModule, FleetModule, GatewayModule, ExperimentsModule],
  providers: [SimulatorService, ControlService],
  exports: [SimulatorService, ControlService],
})
export class SimulationModule {}