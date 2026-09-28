import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { db } from '../database/db.js';

export function setupSignaling(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication token required for video signaling.'));
      }

      const decoded = jwt.verify(token, config.jwtSecret);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Invalid video signaling token.'));
    }
  });

  const rooms = new Map(); // roomId -> Set of socketIds

  io.on('connection', (socket) => {
    const user = socket.user;
    let currentRoom = null;

    socket.on('join-room', ({ roomId }) => {
      // Validate that the user's token is authorized for this specific roomId
      if (user.roomId && user.roomId !== roomId) {
        socket.emit('error-message', { message: 'Token not authorized for this specific video room.' });
        return;
      }

      currentRoom = roomId;
      socket.join(roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }
      const roomParticipants = rooms.get(roomId);
      roomParticipants.set(socket.id, {
        socketId: socket.id,
        userId: user.userId,
        userName: user.userName,
        role: user.role,
        isHost: user.isHost
      });

      // Notify others in the room
      socket.to(roomId).emit('participant-joined', {
        socketId: socket.id,
        participant: roomParticipants.get(socket.id)
      });

      // Send existing participants to the joined user
      const existing = [];
      for (const [sId, p] of roomParticipants.entries()) {
        if (sId !== socket.id) existing.push(p);
      }
      socket.emit('room-peers', { peers: existing });
    });

    // Relay WebRTC signaling: offer, answer, ice-candidate
    socket.on('signal', ({ targetSocketId, signalData, type }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal', {
          senderSocketId: socket.id,
          senderName: user.userName,
          senderRole: user.role,
          signalData,
          type
        });
      }
    });

    // Media status update (camera / mic mute state)
    socket.on('media-toggle', ({ isAudioMuted, isVideoOff }) => {
      if (currentRoom) {
        socket.to(currentRoom).emit('peer-media-toggle', {
          socketId: socket.id,
          isAudioMuted,
          isVideoOff
        });
      }
    });

    // End session (therapist initiated)
    socket.on('end-session', async ({ sessionId }) => {
      if (currentRoom && (user.isHost || user.role === 'THERAPIST' || user.role === 'SUPER_ADMIN')) {
        io.to(currentRoom).emit('session-concluded', {
          concludedBy: user.userName,
          message: 'The psychotherapy session has been concluded by the clinician.'
        });

        // Update database status
        if (sessionId) {
          const session = db.findById('sessions', sessionId);
          if (session && session.status !== 'ENDED') {
            await db.update('sessions', sessionId, {
              status: 'ENDED',
              endedAt: new Date().toISOString()
            });
            if (session.appointmentId) {
              await db.update('appointments', session.appointmentId, { status: 'COMPLETED' });
            }
          }
        }
      }
    });

    socket.on('leave-room', () => {
      cleanupParticipant(socket, currentRoom);
    });

    socket.on('disconnect', () => {
      cleanupParticipant(socket, currentRoom);
    });
  });

  function cleanupParticipant(socket, roomId) {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        socket.to(roomId).emit('participant-left', {
          socketId: socket.id,
          participantName: socket.user?.userName
        });
      }
    }
  }

  return io;
}
