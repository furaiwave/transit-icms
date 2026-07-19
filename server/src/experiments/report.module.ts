import { Module } from '@nestjs/common';
import { GtfsModule } from '../gtfs/gtfs.module';
import { ProcessingModule } from '../processing/processing.module';
import { ExperimentsModule } from './experiments.module';
import { ReportService } from './report.service';

@Module({
  imports: [GtfsModule, ProcessingModule, ExperimentsModule],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
