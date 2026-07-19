import { Injectable } from "@nestjs/common";
import { performance } from "perf_hooks";
import { ProcessedFrame, TelemetryFrame } from "../../shared/src";
import { FleetService } from "../fleet/fleet.service";
import { TelemetryGateway } from "../gateway/telemetry.gateway";
import { PipelineService } from "./pipeline.service";

@Injectable()
export class IngestService{
    constructor(
        private readonly pipeline: PipelineService,
        private readonly fleet: FleetService,
        private readonly gateway: TelemetryGateway
    ) {}

    ingest(frame: TelemetryFrame): ProcessedFrame {
        const t0 = performance.now()
        const processed = this.pipeline.process(frame)
        const { snapshot, anomaly } = this.fleet.apply(processed, performance.now() - t0)
        if(snapshot) this.gateway.broadcast({ type: 'vehicle', payload: snapshot })
        if(anomaly) this.gateway.broadcast({ type: 'anomaly', payload: anomaly })
        return processed
    }
}