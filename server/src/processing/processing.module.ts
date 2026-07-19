import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { GatewayModule } from '../gateway/gateway.module';
import { GtfsModule } from '../gtfs/gtfs.module';
import { IngestService } from './ingest.service';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [GtfsModule, FleetModule, GatewayModule],
  providers: [PipelineService, IngestService],
  exports: [PipelineService, IngestService],
})
export class ProcessingModule {}