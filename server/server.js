const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const menuRoutes = require('./routes/menuRoutes');
const cartRoutes = require('./routes/cartRoutes'); 
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminMenuRoutes = require('./routes/adminMenuRoutes');
const cors = require('cors');
const { initSocket } = require('./realtime/socket');

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
initSocket(server);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/cart', cartRoutes); 
app.use('/api/auth', authRoutes);
app.use('/api/cafe', cafeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/menu', adminMenuRoutes);

// Health check
app.get('/', (req, res) => {
    res.send('Restaurant backend running');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
