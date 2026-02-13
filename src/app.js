import express from 'express';
import cors from 'cors';
import Constants from './constant.js';
import testRoutes from './routes/test.routes.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import childRoutes from './routes/child.routes.js';
import questionnaireRoutes from './routes/questionnaire.routes.js';
import speechRoutes from './routes/speech.routes.js';
import storageRoutes from './routes/storage.routes.js';
import consultationRoutes from './routes/consultation.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import linkRoutes from './routes/link.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import expertRoutes from './routes/expert.routes.js';

const app = express();
app.use(cors());
app.use(express.json());
// Per-request Supabase client is created via supabaseClientMiddleware in each route

app.get('/', (req, res) => {
  res.send('Hello, Supabase Connected.');
});

app.use('/api/test', testRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/children', childRoutes);
app.use('/api/questionnaire', questionnaireRoutes);
app.use('/api/speech', speechRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/experts', expertRoutes);

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ 
    message: err.message || 'Internal server error', 
    status: false 
  });
});

// Only listen if not on Vercel (Vercel handles the server)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(Constants.PORT, () => {
    console.log(`Server is running on http://localhost:${Constants.PORT}`);
  });
}

export default app;