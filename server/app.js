const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const registerSocketHandlers = require('./socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

registerSocketHandlers(io);

module.exports = server;
