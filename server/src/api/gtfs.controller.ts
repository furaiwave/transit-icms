import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import type { GtfsLoadResult } from '../../shared/src';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GtfsService } from '../gtfs/gtfs.service';
import { PipelineService } from '../processing/pipeline.service';

const ReloadSchema = z.object({ source: z.literal('sample') });

@Controller('api/gtfs')
export class GtfsController {
  constructor(
    private readonly gtfs: GtfsService,
    private readonly pipeline: PipelineService,
  ) {}

  @Post('reload')
  reload(
    @Body(new ZodValidationPipe(ReloadSchema)) _body: z.infer<typeof ReloadSchema>,
  ): GtfsLoadResult {
    const result = this.gtfs.reload();
    this.pipeline.reset();
    return result;
  }
}