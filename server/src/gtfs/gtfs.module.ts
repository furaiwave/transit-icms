import { Module } from '@nestjs/common';
import { GtfsService } from './gtfs.service';

@Module({ providers: [GtfsService], exports: [GtfsService] })
export class GtfsModule {}