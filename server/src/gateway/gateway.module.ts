import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({ imports: [FleetModule], providers: [TelemetryGateway], exports: [TelemetryGateway] })
export class GatewayModule {}