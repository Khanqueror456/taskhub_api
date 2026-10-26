// Middleware order matters: logger first (so everything is logged), body parser before routes, and the 404 and error handlers after all routes.

import express from 'express';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { orgRouter } from './modules/organizations/organizations.routes.js';
import { projectRouter } from './modules/projects/projects.routes.js';
import { taskRouter } from './modules/tasks/tasks.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { env } from './config/env.js';

export const app = express();

app.set('trust proxy', env.TRUST_PROXY_HOPS)

app.disable('x-powered-by');
app.use(requestLogger);
app.use(express.json({ limit : '100kb'}));

// Routers
app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/orgs/:orgId/projects', projectRouter);
app.use('/api/v1/orgs/:orgId/tasks', taskRouter);
app.use('/api/v1/orgs/:orgId/audit-logs', auditRouter);
app.use('/api/v1/orgs', orgRouter); // Order matters here. If orgRouter came first, its authenticate would run on these paths too. It would still work, but it would verify the JWT twice.


// must be last
app.use(notFound);
app.use(errorHandler);