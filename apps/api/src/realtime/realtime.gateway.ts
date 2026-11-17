import { ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { LEARNING_WS_EVENTS, LEARNING_WS_NAMESPACE, type WsAck } from '@nestjs-template/types';
import { IsUUID } from 'class-validator';
import type { Namespace, Socket } from 'socket.io';
import { envs } from '../config/envs';
import { courseAdminsRoom, RealtimeService, userRoom } from './realtime.service';
import { createWsAuthMiddleware } from './ws-auth.middleware';
import { getSocketUser, parseWsPayload, wsAck } from './ws.utils';

/** Shared by every gateway of the namespace (the first one creates the socket.io server). */
export const LEARNING_GATEWAY_OPTIONS = {
  namespace: LEARNING_WS_NAMESPACE,
  cors: { origin: envs.CORS_ORIGINS.includes('*') ? true : envs.CORS_ORIGINS, credentials: true },
};

export class CourseRoomDto {
  @IsUUID()
  course_id!: string;
}

/**
 * Connection side of `/learning`: JWT auth for every socket, the per-user room (all tabs/devices
 * of a user) and admin course subscriptions. Feature gateways add their own handlers.
 */
@WebSocketGateway(LEARNING_GATEWAY_OPTIONS)
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Namespace): void {
    server.use(createWsAuthMiddleware(this.jwtService));
    this.realtime.bind(server);
    this.logger.log(`socket.io namespace ${LEARNING_WS_NAMESPACE} is ready`);
  }

  async handleConnection(socket: Socket): Promise<void> {
    await socket.join(userRoom(getSocketUser(socket).id));
  }

  @SubscribeMessage(LEARNING_WS_EVENTS.ADMIN_WATCH_COURSE)
  watchCourse(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): Promise<WsAck<{ course_id: string }>> {
    return wsAck(async () => {
      const { course_id } = await this.parseAdminCourse(socket, payload);
      await socket.join(courseAdminsRoom(course_id));
      return { course_id };
    });
  }

  @SubscribeMessage(LEARNING_WS_EVENTS.ADMIN_UNWATCH_COURSE)
  unwatchCourse(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): Promise<WsAck<{ course_id: string }>> {
    return wsAck(async () => {
      const { course_id } = await this.parseAdminCourse(socket, payload);
      await socket.leave(courseAdminsRoom(course_id));
      return { course_id };
    });
  }

  private async parseAdminCourse(socket: Socket, payload: unknown): Promise<CourseRoomDto> {
    if (getSocketUser(socket).role !== 'ADMIN') {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return parseWsPayload(CourseRoomDto, payload);
  }
}
