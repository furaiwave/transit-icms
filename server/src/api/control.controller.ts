import { Body, Controller, Post } from '@nestjs/common';
import { ControlCommandSchema } from '../../shared/src';
import type { ControlAck, ControlCommand } from '../../shared/src';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ControlService } from '../simulation/control.service';

@Controller('api/control')
export class ControlController {
  constructor(private readonly control: ControlService) {}

  @Post()
  execute(
    @Body(new ZodValidationPipe(ControlCommandSchema)) command: ControlCommand,
  ): ControlAck {
    return this.control.execute(command);
  }
}