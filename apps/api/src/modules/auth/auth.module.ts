import { Router } from 'express';
import { authRouter } from './auth.routes.js';

export const authModule = Router();
authModule.use('/', authRouter);
