-- Rename the password column; keeps existing hashes (Prisma would drop + recreate it).
ALTER TABLE "users" RENAME COLUMN "password_hash" TO "password";
