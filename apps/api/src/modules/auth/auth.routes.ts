import { Router } from 'express';
import { login, logout, register, getMe } from './auth.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/logout', logout);

authRouter.get('/me', requireAuth, getMe);
authRouter.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => {
  res.json({ success: true, data: { message: 'Admin area' } });
});
