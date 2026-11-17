import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateTodoDto as CreateTodoShape } from '@nestjs-template/types';

// A class (not the shared interface) so the global ValidationPipe can validate the body.
export class CreateTodoDto implements CreateTodoShape {
  @ApiProperty({ example: 'Buy groceries' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
