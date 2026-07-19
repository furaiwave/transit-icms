import { Body, Controller, Post } from '@nestjs/common';
import { TelemetryFrameSchema } from '../../shared/src';
import type { ProcessedFrame, TelemetryFrame } from '../../shared/src';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IngestService } from '../processing/ingest.service';

/** Вхід для реальних бортових пристроїв — POST /api/telemetry. */
@Controller('api/telemetry')
export class TelemetryController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  ingestFrame(
    // тип аргументу — z.infer схеми: у контролер входить лише брендований кадр
    @Body(new ZodValidationPipe(TelemetryFrameSchema)) frame: TelemetryFrame,
  ): ProcessedFrame {
    return this.ingest.ingest(frame);
  }
}