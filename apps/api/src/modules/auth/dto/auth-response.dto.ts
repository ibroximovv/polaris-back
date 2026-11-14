import { ApiProperty } from '@nestjs/swagger';
import type { AuthResponse, AuthTokens } from '@nestjs-template/types';
import { UserDto } from '../../users/dto/user.dto';

export class AuthTokensDto implements AuthTokens {
  @ApiProperty() access_token!: string;
  @ApiProperty() refresh_token!: string;
  @ApiProperty({ enum: ['Bearer'] }) token_type!: 'Bearer';
  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 }) expires_in!: number;
  @ApiProperty({ description: 'Refresh token lifetime in seconds', example: 2592000 }) refresh_expires_in!: number;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({ type: UserDto }) user!: UserDto;
  @ApiProperty({ type: AuthTokensDto }) tokens!: AuthTokensDto;
}
