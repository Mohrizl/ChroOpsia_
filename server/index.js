import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const rooms = {};
const socketMap = new Map();

const generateRoomCode = (type) => {
  const prefix = type === 'public' ? 'PUB-' : 'PRV-';
  return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
};

const getPublicRooms = () => Object.values(rooms)
  .filter(room => room.type === 'public' && !room.deleted)
  .map(room => ({ 
    code: room.code, 
    host: room.host, 
    players: room.players.filter(p => !p.isBot).length, 
    maxPlayers: room.maxPlayers,
    status: room.status,
    gameType: room.gameType
  }));

const BOT_CONFIG = {
  Easy: { min: 50, max: 200, finishChance: 0.15 },
  Medium: { min: 250, max: 450, finishChance: 0.25 },
  Hard: { min: 500, max: 750, finishChance: 0.4 },
};

const createBot = (difficulty) => ({
  id: `bot-${difficulty}-${Math.floor(Math.random() * 10000)}`,
  name: `Bot_${difficulty}_${Math.floor(Math.random() * 100)}`,
  difficulty,
  score: 0,
  currentQuestion: 1,
  finished: false,
  isBot: true,
  ready: true,
  correctCount: 0,
  wrongCount: 0
});

const broadcastRooms = () => {
  io.emit('roomList', getPublicRooms());
};

const broadcastRoom = (code) => {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('roomState', {
    code: room.code,
    type: room.type,
    host: room.host,
    status: room.status,
    gameType: room.gameType,
    maxPlayers: room.maxPlayers,
    players: room.players.map(p => ({
      name: p.name,
      score: p.score,
      isHost: p.name === room.host,
      ready: p.ready,
      currentQuestion: p.currentQuestion,
      finished: p.finished,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount || 0,
      isBot: p.isBot || false,
    })),
    bots: room.bots,
  });
};

const removeRoomIfEmpty = (code) => {
  const room = rooms[code];
  if (!room) return;
  const humans = room.players.filter(p => !p.isBot);
  if (humans.length === 0) {
    if (room.gameInterval) clearInterval(room.gameInterval);
    delete rooms[code];
    io.emit('roomRemoved', code);
    broadcastRooms();
  }
};

const startRoomGame = (code, gameType) => {
  const room = rooms[code];
  if (!room) return;
  room.status = 'playing';
  room.gameType = gameType;
  room.startedAt = Date.now();
  
  // Reset all players thoroughly
  room.players.forEach(p => {
    p.score = 0;
    p.currentQuestion = 1;
    p.finished = false;
    p.correctCount = 0;
    p.wrongCount = 0;
    p.ready = true; // Stay ready for next game
  });
  
  // Reset bots
  room.bots.forEach(bot => {
    bot.score = 0;
    bot.currentQuestion = 1;
    bot.finished = false;
    bot.correctCount = 0;
    bot.wrongCount = 0;
  });

  if (room.gameInterval) {
    clearInterval(room.gameInterval);
  }

  room.gameInterval = setInterval(() => {
    if (!rooms[code]) return;
    const currentRoom = rooms[code];
    let anyActive = false;

    // Bot progress logic
    currentRoom.bots.forEach(bot => {
      if (bot.finished) return;
      anyActive = true;
      const config = BOT_CONFIG[bot.difficulty] || BOT_CONFIG.Medium;
      
      // Bots answer with a higher chance and can skip 1-2 questions per tick
      if (Math.random() < config.finishChance * 2) {
        const questionsToDo = Math.random() > 0.7 ? 2 : 1;
        for (let i = 0; i < questionsToDo; i++) {
          if (bot.currentQuestion <= 14) {
            bot.score += Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
            bot.correctCount += 1;
            bot.currentQuestion += 1;
          }
        }
      }
      if (bot.currentQuestion > 14) {
        bot.finished = true;
      }
    });

    // Check if any humans are still playing
    currentRoom.players.forEach(player => {
      if (!player.finished && !player.isBot) {
        anyActive = true;
      }
    });

    broadcastRoom(code);

    if (!anyActive) {
      clearInterval(currentRoom.gameInterval);
      const standings = [...currentRoom.players, ...currentRoom.bots].sort((a, b) => b.score - a.score);
      io.to(code).emit('gameEnded', { standings });
    }
  }, 1000);

  broadcastRoom(code);
};

