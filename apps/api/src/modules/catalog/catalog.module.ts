import { Router } from 'express';
import { catalogRouter } from './catalog.routes.js';

export const catalogModule = Router();
catalogModule.use('/', catalogRouter);