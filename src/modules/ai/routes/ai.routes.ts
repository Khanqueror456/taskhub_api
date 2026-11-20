import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { AIService, createAIService } from '../services/ai.service.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { orgParams } from '../../organizations/organizations.schema.js';
import { authorize } from '../../../middleware/authorize.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { ToolExecutor } from '../tools/tool.executor.js';
import { ToolCallingService } from '../services/tool-calling.service.js';
import { GroqProvider } from '../providers/groq.provider.js';
import { registerTaskHubReadTools } from '../tools/taskhub-read.tools.js';

const registry = new ToolRegistry();

// registry.register({
//     name : 'get_overdue_tasks',
//     description : 'Fetch overdue tasks for the current organization',
//     parameters : { type : 'object', properties : {}, additionalProperties : false },
//     argsSchema : z.object({}),
//     execute : async (_args, ctx) => ({
//         organizationId : ctx.organizationId,
//         overdueTasks : [
//             { id : 't_1', title : 'Push notifications', priority : 'HIGH', dueDate : '2026-11-15' },          
//         ],
//     }),
// })

registerTaskHubReadTools(registry)

const router = Router({ mergeParams: true });

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error('GROQ_API_KEY is not configured');
}

const provider = new GroqProvider({
  apiKey,
  baseURL: process.env.AI_BASE_URL,
  model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b',
  defaultMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 1500),
  defaultTemperature: Number(process.env.AI_TEMPERATURE ?? 0.3),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
});

const airService = new AIService(provider);
const toolCallingService = new ToolCallingService(
    provider,
    registry,
    new ToolExecutor(registry)
);
const aiController = new AIController(airService, toolCallingService);


router.use(authenticate);

router.post('/chat', validate({ params : orgParams, body : chatRequestSchema}), authorize('org:read'), aiController.chat);
router.post('/chat/stream', validate({ params : orgParams, body : chatRequestSchema}), authorize('org:read'), aiController.chatStream);
router.post('/generate-tasks', validate({ params : orgParams }), authorize('org:read'), aiController.generateTasks);
router.post('/assistant', validate({ params : orgParams }), authorize('org:read'), aiController.assistant);

export default router;
