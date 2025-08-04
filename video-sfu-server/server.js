const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = 8080;

// Store rooms and participants
const rooms = new Map();
const participants = new Map(); // websocket -> participant info

class Room {
  constructor(id) {
    this.id = id;
    this.participants = new Map(); // participantId -> { ws, name, id }
  }

  addParticipant(ws, participantId, name) {
    const participant = { ws, name, id: participantId };
    this.participants.set(participantId, participant);
    participants.set(ws, { ...participant, roomId: this.id });
    
    console.log(`Participant ${name} (${participantId}) joined room ${this.id}`);
    
    // Notify existing participants about new user
    this.broadcast({
      type: 'user-joined',
      participant: { id: participantId, name }
    }, participantId);

    // Send current participants to new user
    const existingParticipants = Array.from(this.participants.values())
      .filter(p => p.id !== participantId)
      .map(p => ({ id: p.id, name: p.name }));

    ws.send(JSON.stringify({
      type: 'joined-room',
      roomId: this.id,
      participants: existingParticipants
    }));
  }

  removeParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (participant) {
      this.participants.delete(participantId);
      participants.delete(participant.ws);
      
      console.log(`Participant ${participant.name} (${participantId}) left room ${this.id}`);
      
      // Notify other participants
      this.broadcast({
        type: 'user-left',
        participantId
      });

      // Remove room if empty
      if (this.participants.size === 0) {
        rooms.delete(this.id);
        console.log(`Room ${this.id} deleted (empty)`);
      }
    }
  }

  broadcast(message, excludeId = null) {
    this.participants.forEach((participant, id) => {
      if (id !== excludeId && participant.ws.readyState === WebSocket.OPEN) {
        participant.ws.send(JSON.stringify(message));
      }
    });
  }

  sendToParticipant(participantId, message) {
    const participant = this.participants.get(participantId);
    if (participant && participant.ws.readyState === WebSocket.OPEN) {
      participant.ws.send(JSON.stringify(message));
    }
  }
}

// Create WebSocket server
const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false 
});

console.log(`🎥 Video SFU Server running on port ${PORT}`);

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection from:', req.socket.remoteAddress);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message.type);

      switch (message.type) {
        case 'join-room':
          handleJoinRoom(ws, message);
          break;
        
        case 'offer':
          handleOffer(ws, message);
          break;
        
        case 'answer':
          handleAnswer(ws, message);
          break;
        
        case 'ice-candidate':
          handleIceCandidate(ws, message);
          break;
        
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleJoinRoom(ws, message) {
  const { roomId, userName } = message;
  
  if (!roomId || !userName) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room ID and user name are required'
    }));
    return;
  }

  // Get or create room
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
    console.log(`Created new room: ${roomId}`);
  }

  // Generate unique participant ID
  const participantId = uuidv4();
  
  // Add participant to room
  room.addParticipant(ws, participantId, userName);
}

function handleOffer(ws, message) {
  const participant = participants.get(ws);
  if (!participant) return;

  const room = rooms.get(participant.roomId);
  if (!room) return;

  // Forward offer to target participant
  room.sendToParticipant(message.targetId, {
    type: 'offer',
    offer: message.offer,
    senderId: participant.id
  });
}

function handleAnswer(ws, message) {
  const participant = participants.get(ws);
  if (!participant) return;

  const room = rooms.get(participant.roomId);
  if (!room) return;

  // Forward answer to target participant
  room.sendToParticipant(message.targetId, {
    type: 'answer',
    answer: message.answer,
    senderId: participant.id
  });
}

function handleIceCandidate(ws, message) {
  const participant = participants.get(ws);
  if (!participant) return;

  const room = rooms.get(participant.roomId);
  if (!room) return;

  // Forward ICE candidate to target participant
  room.sendToParticipant(message.targetId, {
    type: 'ice-candidate',
    candidate: message.candidate,
    senderId: participant.id
  });
}

function handleDisconnect(ws) {
  const participant = participants.get(ws);
  if (!participant) return;

  const room = rooms.get(participant.roomId);
  if (room) {
    room.removeParticipant(participant.id);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down SFU server...');
  wss.close(() => {
    console.log('SFU server shut down gracefully');
    process.exit(0);
  });
});

module.exports = { wss, rooms };