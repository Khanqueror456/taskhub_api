import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { createAIService } from '../services/ai.service.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { orgParams } from '../../organizations/organizations.schema.js';
import { authorize } from '../../../middleware/authorize.js';
import { properties, z } from 'zod';
import { ToolRegistry } from '../tools/tool.registry.js';
import { ToolExecutor } from '../tools/tool.executor.js';
import { ToolCallingService } from '../services/tool-calling.service.js';

const registry = new ToolRegistry();

registry.register({
    name : 'get_overdue_tasks',
    description : 'Fetch overdue tasks for the current organization',
    parameters : { type : 'object', properties : {}, additionalProperties : false },
    argsSchema : z.object({}),
    execute : async (_args, ctx) => ({
        organizationId : ctx.organizationId,
        overdueTasks : [
            { id : 't_1', title : 'Push notifications', priority : 'HIGH', dueDate : '2026-11-15' },          
        ],
    }),
})

const router = Router({ mergeParams: true });
const aiController = new AIController(createAIService());


router.use(authenticate);

router.post('/chat', validate({ params : orgParams, body : chatRequestSchema}), authorize('org:read'), aiController.chat);
router.post('/chat/stream', validate({ params : orgParams, body : chatRequestSchema}), authorize('org:read'), aiController.chatStream);
router.post('/generate-tasks', validate({ params : orgParams }), authorize('org:read'), aiController.generateTasks);

export default router;
