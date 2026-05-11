const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { handleSocket } = require('./socketHandler');
require('dotenv').config();

const fs = require('fs');

function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const app = express();
const server = http.createServer(app);

// CORS para Socket.IO
const CLIENT_URL = process.env.CLIENT_URL || '*';
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});


app.get('/config.js', (_req, res) => {
  const sanitize = (value) => (typeof value === 'string' ? value.trim() : value);
  const firebaseConfig = {
    apiKey: sanitize(process.env.FIREBASE_API_KEY) || '',
    authDomain: sanitize(process.env.FIREBASE_AUTH_DOMAIN) || '',
    projectId: sanitize(process.env.FIREBASE_PROJECT_ID) || '',
    storageBucket: sanitize(process.env.FIREBASE_STORAGE_BUCKET) || '',
    messagingSenderId: sanitize(process.env.FIREBASE_MESSAGING_SENDER_ID) || '',
    appId: sanitize(process.env.FIREBASE_APP_ID) || ''
  };

  res.type('application/javascript');
  res.send(`window.__TRUCOMANIA_CONFIG__ = ${JSON.stringify({ firebaseConfig })};`);
});

// Servir arquivos do front-end
app.use(express.static(path.join(__dirname, '..', 'client')));

handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrucoMania rodando na porta ${PORT}`);
});
