import { Request, Response, NextFunction } from 'express';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { AIService } from '../services/ai.service.js';

export class AIController {
    constructor(private readonly aiService : AIService) {}

    chat = async (req : Request, res : Response, next : NextFunction) => {
        try {
            const parsed = chatRequestSchema.safeParse(req.body);
            if(!parsed.success) {
                return res.status(400).json({
                    error : 'Validation failed',
                    details : parsed.error.flatten(),
                })
            }

            const result = await this.aiService.chat(parsed.data.message);
            return res.status(200).json({ data : result });
            
        } catch(error) {
            return next(error);
        }
    }
}