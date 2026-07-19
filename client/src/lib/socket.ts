import { io, type Socket } from 'socket.io-client';
import { WS_EVENT, type WsServerMessage } from '@icms/shared';

let socket: Socket | null = null;

const getSocket = (): Socket => {
  socket ??= io('/', { transports: ['websocket'] });
  return socket;
};

/**
 * Типизированная подписка на шину: наружу выходит только WsServerMessage,
 * дальнейшее сужение по message.type выполняет потребитель через switch.
 */
export const subscribeWs = (
  onMessage: (message: WsServerMessage) => void,
  onStatus: (connected: boolean) => void,
): (() => void) => {
  const s = getSocket();
  const handler = (message: WsServerMessage): void => onMessage(message);
  const up = (): void => onStatus(true);
  const down = (): void => onStatus(false);
  s.on(WS_EVENT, handler);
  s.on('connect', up);
  s.on('disconnect', down);
  if (s.connected) onStatus(true);
  return () => {
    s.off(WS_EVENT, handler);
    s.off('connect', up);
    s.off('disconnect', down);
  };
};