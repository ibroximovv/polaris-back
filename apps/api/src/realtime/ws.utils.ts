import { BadRequestException, HttpException, Logger, type Type } from '@nestjs/common';
import type { WsAck } from '@nestjs-template/types';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import type { Socket } from 'socket.io';
import { VALIDATION_PIPE_OPTIONS } from '../common/pipes/validation';
import type { AuthUser } from '../modules/auth/auth.types';

const logger = new Logger('WebSocket');

export interface SocketData {
  user?: AuthUser;
}

/** The user the auth middleware attached; every socket in the namespace has one. */
export function getSocketUser(socket: Socket): AuthUser {
  const user = (socket.data as SocketData).user;
  if (!user) throw new HttpException('Authentication required', 401);
  return user;
}

function flattenErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenErrors(error.children ?? []),
  ]);
}

/** Same rules as the HTTP ValidationPipe; throws 400 with every message. */
export async function parseWsPayload<T extends object>(dto: Type<T>, payload: unknown): Promise<T> {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestException('Payload must be an object');
  const instance = plainToInstance(dto, payload, VALIDATION_PIPE_OPTIONS.transformOptions);
  const errors = await validate(instance, {
    whitelist: VALIDATION_PIPE_OPTIONS.whitelist,
    forbidNonWhitelisted: VALIDATION_PIPE_OPTIONS.forbidNonWhitelisted,
  });
  if (errors.length > 0) throw new BadRequestException(flattenErrors(errors).join('; '));
  return instance;
}

/** Runs a handler and turns the result or the error into an ack: `{ ok, data }` / `{ ok: false, error }`. */
export async function wsAck<T>(handler: () => Promise<T>): Promise<WsAck<T>> {
  try {
    return { ok: true, data: await handler() };
  } catch (error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? [response.message].flat().join('; ')
          : error.message;
      return { ok: false, error: { status_code: error.getStatus(), message } };
    }
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return { ok: false, error: { status_code: 500, message: 'Internal server error' } };
  }
}
