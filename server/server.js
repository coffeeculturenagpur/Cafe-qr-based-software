const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const menuRoutes = require('./routes/menuRoutes');
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminMenuRoutes = require('./routes/adminMenuRoutes');
const adminTableRoutes = require('./routes/adminTableRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminMediaRoutes = require('./routes/adminMediaRoutes');
const adminCafeRoutes = require('./routes/adminCafeRoutes');
const qrRoutes = require('./routes/qrRoutes');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initSocket } = require('./realtime/socket');

dotenv.config();
connectDB();

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

const server = http.createServer(app);
initSocket(server);

// Routes
app.use('/api/menu', menuRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cafe', cafeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin/menu', adminMenuRoutes);
app.use('/api/admin/tables', adminTableRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/media', adminMediaRoutes);
app.use('/api/admin/cafe', adminCafeRoutes);
app.use('/api/qr', qrRoutes);

// Health check
app.get('/', (req, res) => {
    res.send('Restaurant backend running');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
