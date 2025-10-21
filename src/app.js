import express from 'express';
import Constants from './constant.js';
import testRoutes from './routes/test.routes.js';
import userRoutes from './routes/user.routes.js';
import childRoutes from './routes/child.routes.js';
import questionnaireRoutes from './routes/questionnaire.routes.js';

const app = express();
app.use(express.json());
// Supabase client is initialized in db.connect.js and can be imported as needed

app.get('/', (req, res) => {
  res.send('Hello, Supabase Connected.');
});

app.use('/api/test', testRoutes);
app.use('/api/user', userRoutes);
app.use('/api/children', childRoutes);
app.use('/api/questionnaire', questionnaireRoutes);

app.listen(Constants.PORT, () => {
  console.log(`Server is running on http://localhost:${Constants.PORT}`);
});