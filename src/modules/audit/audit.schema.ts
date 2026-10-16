import { z } from 'zod';
import { cursorQuery } from '../../utils/pagination.js';
import { AUDIT_ENTITY_TYPES } from './audit.recorder.js';

export const listAuditQuery = cursorQuery.extend({
    entityType : z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId : z.uuid().optional(),
    actorId : z.uuid().optional(),
    action : z.string().trim().min(1).max(50).optional(),
});

export type listAuditQuery = z.infer<typeof listAuditQuery>;