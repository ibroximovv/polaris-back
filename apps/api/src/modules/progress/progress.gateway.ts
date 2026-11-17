import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { LEARNING_WS_EVENTS, type LessonProgress, type WsAck } from '@nestjs-template/types';
import type { Socket } from 'socket.io';
import { LEARNING_GATEWAY_OPTIONS } from '../../realtime/realtime.gateway';
import { getSocketUser, parseWsPayload, wsAck } from '../../realtime/ws.utils';
import { LessonRefDto, WatchEventDto } from './dto/record-watch.dto';
import { ProgressService } from './progress.service';

/**
 * Real-time player channel (`/learning` namespace). Same rules as the HTTP endpoints; the result
 * comes back in the ack and is also broadcast as `progress:lesson` to the user's other devices.
 */
@WebSocketGateway(LEARNING_GATEWAY_OPTIONS)
export class ProgressGateway {
  constructor(private readonly progressService: ProgressService) {}

  @SubscribeMessage(LEARNING_WS_EVENTS.WATCH)
  watch(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): Promise<WsAck<LessonProgress>> {
    return wsAck(async () => {
      const { lesson_id: lessonId, ...dto } = await parseWsPayload(WatchEventDto, payload);
      return this.progressService.recordWatch(getSocketUser(socket), lessonId, dto);
    });
  }

  @SubscribeMessage(LEARNING_WS_EVENTS.GET_LESSON)
  getLesson(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): Promise<WsAck<LessonProgress>> {
    return wsAck(async () => {
      const { lesson_id: lessonId } = await parseWsPayload(LessonRefDto, payload);
      return this.progressService.getLessonProgress(getSocketUser(socket), lessonId);
    });
  }
}
