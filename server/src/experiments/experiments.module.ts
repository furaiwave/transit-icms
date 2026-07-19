import { Module } from '@nestjs/common';
import { GtfsModule } from '../gtfs/gtfs.module';
import { ExperimentService } from './experiment.service';

/**
 * Виділено в окремий модуль навмисно: накопичувач потрібен і конвеєру
 * (результат обробки), і симулятору (еталон). Тримати його в ProcessingModule
 * означало б цикл Processing ↔ Simulation.
 */
@Module({
  imports: [GtfsModule],
  providers: [ExperimentService],
  exports: [ExperimentService],
})
export class ExperimentsModule {}
