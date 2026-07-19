import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WS_EVENT, WsServerMessage } from '../../shared/src';
import { FleetService } from '../fleet/fleet.service';

@WebSocketGateway({ cors: { origin: '*' }})
export class TelemetryGateway implements OnGatewayConnection{
  @WebSocketServer()
  private readonly server!: Server
  constructor(private readonly fleet: FleetService){}

  private send(client: Socket, message: WsServerMessage): void {
    client.emit(WS_EVENT, message)
  }

  broadcast(message: WsServerMessage): void{
    this.server.emit(WS_EVENT, message)
  }


  handleConnection(client: Socket): void {
    this.send(client, { type: 'snapshot', payload: this.fleet.vehicles() })
    this.send(client, { type: 'stats', payload: this.fleet.stats() })
  }
}
