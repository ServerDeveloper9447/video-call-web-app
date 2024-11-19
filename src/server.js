import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import { auth } from './middleware/auth.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const redis = new Redis();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/rooms', auth);

// Store active rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join meeting room
  socket.on('join-room', async ({ roomId, userId, username }) => {
    const room = rooms.get(roomId) || { participants: new Map() };
    
    if (room.participants.size >= 100) {
      socket.emit('room-full');
      return;
    }

    socket.join(roomId);
    room.participants.set(userId, { username, socketId: socket.id });
    rooms.set(roomId, room);

    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      userId,
      username,
      participants: Array.from(room.participants.entries())
    });

    // Send existing participants to the new user
    socket.emit('room-users', {
      participants: Array.from(room.participants.entries())
    });
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ to, from, offer }) => {
    socket.to(to).emit('offer', { from, offer });
  });

  socket.on('answer', ({ to, from, answer }) => {
    socket.to(to).emit('answer', { from, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { candidate });
  });

  // Leave room
  socket.on('leave-room', ({ roomId, userId }) => {
    handleUserLeave(socket, roomId, userId);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});

function handleUserLeave(socket, roomId, userId) {
  const room = rooms.get(roomId);
  if (room) {
    room.participants.delete(userId);
    if (room.participants.size === 0) {
      rooms.delete(roomId);
    }
    socket.to(roomId).emit('user-left', { userId });
    socket.leave(roomId);
  }
}

function handleDisconnect(socket) {
  rooms.forEach((room, roomId) => {
    const userId = Array.from(room.participants.entries())
      .find(([_, data]) => data.socketId === socket.id)?.[0];
    
    if (userId) {
      handleUserLeave(socket, roomId, userId);
    }
  });
}

// Protected API Routes
app.post('/api/rooms', (req, res) => {
  const roomId = uuidv4();
  rooms.set(roomId, { participants: new Map() });
  res.json({ roomId });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    participants: Array.from(room.participants.entries()),
    available: room.participants.size < 100
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});