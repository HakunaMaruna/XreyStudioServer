#!/usr/bin/env node
/**
 * Local rescue CLI for databases without HTTP/API access.
 * Run it on the host that can reach PostgreSQL (with DATABASE_URL set).
 *
 * Security notes:
 *  - Passwords should be supplied via RESCUE_NEW_PASSWORD (preferred) or an
 *    interactive prompt. Passing a password as argv exposes it to `ps` and
 *    shell history; it is accepted for automation but shown as unsafe in help.
 *  - This tool never prints hashes, tokens, or the password itself.
 *  - All database access goes through Prisma (parameterized queries).
 */
import 'reflect-metadata';
import { createInterface } from 'node:readline';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { PasswordService } from '../common/password.service';
import {
  assertNotLastActiveAdmin,
  formatAdminForOutput,
  normalizeRescueEmail,
  validateRescuePassword,
} from './rescue-cli.helpers';

type AdminSnapshot = Pick<User, 'id' | 'email' | 'role' | 'status'>;

const HELP = `Usage: npm run build && node dist/scripts/rescue-cli.js <command> [args]

Commands:
  list-admins                         List ADMIN users (email, id, status)
  reset-password <email> [password]   Reset password (min 12 chars)
  promote <email>                     Grant ADMIN role to an existing user
  demote <email>                      Remove ADMIN role (never the last active admin)

Password input (reset-password):
  Preferred: set RESCUE_NEW_PASSWORD in the environment, or omit the argument
  to type it interactively. Passing it as argv is UNSAFE: it is visible in
  process listings and shell history. Use argv only for disposable secrets.

Examples:
  RESCUE_NEW_PASSWORD='...' npm run rescue -- reset-password admin@example.com
  npm run rescue -- list-admins

Requires DATABASE_URL pointing at the target database.`;

function printHelp(): void {
  process.stdout.write(`${HELP}\n`);
}

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/** Reads a secret from a TTY without echoing it. Never logs the entered value. */
async function readPasswordFromTty(): Promise<string> {
  if (!process.stdin.isTTY) {
    fail('No TTY and no RESCUE_NEW_PASSWORD set; provide the password via environment variable');
  }
  // readline's terminal mode disables echo, so the typed password is never
  // shown in the terminal, process list, or logs.
  process.stdout.write('New password (input hidden): ');
  const rl = createInterface({ input: process.stdin, terminal: true });
  try {
    return await new Promise<string>((resolve) => {
      rl.once('line', (answer: string) => resolve(answer));
    });
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

function resolvePassword(argvPassword: string | undefined): string | Promise<string> {
  const fromEnv = process.env.RESCUE_NEW_PASSWORD;
  if (fromEnv !== undefined && argvPassword !== undefined) {
    fail('Provide the password either via RESCUE_NEW_PASSWORD or argv, not both');
  }
  if (fromEnv !== undefined) return fromEnv;
  if (argvPassword !== undefined) return argvPassword;
  return readPasswordFromTty();
}

/** Snapshot of role/status for every user; needed for the last-admin guard. */
async function adminSnapshot(prisma: PrismaClient): Promise<AdminSnapshot[]> {
  return prisma.user.findMany({
    select: { id: true, email: true, role: true, status: true },
  });
}

async function findByEmail(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!user) fail(`User not found: ${email}`);
  return user;
}

async function listAdmins(prisma: PrismaClient): Promise<void> {
  const admins = (await adminSnapshot(prisma))
    .filter((user) => user.role === Role.ADMIN)
    .sort((a, b) => a.email.localeCompare(b.email));
  for (const admin of admins) process.stdout.write(`${formatAdminForOutput(admin)}\n`);
  process.stdout.write(`${admins.length} admin(s)\n`);
}

async function resetPassword(prisma: PrismaClient, emailArg: string, passwordArg: string | undefined): Promise<void> {
  const email = normalizeRescueEmail(emailArg);
  const password = validateRescuePassword(await resolvePassword(passwordArg));
  const user = await findByEmail(prisma, email);
  // The password is hashed with the same service the API uses (argon2id by
  // default, bcrypt when PASSWORD_HASHER=bcrypt), so existing logins keep working.
  const passwordHash = await new PasswordService().hash(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: { id: true } });
  process.stdout.write(`Password reset for ${user.email}\n`);
}

async function promote(prisma: PrismaClient, emailArg: string): Promise<void> {
  const email = normalizeRescueEmail(emailArg);
  const user = await findByEmail(prisma, email);
  if (user.role === Role.ADMIN) {
    process.stdout.write(`${user.email} is already ADMIN\n`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: Role.ADMIN }, select: { id: true } });
  process.stdout.write(`Promoted ${user.email} to ADMIN\n`);
}

async function demote(prisma: PrismaClient, emailArg: string): Promise<void> {
  const email = normalizeRescueEmail(emailArg);
  const users = await adminSnapshot(prisma);
  const user = users.find((candidate) => candidate.email === email);
  if (!user) fail(`User not found: ${email}`);
  if (user.role !== Role.ADMIN) {
    process.stdout.write(`${user.email} is not ADMIN\n`);
    return;
  }
  const isDemoting = user.status === UserStatus.ACTIVE;
  assertNotLastActiveAdmin(users, user.id, isDemoting);
  await prisma.user.update({ where: { id: user.id }, data: { role: Role.USER }, select: { id: true } });
  process.stdout.write(`Removed ADMIN role from ${user.email}\n`);
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }
  if (!['list-admins', 'reset-password', 'promote', 'demote'].includes(command)) {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp();
    return 1;
  }
  if ((command === 'list-admins' && args.length !== 0) ||
      (command === 'promote' && args.length !== 1) ||
      (command === 'demote' && args.length !== 1) ||
      (command === 'reset-password' && args.length > 2)) {
    process.stderr.write(`Invalid arguments for ${command}\n`);
    printHelp();
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    switch (command) {
      case 'list-admins':
        await listAdmins(prisma);
        break;
      case 'reset-password':
        await resetPassword(prisma, args[0], args[1]);
        break;
      case 'promote':
        await promote(prisma, args[0]);
        break;
      case 'demote':
        await demote(prisma, args[0]);
        break;
    }
    return 0;
  } catch (error) {
    // Prisma errors can include query parameters: print only the message and
    // never the full error object (which might echo a password argument).
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stderr.write(`Error: ${message.replace(/\s+/g, ' ').slice(0, 300)}\n`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void run().then((code) => {
    process.exitCode = code;
  });
}
