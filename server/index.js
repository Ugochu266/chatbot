import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { sessionHandler } from './middleware/sessionHandler.js';
import { errorHandler, notFoundHandler, logger } from './middleware/errorHandler.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import rulesRoutes from './routes/rules.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Disable for SSE compatibility
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  exposedHeaders: ['X-Session-Id']
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));

// Session handling
app.use(sessionHandler);

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/rules', rulesRoutes);
app.use('/api/admin/settings', settingsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`SafeChat API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
