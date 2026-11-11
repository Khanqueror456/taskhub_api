import { createHash, randomBytes } from 'node:crypto';
import { InvitationStatus, type Role } from '../../generated/prisma/client.js';
import { enqueueInviteEmail } from '../../jobs/enqueue.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { recordAudit, type AuditContext } from '../audit/audit.recorder.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// A 256-bit random token needs no secret key: plain SHA-256 is enough
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new AppError(410, 'INVITATION_INVALID', 'This invitation is no longer valid');

const publicFields = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
} as const; // never return tokenHash

export async function createInvitation(
  ctx: AuditContext,
  orgId: string,
  input: { email: string; role: Role },
) {
  const token = randomBytes(32).toString('base64url');

  const invitation = await prisma.$transaction(async (tx) => {
    const alreadyMember = await tx.membership.findFirst({
      where: { organizationId: orgId, user: { email: input.email } },
      select: { id: true },
    });
    if (alreadyMember) throw AppError.conflict('This person is already a member');

    const pending = await tx.invitation.findFirst({
      where: {
        organizationId: orgId,
        email: input.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pending) throw AppError.conflict('A pending invitation for this email already exists');

    const created = await tx.invitation.create({
      data: {
        organizationId: orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedById: ctx.userId,
      },
      select: publicFields,
    });
    await recordAudit(tx, ctx, {
      organizationId: orgId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: created.id,
      after: { email: created.email, role: created.role, expiresAt: created.expiresAt },
    });
    return created;
  });

  // After the commit: if the queue is down the invitation still exists, and we say so
  const emailQueued = await enqueueInviteEmail(invitation.id, token);
  return { ...invitation, emailQueued };
}

export async function listInvitations(orgId: string) {
  const data = await prisma.invitation.findMany({
    where: { organizationId: orgId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
    select: publicFields,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return { data };
}

export async function revokeInvitation(ctx: AuditContext, orgId: string, invitationId: string) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, organizationId: orgId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED },
    });
    if (count === 0) throw AppError.notFound('Pending invitation not found');

    await recordAudit(tx, ctx, {
      organizationId: orgId,
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: invitationId,
    });
  });
}

export async function acceptInvitation(ctx: AuditContext, token: string) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw AppError.notFound('Invitation not found');
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw invalid();
    }

    // The token proves you read the email; this proves you are the person it was sent to
    const user = await tx.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
    if (!user || user.email !== invitation.email) {
      throw AppError.forbidden('This invitation was sent to a different email address');
    }

    // Compare-and-set: of two simultaneous accepts, only one flips PENDING -> ACCEPTED
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.ACCEPTED },
    });
    if (count === 0) throw invalid();

    const existing = await tx.membership.findUnique({
      where: {
        userId_organizationId: { userId: ctx.userId, organizationId: invitation.organizationId },
      },
      select: { id: true },
    });
    if (existing) throw AppError.conflict('You are already a member of this organization');

    await tx.membership.create({
      data: { userId: ctx.userId, organizationId: invitation.organizationId, role: invitation.role },
    });

    await recordAudit(tx, ctx, {
      organizationId: invitation.organizationId,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: invitation.id,
    });
    
    await recordAudit(tx, ctx, {
      organizationId: invitation.organizationId,
      action: 'member.added',
      entityType: 'member',
      entityId: ctx.userId,
      after: { email: user.email, role: invitation.role },
    });

    return { organizationId: invitation.organizationId, role: invitation.role };
  });
}