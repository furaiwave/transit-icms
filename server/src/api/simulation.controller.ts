import { Body, Controller, Post } from '@nestjs/common';
import { SimulationCommandSchema } from '../../shared/src';
import type { SimulationCommand, SimulationState } from '../../shared/src';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SimulatorService } from '../simulation/simulator.service';

@Controller('api/simulation')
export class SimulationController {
  constructor(private readonly simulator: SimulatorService) {}

  @Post()
  execute(
    @Body(new ZodValidationPipe(SimulationCommandSchema)) command: SimulationCommand,
  ): SimulationState {
    switch (command.type) {
      case 'START':
        return this.simulator.start();
      case 'STOP':
        return this.simulator.stop();
      case 'SET_TICK':
        // command тут звужено: поле tickMs існує ЛИШЕ в цій гілці
        return this.simulator.setTick(command.tickMs);
      default:
        return assertNever(command);
    }
  }
}

const assertNever = (x: never): never => {
  throw new Error(`Невідома команда: ${JSON.stringify(x)}`);
};