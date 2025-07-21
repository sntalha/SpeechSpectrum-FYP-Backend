import express from 'express';
import Constants from './constant.js';
import connectDB from './db/db.connect.js';
import userRoutes from './routes/user.routes.js'

const app = express();
app.use(express.json());
connectDB();

app.get('/', (req, res) => {
  res.send('Hello, E-Mart Backend!');
});

app.use('/api/user',userRoutes);

app.listen(Constants.PORT, () => {
  console.log(`Server is running on http://localhost:${Constants.PORT}`);
});