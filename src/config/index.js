import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'amakari_super_secret_jwt_key_2026_psychotherapy_platform',
  jwtExpiresIn: '7d',
  corsOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://localhost:3000',
    process.env.CLIENT_URL,
    process.env.ADMIN_URL
  ].filter(Boolean)
};
