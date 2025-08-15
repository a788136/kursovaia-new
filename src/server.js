import http from 'http';
import app from './app.js';
import { loadEnv } from './config/env.js';
import { Server } from 'socket.io';

const { PORT } = loadEnv();

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);

// Разрешаем origin по умолчанию (для чтения realtime сообщений).
// Для ужесточения можно ограничить origin по CLIENT_ORIGINS.
const io = new Server(server, {
  cors: {
    origin: true, // отражает origin запроса
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },
  path: '/socket.io',
});

// Делаем io доступным внутри роутов: req.app.get('io')
app.set('io', io);

// Простая схема комнат: join/leave по инвентарю
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
