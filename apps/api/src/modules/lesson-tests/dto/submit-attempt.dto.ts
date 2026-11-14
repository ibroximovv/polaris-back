import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

export class AttemptAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  question_id!: string;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Selected options (several for multi-answer questions)' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  option_ids!: string[];
}

export class SubmitAttemptDto {
  @ApiProperty({ type: [AttemptAnswerDto], description: 'Unanswered questions count as wrong' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerDto)
  answers!: AttemptAnswerDto[];
}
