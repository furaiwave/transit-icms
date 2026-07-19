import { Injectable } from '@nestjs/common';
import { CommandOf, ControlAck, ControlCommand, now } from '../../shared/src';
import { FleetService } from '../fleet/fleet.service';
import { TelemetryGateway } from '../gateway/telemetry.gateway';
import { SimulatorService } from './simulator.service';

/**
 * Керуюча частина ІКС: диспетчерські команди.
 * Обробники розкладені по мапі, тип кожного виводиться через CommandOf<T> —
 * неможливо переплутати payload між командами; вичерпність гарантує mapped type.
 */
@Injectable()
export class ControlService {
  constructor(
    private readonly simulator: SimulatorService,
    private readonly fleet: FleetService,
    private readonly gateway: TelemetryGateway,
  ) {}

  private readonly handlers: {
    readonly [T in ControlCommand['type']]: (cmd: CommandOf<T>) => { accepted: boolean; message: string };
  } = {
    HOLD_VEHICLE: (cmd) => {
      this.fleet.setHeld(cmd.vehicleId, true);
      return { accepted: true, message: `Борт ${cmd.vehicleId} утримано на місці` };
    },
    RESUME_VEHICLE: (cmd) => {
      this.fleet.setHeld(cmd.vehicleId, false);
      return { accepted: true, message: `Борт ${cmd.vehicleId} відновив рух` };
    },
    SET_TARGET_SPEED: (cmd) => {
      const ok = this.simulator.setTargetSpeed(cmd.vehicleId, cmd.speedKmh);
      return {
        accepted: ok,
        message: ok
          ? `Цільова швидкість ${cmd.vehicleId}: ${cmd.speedKmh} км/год`
          : `Борт ${cmd.vehicleId} не знайдено`,
      };
    },
    INJECT_FAULT: (cmd) => {
      const ok = this.simulator.injectFault(cmd.vehicleId, cmd.fault);
      return {
        accepted: ok,
        message: ok ? `Несправність ${cmd.fault} заплановано для ${cmd.vehicleId}` : `Борт не знайдено`,
      };
    },
  };

  execute(command: ControlCommand): ControlAck {
    // виклик через дискримінатор: TS зіставляє конкретну гілку union з її обробником
    const result = this.dispatch(command);
    const ack: ControlAck = {
      ...result,
      command: command.type,
      vehicleId: command.vehicleId,
      ts: now(),
    };
    this.gateway.broadcast({ type: 'control-ack', payload: ack });
    return ack;
  }

  private dispatch<T extends ControlCommand['type']>(
    command: CommandOf<T>,
  ): { accepted: boolean; message: string } {
    const handler = this.handlers[command.type]; // корельований union: TS зіставляє гілку з її обробником
    return handler(command);
  }
}