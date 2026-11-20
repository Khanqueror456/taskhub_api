import { Request, Response, NextFunction } from 'express';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { AIService } from '../services/ai.service.js';
import { generateTasksRequestSchema } from '../schemas/structured-output.schema.js';
import { error } from 'node:console';
import { ToolCallingService } from '../services/tool-calling.service.js';

const orgId = (req: Request) => req.membership!.organizationId;
const targetUserId = (req: Request) => req.params.userId as string;
const targetUserRole = (req: Request) => req.membership!.role;

export class AIController {
    constructor(private readonly aiService: AIService,
        private readonly toolCallingService: ToolCallingService
    ) { }

    chat = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = chatRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: parsed.error.flatten(),
                })
            }

            const result = await this.aiService.chat(parsed.data, { organizationId: orgId(req), userId: targetUserId(req), userRole: targetUserRole(req) });
            return res.status(200).json({ data: result });

        } catch (error) {
            return next(error);
        }
    }

    chatStream = async (req: Request, res: Response, next: NextFunction) => {

        try {
            const parsed = chatRequestSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: parsed.error.flatten(),
                });
            }

            const abortController = new AbortController();
            res.on('close', () => {
                if (!res.writableEnded)
                    abortController.abort();
            })

            const stream = this.aiService.chatStream(
                parsed.data,
                {
                    organizationId: orgId(req),
                    userId: targetUserId(req),
                    userRole: targetUserRole(req),
                },
                abortController.signal
            );

            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();


            try {
                for await (const chunk of stream) {
                    if (abortController.signal.aborted) break;
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }

                if (!abortController.signal.aborted)
                    res.write('data: [DONE]\n\n');

            } catch (streamError) {
                if (!abortController.signal.aborted) {
                    const message =
                        streamError instanceof Error ? streamError.message : 'Streaming failed';
                    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
                }
            } finally {
                if (!res.writableEnded) {
                    res.end();
                }
            }

        } catch (error) {

            return next(error);
        }
    }

    generateTasks = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = generateTasksRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: parsed.error.flatten(),
                });
            }

            const result = await this.aiService.generateTasks(parsed.data, {
                organizationId: orgId(req),
                userId: targetUserId(req),
                userRole: targetUserRole(req),
            });

            return res.status(200).json({ data: result.data, meta: { model: result.model, usage: result.usage } });

        } catch (error) {
            return next(error);
        }
    }


    assistant = async (req: Request, res: Response, next: NextFunction) => {

        try {
            const parsed = chatRequestSchema.safeParse(req.body);

            if (!parsed.success) {

                return res.status(400).json({
                    error: 'Validation failed',
                    detials: parsed.error.flatten()
                })
            }

            const result = await this.toolCallingService.run(parsed.data, {
                organizationId: orgId(req),
                userId: targetUserId(req),
                userRole: targetUserRole(req),
            })

            return res.status(200).json({ data : result });
        } catch (error) {
            return next(error);
        }
    }
}