import { Body, Controller, Get, Post } from '@nestjs/common';
import { ReportCommandSchema } from '../../shared/src';
import type { ReportCommand, ReportDto } from '../../shared/src';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportService } from '../experiments/report.service';

@Controller('api/report')
export class ReportController {
  constructor(private readonly report: ReportService) {}

  @Get()
  current(): ReportDto {
    return this.report.build();
  }

  @Post()
  execute(
    @Body(new ZodValidationPipe(ReportCommandSchema)) command: ReportCommand,
  ): ReportDto {
    switch (command.type) {
      case 'RESET':
        return this.report.reset();
      default:
        return assertNever(command.type);
    }
  }
}

const assertNever = (x: never): never => {
  throw new Error(`Невідома команда звіту: ${JSON.stringify(x)}`);
};
