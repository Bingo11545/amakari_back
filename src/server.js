import cors from 'cors';
import express from 'express';
import http from 'http';
import { config } from './config/index.js';
import { db } from './database/db.js';
import { seedDatabase } from './database/seed.js';
import adminRoutes from './routes/adminRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import packageRoutes from './routes/packageRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import therapistRoutes from './routes/therapistRoutes.js';
import { setupSignaling } from './services/signalingService.js';

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json());

// Request logger for security & debugging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/therapists', therapistRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Amakari Backend API',
    timestamp: new Date().toISOString(),
    roles: ['SUPER_ADMIN', 'SUB_ADMIN', 'USER', 'THERAPIST']
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.path}` });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message || 'An unexpected error occurred.' });
});

// Setup WebRTC signaling via Socket.io
setupSignaling(server);

// Boot function
async function startServer() {
  try {
    await db.init();
    await seedDatabase();

    server.listen(config.port, () => {
      console.log(`\n======================================================`);
      console.log(`🌿 Amakari Psychotherapy Backend API running on port ${config.port}`);
      console.log(`📡 WebRTC Signaling Server active`);
      console.log(`🔐 Role & Permission Engine loaded`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

export { app, server };
