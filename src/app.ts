// Middleware order matters: logger first (so everything is logged), body parser before routes, and the 404 and error handlers after all routes.

import express from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestLogger);
app.use(express.json({ limit : '100kb'}));

app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);

// must be last
app.use(notFound);
app.use(errorHandler);