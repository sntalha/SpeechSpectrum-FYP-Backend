import express from 'express';
import Constants from './constant.js';
import connectDB from './db/db.connect.js';
import userRoutes from './routes/user.routes.js'
import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/products.routes.js';
import orderRoutes from './routes/order.routes.js';
import reviewRoutes from './routes/review.routes.js';

const app = express();
app.use(express.json());
connectDB();

app.get('/', (req, res) => {
  res.send('Hello, E-Mart Backend!');
});

app.use('/api/user',userRoutes);
app.use('/api/category',categoryRoutes);
app.use('/api/product',productRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/review', reviewRoutes);

app.listen(Constants.PORT, () => {
  console.log(`Server is running on http://localhost:${Constants.PORT}`);
});