import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema.js';
import { authIpLimiter, loginEmailLimiter, refreshIpLimiter } from '../../middleware/limiters.js';

export const authRouter = Router();

authRouter.post('/register', authIpLimiter, validate({ body : registerSchema}), controller.register);
authRouter.post('/login', authIpLimiter, validate({ body : loginSchema}), loginEmailLimiter, controller.login);
authRouter.post('/refresh', refreshIpLimiter, validate({ body: refreshSchema}), controller.refresh);
authRouter.post('/logout', refreshIpLimiter, validate({ body : refreshSchema}), controller.logout);
authRouter.get('/me', authenticate, controller.me);