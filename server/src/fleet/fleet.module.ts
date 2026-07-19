import { Module } from '@nestjs/common';
import { FleetService } from './fleet.service';

@Module({ providers: [FleetService], exports: [FleetService] })
export class FleetModule {}