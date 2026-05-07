const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { handleSocket } = require('./socketHandler');

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

// Servir arquivos do front-end
app.use(express.static(path.join(__dirname, '..', 'client')));

handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrucoMania rodando na porta ${PORT}`);
});
