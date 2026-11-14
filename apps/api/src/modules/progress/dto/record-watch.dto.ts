import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * One heartbeat from the video player: the part of the video played since the previous
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
