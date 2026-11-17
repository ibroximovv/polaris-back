import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * One heartbeat from the video player (HTTP, or the socket.io `progress:watch` event): the part of the video played since the previous
 * heartbeat (`from`..`to`, seconds) and the current position. Send it every ~10-15 seconds
 * while playing, and on pause/seek/close.
 */
export class RecordWatchDto {
  @ApiProperty({ minimum: 0, example: 120, description: 'Segment start, seconds' })
  @IsNumber()
  @Min(0)
  from!: number;

  @ApiProperty({ minimum: 0, example: 135, description: 'Segment end, seconds (max 60s after "from")' })
  @IsNumber()
  @Min(0)
  to!: number;

  @ApiPropertyOptional({ minimum: 0, example: 135, description: 'Current player position (resume point). Defaults to "to"' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;
}

/** socket.io `progress:watch` payload: the heartbeat plus the lesson. */
export class WatchEventDto extends RecordWatchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lesson_id!: string;
}

/** socket.io `progress:get` payload. */
export class LessonRefDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lesson_id!: string;
}
