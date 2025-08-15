import http from 'http';
import app from './app.js';
import { loadEnv } from './config/env.js';
import { Server } from 'socket.io';

const { PORT } = loadEnv();

// Создаём HTTP сервер и вешаем Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // отражает запрашивающий origin
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },
  path: '/socket.io',
});

// Делаем io доступным в роутерах (req.app.get('io'))
app.set('io', io);

// Простая авторизация по "комнатам" по inventoryId
io.on('connection', (socket) => {
  socket.on('join', ({ inventoryId }) => {
    if (!inventoryId) return;
    socket.join(`inv:${inventoryId}`);
  });
  socket.on('leave', ({ inventoryId }) => {
    if (!inventoryId) return;
    socket.leave(`inv:${inventoryId}`);
  });
});

server.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
