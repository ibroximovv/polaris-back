import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsInt, IsUUID } from 'class-validator';
import type { Socket } from 'socket.io';
import { getSocketUser, parseWsPayload, wsAck } from './ws.utils';

class SampleDto {
  @IsUUID()
  id!: string;

  @IsInt()
  count!: number;
}

describe('ws utils', () => {
  describe('parseWsPayload', () => {
    it('returns a validated instance', async () => {
      const dto = await parseWsPayload(SampleDto, { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', count: 2 });
      expect(dto).toBeInstanceOf(SampleDto);
      expect(dto.count).toBe(2);
    });

    it('rejects invalid, unknown and non-object payloads with 400', async () => {
      await expect(parseWsPayload(SampleDto, { id: 'x', count: 'a' })).rejects.toThrow(BadRequestException);
      await expect(
        parseWsPayload(SampleDto, { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', count: 1, extra: true }),
      ).rejects.toThrow(/property extra should not exist/);
      await expect(parseWsPayload(SampleDto, 'text')).rejects.toThrow(new BadRequestException('Payload must be an object'));
    });
  });

  describe('wsAck', () => {
    it('wraps the result', async () => {
      await expect(wsAck(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
    });

    it('maps HTTP exceptions to their status and message', async () => {
      await expect(
        wsAck(async () => {
          throw new NotFoundException('Lesson #l1 not found');
        }),
      ).resolves.toEqual({ ok: false, error: { status_code: 404, message: 'Lesson #l1 not found' } });
    });

    it('hides unexpected errors behind 500', async () => {
      await expect(
        wsAck(async () => {
          throw new Error('db password leaked');
        }),
      ).resolves.toEqual({ ok: false, error: { status_code: 500, message: 'Internal server error' } });
    });
  });

  it('getSocketUser returns the authenticated user or throws 401', () => {
    expect(getSocketUser({ data: { user: { id: 'u1', role: 'USER' } } } as unknown as Socket)).toEqual({
      id: 'u1',
      role: 'USER',
    });
    expect(() => getSocketUser({ data: {} } as unknown as Socket)).toThrow('Authentication required');
  });
});
