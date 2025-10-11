import express from 'express';
import Constants from './constant.js';
import supabase from './db/db.connect.js';
import testRoutes from './routes/test.routes.js';

const app = express();
app.use(express.json());
// Supabase client is initialized in db.connect.js and can be imported as needed


app.get('/', (req, res) => {
  res.send('Hello, Supabase Connected.');
});


app.use('/api/test', testRoutes);

app.listen(Constants.PORT, () => {
  console.log(`Server is running on http://localhost:${Constants.PORT}`);
});