io.on('connection', (socket) => {
  socket.on('requestRoomList', () => {
    socket.emit('roomList', getPublicRooms());
  });

  socket.on('requestRoomState', (roomCode) => {
    if (rooms[roomCode]) {
      broadcastRoom(roomCode);
    }
  });

  socket.on('createRoom', ({ type, playerName, gameType }, callback) => {
    const code = generateRoomCode(type);
    rooms[code] = {
      code,
      type,
      host: playerName,
      players: [{ name: playerName, ready: false, score: 0, currentQuestion: 1, finished: false, correctCount: 0 }],
      bots: [],
      status: 'waiting',
      gameType,
      maxPlayers: 8,
    };
    socket.join(code);
    socketMap.set(socket.id, { roomCode: code, playerName });
    broadcastRooms();
    callback?.({ success: true, room: rooms[code] });
  });

  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const room = rooms[roomCode];
    if (!room) {
      callback?.({ success: false, message: 'Room tidak ditemukan' });
      return;
    }
    if (room.status !== 'waiting') {
      callback?.({ success: false, message: 'Game sedang berlangsung' });
      return;
    }
    const humans = room.players.filter(p => !p.isBot);
    if (humans.length + room.bots.length >= room.maxPlayers) {
      callback?.({ success: false, message: 'Room sudah penuh' });
      return;
    }
    if (room.players.some(p => p.name === playerName)) {
      callback?.({ success: false, message: 'Nama sudah digunakan dalam room' });
      return;
    }
    room.players.push({ name: playerName, ready: false, score: 0, currentQuestion: 1, finished: false, correctCount: 0 });
    socket.join(roomCode);
    socketMap.set(socket.id, { roomCode, playerName });
    broadcastRoom(roomCode);
    broadcastRooms();
    callback?.({ success: true, room });
  });

  socket.on('leaveRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.players = room.players.filter(p => p.name !== playerName);
    if (room.host === playerName && room.players.length > 0) {
      room.host = room.players[0].name;
    }
    
    socketMap.forEach((value, key) => {
      if (value.roomCode === roomCode && value.playerName === playerName) {
        socketMap.delete(key);
      }
    });

    if (room.players.filter(p => !p.isBot).length === 0) {
      if (room.gameInterval) clearInterval(room.gameInterval);
      delete rooms[roomCode];
      io.emit('roomRemoved', roomCode);
    } else {
      broadcastRoom(roomCode);
    }
    broadcastRooms();
  });

  socket.on('toggleReady', ({ roomCode, playerName, ready }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.ready = ready;
      broadcastRoom(roomCode);
    }
  });

  socket.on('addBot', ({ roomCode, difficulty }, callback) => {
    const room = rooms[roomCode];
    if (!room) {
      callback?.({ success: false, message: 'Room tidak ditemukan' });
      return;
    }
    if (room.players.length + room.bots.length >= room.maxPlayers) {
      callback?.({ success: false, message: 'Kapasitas room penuh' });
      return;
    }
    const bot = createBot(difficulty);
    room.bots.push(bot);
    broadcastRoom(roomCode);
    callback?.({ success: true, bot });
  });

  socket.on('kickPlayer', ({ roomCode, targetName }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    // Check if it's a bot
    const botIndex = room.bots.findIndex(b => b.name === targetName);
    if (botIndex !== -1) {
      room.bots.splice(botIndex, 1);
      broadcastRoom(roomCode);
      return;
    }

    // It's a human player
    room.players = room.players.filter(p => p.name !== targetName);
    io.to(roomCode).emit('playerKicked', targetName);
    broadcastRoom(roomCode);
    broadcastRooms();
  });

  socket.on('startMatch', ({ roomCode, timeLimit }) => {
    io.to(roomCode).emit('matchStarted', { timeLimit });
  });

  socket.on('startGame', ({ roomCode, gameType }, callback) => {
    const room = rooms[roomCode];
    if (!room) {
      callback?.({ success: false, message: 'Room tidak ditemukan' });
      return;
    }
    room.gameType = gameType;
    room.status = 'playing';
    startRoomGame(roomCode, gameType);
    io.to(roomCode).emit('gameStarted', { roomCode, gameType });
    broadcastRoom(roomCode);
    broadcastRooms();
    callback?.({ success: true });
  });

  socket.on('playerAnswer', ({ roomCode, playerName, correct, points, correctCount, wrongCount }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.name === playerName);
    if (!player || player.finished) return;
    
    if (correct) {
      player.score += points;
      player.correctCount = correctCount;
    } else {
      player.wrongCount = wrongCount;
      // Small penalty for wrong answer in Color Race only
      if (room.gameType === 'color-race') {
        player.score = Math.max(0, player.score - 50);
      }
    }
    
    player.currentQuestion += 1;
    if (player.currentQuestion > 14) {
      player.finished = true;
    }
    broadcastRoom(roomCode);
  });

  socket.on('playerFinished', ({ roomCode, playerName, score, correctCount, wrongCount }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.finished = true;
      player.score = score;
      player.correctCount = correctCount;
      player.wrongCount = wrongCount;
      broadcastRoom(roomCode);
    }
  });

  socket.on('disconnecting', () => {
    const info = socketMap.get(socket.id);
    if (info) {
      const { roomCode, playerName } = info;
      const room = rooms[roomCode];
      if (room) {
        // If in game, just mark as finished so others aren't blocked
        if (room.status === 'playing') {
          const player = room.players.find(p => p.name === playerName);
          if (player) player.finished = true;
        }
        
        // Remove from list
        room.players = room.players.filter(p => p.name !== playerName);
        
        // Update host if needed
        if (room.host === playerName && room.players.length > 0) {
          room.host = room.players[0].name;
        }
        
        // Check if room empty of humans
        const humans = room.players.filter(p => !p.isBot);
        if (humans.length === 0) {
          if (room.gameInterval) clearInterval(room.gameInterval);
          delete rooms[roomCode];
          io.emit('roomRemoved', roomCode);
          broadcastRooms();
        } else {
          broadcastRoom(roomCode);
          broadcastRooms();
        }
      }
      socketMap.delete(socket.id);
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist/index.html'));
  });
}

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`Socket backend running on http://localhost:${port}`);
});
