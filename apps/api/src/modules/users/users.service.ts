import { Injectable } from '@nestjs/common';
import type { User } from '@nestjs-template/types';
import { BaseService } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { User as UserRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type { UserRecord };

/** Data needed to create a user. The password is already hashed by the caller (AuthService). */
export interface CreateUserData {
  full_name: string;
  phone: string;
  email?: string | null;
  /** argon2 hash of the password. */
  password: string;
}

export type UpdateUserData = Partial<
  Pick<UserRecord, 'full_name' | 'email' | 'is_active' | 'refresh_token_hash' | 'last_login_at'>
>;

export function toUserResponse(record: UserRecord): User {
  return {
    id: record.id,
    full_name: record.full_name,
    phone: record.phone,
    email: record.email,
    role: record.role,
    is_active: record.is_active,
    last_login_at: record.last_login_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

function createUserRepository(prisma: PrismaService): CrudRepository<UserRecord, CreateUserData, UpdateUserData, string> {
  return {
    findMany: ({ skip, take, sortBy, sortOrder }) =>
      prisma.user.findMany({ skip, take, orderBy: { [sortBy ?? 'created_at']: sortOrder } }),
    count: () => prisma.user.count(),
    findById: (id) => prisma.user.findUnique({ where: { id } }),
    create: (data) => prisma.user.create({ data }),
    update: (id, data) => prisma.user.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.user.delete({ where: { id } });
    },
  };
}

@Injectable()
export class UsersService extends BaseService<UserRecord, CreateUserData, UpdateUserData, User, string> {
  protected readonly entityName = 'User';
  protected readonly sortableFields = ['created_at', 'full_name'];

  constructor(private readonly prisma: PrismaService) {
    super(createUserRepository(prisma));
  }

  protected toResponse(record: UserRecord): User {
    return toUserResponse(record);
  }

  /** Raw record (with hashes) for authentication. Returns null so the caller decides the error. */
  findByPhone(phone: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByIdOrNull(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Raw record (with hashes) or NotFoundException. */
  findRecordById(id: string): Promise<UserRecord> {
    return this.findEntityOrFail(id);
  }

  /** Creates a user and returns the raw record (AuthService signs tokens for it right away). */
  async createRecord(data: CreateUserData): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateRecord(id: string, data: UpdateUserData): Promise<UserRecord> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch (error) {
      throw this.mapError(error, id);
    }
  }
}
