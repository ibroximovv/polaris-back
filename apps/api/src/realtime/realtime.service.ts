import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

export const userRoom = (userId: string): string => `user:${userId}`;
export const courseAdminsRoom = (courseId: string): string => `course:${courseId}:admins`;

/**
 * Pushes events to connected clients from any service. The gateway binds the namespace on start;
 * until then (and in unit tests) every emit is a no-op.
 */
@Injectable()
export class RealtimeService {
  private server: Namespace | null = null;

  bind(server: Namespace): void {
    this.server = server;
  }

  /** Every socket (tab/device) of the user. */
  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  /** Admins that subscribed to the course. */
  toCourseAdmins(courseId: string, event: string, payload: unknown): void {
    this.server?.to(courseAdminsRoom(courseId)).emit(event, payload);
  }
}
