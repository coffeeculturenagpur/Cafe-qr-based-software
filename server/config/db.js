const dns = require('dns');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Always load server/.env relative to this file (not process cwd).
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function configureDnsForAtlas() {
  const fromEnv = (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Windows / corporate resolvers often refuse Node's SRV lookups for mongodb+srv.
  // Prefer explicit DNS_SERVERS, otherwise fall back to public resolvers then system ones.
  const servers = fromEnv.length
    ? fromEnv
    : ['8.8.8.8', '1.1.1.1', ...dns.getServers()];

  dns.setServers([...new Set(servers)]);
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to server/.env before starting the backend.');
  }

  if (uri.startsWith('mongodb+srv://')) {
    configureDnsForAtlas();
  }

  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

module.exports = connectDB;
