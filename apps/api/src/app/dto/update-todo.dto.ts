import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import type { UpdateTodoDto as UpdateTodoShape } from '@nestjs-template/types';
import { CreateTodoDto } from './create-todo.dto';

export class UpdateTodoDto extends PartialType(CreateTodoDto) implements UpdateTodoShape {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
