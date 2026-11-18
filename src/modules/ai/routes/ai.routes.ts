import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { createAIService } from '../services/ai.service.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { validate } from '../../../middleware/validate.js';
import { chatRequestSchema } from '../schemas/chat.schema.js';

const router = Router();
const aiController = new AIController(createAIService());

router.use(authenticate);

router.post('/chat', validate({body : chatRequestSchema}), aiController.chat);

export default router;
