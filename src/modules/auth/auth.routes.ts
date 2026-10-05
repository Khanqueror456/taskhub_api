import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', validate({ body : registerSchema}), controller.register);
authRouter.post('/login', validate({ body : loginSchema}), controller.login);
authRouter.post('/refresh', validate({ body: refreshSchema}), controller.refresh);
authRouter.post('/logout', validate({ body : refreshSchema}), controller.logout);