import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static('public'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// In-memory store for docs per room
const docs = new Map();

// Load a doc from disk if present
const loadDoc = (room) => {
  const p = path.join(DATA_DIR, `${room}.txt`);
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch (e) {
    console.error('Failed to load doc', e);
    return '';
  }
};

// Save a doc to disk
const saveDoc = (room, content) => {
  const p = path.join(DATA_DIR, `${room}.txt`);
  try {
    fs.writeFileSync(p, content, 'utf8');
  } catch (e) {
    console.error('Failed to save doc', e);
  }
};

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('join', ({ room, username }) => {
    if (!room) room = 'default';
    socket.join(room);
    socket.data.username = username || 'Anonymous';
    socket.data.room = room;

    if (!docs.has(room)) {
      const initial = loadDoc(room);
      docs.set(room, initial);
    }

    // Build presence list
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []).map(id => {
      const s = io.sockets.sockets.get(id);
      return { id, username: s?.data?.username || 'Anonymous' };
    });

    // Send current doc and presence
    socket.emit('doc', { content: docs.get(room) || '' });
    io.to(room).emit('presence', clients);

    console.log(`${socket.id} joined room ${room} as ${socket.data.username}`);
  });

  // Receive full-document edits (clients should debounce)
  socket.on('edit', ({ room, content, seq }) => {
    if (!room) return;
    docs.set(room, content);
    saveDoc(room, content);
    // Broadcast to others in the room, excluding sender
    socket.to(room).emit('update', { content, from: socket.id, seq });
  });

  // Cursor data broadcast (lightweight)
  socket.on('cursor', ({ room, cursor }) => {
    if (!room) return;
    socket.to(room).emit('cursor', { id: socket.id, username: socket.data.username, cursor });
  });

  socket.on('disconnecting', () => {
    const room = socket.data.room;
    if (room) {
      // small delay to allow socket to leave
      setTimeout(() => {
        const clients = Array.from(io.sockets.adapter.rooms.get(room) || []).map(id => {
          const s = io.sockets.sockets.get(id);
          return { id, username: s?.data?.username || 'Anonymous' };
        });
        io.to(room).emit('presence', clients);
      }, 50);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
