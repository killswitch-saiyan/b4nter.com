import json
import logging
import time
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from models import MessageResponse, UserResponse
from database import db
import re

logger = logging.getLogger(__name__)

# Store connected users and their WebSocket connections
connected_users: Dict[str, WebSocket] = {}  # user_id -> WebSocket
user_channels: Dict[str, List[str]] = {}  # user_id -> list of channel_ids

async def get_channel_uuid(channel_id_or_name):
    uuid_regex = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    if not channel_id_or_name:
        return None
    if uuid_regex.match(channel_id_or_name):
        return channel_id_or_name
    # Otherwise, look up by name
    channel = await db.get_channel_by_name(channel_id_or_name)
    if channel:
        return channel['id']
    return None

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}
        # Simplified video room structure (friend-face-connect pattern)
        self.video_rooms: Dict[str, Dict[str, dict]] = {}  # room_id -> {participant_id: {name, user_id, websocket, video_enabled, audio_enabled}}

    async def connect(self, websocket: WebSocket, user_id: str):
        logger.info(f"Adding user {user_id} to connection tracking")
        self.active_connections.append(websocket)
        self.user_connections[user_id] = websocket
        connected_users[user_id] = websocket
        user_channels[user_id] = []
        
        logger.info(f"User {user_id} connected successfully")
        
        # Send connection confirmation with error handling
        try:
            await websocket.send_text(json.dumps({
                "type": "connection_established",
                "user_id": user_id
            }))
            logger.info(f"Connection confirmation sent successfully to user {user_id}")
        except Exception as e:
            logger.error(f"Error sending connection confirmation to user {user_id}: {e}")
            self.disconnect(user_id)
            return

    def disconnect(self, user_id: str):
        """Clean up user connections and video rooms"""
        # Clean up video rooms first
        rooms_to_remove = []
        for room_id, room in self.video_rooms.items():
            participants_to_remove = []
            for p_id, participant in room.items():
                if participant['user_id'] == user_id:
                    participants_to_remove.append(p_id)
                    logger.info(f"Participant {participant['name']} ({user_id}) left room {room_id}")
                    
                    # Notify other participants
                    for other_p_id, other_participant in room.items():
                        if other_p_id != p_id:
                            try:
                                import asyncio
                                asyncio.create_task(other_participant['websocket'].send_text(json.dumps({
                                    'type': 'webrtc_participant_left',
                                    'channelId': room_id,
                                    'participantId': p_id
                                })))
                            except Exception as e:
                                logger.error(f"Error notifying participant {other_p_id}: {e}")
            
            # Remove participants that left
            for p_id in participants_to_remove:
                del room[p_id]
                
            # Mark room for removal if empty
            if len(room) == 0:
                rooms_to_remove.append(room_id)
        
        # Remove empty rooms
        for room_id in rooms_to_remove:
            del self.video_rooms[room_id]
            logger.info(f"Video room {room_id} deleted (empty)")
        
        # Clean up connection tracking
        if user_id in self.user_connections:
            websocket = self.user_connections[user_id]
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            del self.user_connections[user_id]
        if user_id in connected_users:
            del connected_users[user_id]
        if user_id in user_channels:
            del user_channels[user_id]
        logger.info(f"User {user_id} disconnected")

    async def join_channel(self, user_id: str, channel_id: str):
        if user_id in self.user_connections:
            websocket = self.user_connections[user_id]
            if user_id not in user_channels:
                user_channels[user_id] = []
            if channel_id not in user_channels[user_id]:
                user_channels[user_id].append(channel_id)
            
            await websocket.send_text(json.dumps({
                "type": "channel_joined",
                "channel_id": channel_id,
                "user_id": user_id
            }))
            logger.info(f"User {user_id} joined channel {channel_id}")

    async def leave_channel(self, user_id: str, channel_id: str):
        if user_id in user_channels and channel_id in user_channels[user_id]:
            user_channels[user_id].remove(channel_id)
            if user_id in self.user_connections:
                websocket = self.user_connections[user_id]
                await websocket.send_text(json.dumps({
                    "type": "channel_left",
                    "channel_id": channel_id,
                    "user_id": user_id
                }))
            logger.info(f"User {user_id} left channel {channel_id}")

    async def send_message(self, content: str, sender_id: str, channel_id: str | None = None, recipient_id: str | None = None, image_url: str | None = None):
        # Get sender information
        sender = await db.get_user_by_id(sender_id)
        sender_username = sender.get('username') if sender else 'Unknown User'
        
        # Create message in database
        message_data = {
            'content': content,
            'sender_id': sender_id,
            'channel_id': channel_id,
            'recipient_id': recipient_id,
            'image_url': image_url,
            'timestamp': time.time()
        }
        
        # Save to database and get the message back with ID
        try:
            message_record = await db.create_message(**message_data)
            message_id = message_record['id']
        except Exception as e:
            logger.error(f"Failed to save message to database: {e}")
            return
        
        # Create response payload
        payload = {
            "type": "new_message",
            "id": message_id,
            "content": content,
            "sender_id": sender_id,
            "sender_username": sender_username,
            "timestamp": message_data['timestamp'],
            "image_url": image_url
        }
        
        if channel_id:
            payload["channel_id"] = channel_id
            # Broadcast to channel
            await self.broadcast_to_channel(channel_id, payload)
        elif recipient_id:
            payload["recipient_id"] = recipient_id
            # Send to specific user
            await self.send_to_user(recipient_id, payload)
            # Also send back to sender for confirmation
            await self.send_to_user(sender_id, payload)

    async def broadcast_to_channel(self, channel_id: str, message: dict):
        disconnected_users = []
        for user_id, channels in user_channels.items():
            if channel_id in channels and user_id in self.user_connections:
                try:
                    await self.user_connections[user_id].send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending to user {user_id}: {e}")
                    disconnected_users.append(user_id)
        
        # Clean up disconnected users
        for user_id in disconnected_users:
            self.disconnect(user_id)

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.user_connections:
            try:
                await self.user_connections[user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending to user {user_id}: {e}")
                self.disconnect(user_id)

    async def broadcast_user_status(self, user_id: str, status: str):
        message = {
            "type": "user_status_changed",
            "user_id": user_id,
            "status": status
        }
        
        for uid, websocket in self.user_connections.items():
            if uid != user_id:  # Don't send to the user themselves
                try:
                    await websocket.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error broadcasting status to user {uid}: {e}")

    # Simplified WebRTC handlers (friend-face-connect pattern)
    async def webrtc_join_room(self, user_id: str, message: dict):
        """Handle user joining a video room"""
        room_id = message.get('channelId')
        participant_id = message.get('participantId')
        participant_name = message.get('participantName')
        
        if not room_id or not participant_id:
            logger.warning(f"Invalid join room message from {user_id}: {message}")
            return
            
        logger.info(f"User {participant_name} ({user_id}) joining room {room_id}")
        
        # Initialize room if it doesn't exist
        if room_id not in self.video_rooms:
            self.video_rooms[room_id] = {}
            
        # Add participant to room
        self.video_rooms[room_id][participant_id] = {
            'name': participant_name,
            'user_id': user_id,
            'websocket': self.user_connections[user_id],
            'video_enabled': True,
            'audio_enabled': True
        }
        
        # Notify existing participants about new participant
        for p_id, participant in self.video_rooms[room_id].items():
            if p_id != participant_id:  # Don't notify self
                try:
                    await participant['websocket'].send_text(json.dumps({
                        'type': 'webrtc_participant_joined',
                        'channelId': room_id,
                        'participantId': participant_id,
                        'participantName': participant_name
                    }))
                except Exception as e:
                    logger.error(f"Error notifying participant {p_id}: {e}")
                    
        logger.info(f"Participant {participant_name} added to room {room_id}. Room size: {len(self.video_rooms[room_id])}")

    async def webrtc_room_query(self, user_id: str, message: dict):
        """Handle room query - respond if we're in the room"""
        room_id = message.get('channelId')
        participant_id = message.get('participantId')
        
        if room_id in self.video_rooms:
            # Find our participant in this room
            for p_id, participant in self.video_rooms[room_id].items():
                if participant['user_id'] == user_id:
                    # We're in this room, respond to the query
                    try:
                        await self.user_connections[user_id].send_text(json.dumps({
                            'type': 'webrtc_room_response',
                            'channelId': room_id,
                            'participantId': p_id,
                            'participantName': participant['name'],
                            'targetParticipantId': participant_id
                        }))
                    except Exception as e:
                        logger.error(f"Error sending room response: {e}")
                    break

    async def webrtc_room_response(self, user_id: str, message: dict):
        """Handle room response - forward to target participant"""
        target_participant_id = message.get('targetParticipantId')
        room_id = message.get('channelId')
        
        if room_id in self.video_rooms and target_participant_id in self.video_rooms[room_id]:
            target_participant = self.video_rooms[room_id][target_participant_id]
            try:
                await target_participant['websocket'].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error forwarding room response: {e}")

    async def webrtc_offer(self, user_id: str, message: dict):
        """Handle WebRTC offer - forward to target participant"""
        room_id = message.get('channelId')
        target_participant_id = message.get('targetParticipantId')
        
        if not room_id or not target_participant_id:
            logger.warning(f"Invalid offer message: {message}")
            return
            
        if room_id in self.video_rooms and target_participant_id in self.video_rooms[room_id]:
            target_participant = self.video_rooms[room_id][target_participant_id]
            try:
                await target_participant['websocket'].send_text(json.dumps(message))
                logger.info(f"WebRTC offer forwarded from {message.get('participantId')} to {target_participant_id}")
            except Exception as e:
                logger.error(f"Error forwarding offer: {e}")
        else:
            logger.warning(f"Target participant {target_participant_id} not found in room {room_id}")

    async def webrtc_answer(self, user_id: str, message: dict):
        """Handle WebRTC answer - forward to target participant"""
        room_id = message.get('channelId')
        target_participant_id = message.get('targetParticipantId')
        
        if not room_id or not target_participant_id:
            logger.warning(f"Invalid answer message: {message}")
            return
            
        if room_id in self.video_rooms and target_participant_id in self.video_rooms[room_id]:
            target_participant = self.video_rooms[room_id][target_participant_id]
            try:
                await target_participant['websocket'].send_text(json.dumps(message))
                logger.info(f"WebRTC answer forwarded from {message.get('participantId')} to {target_participant_id}")
            except Exception as e:
                logger.error(f"Error forwarding answer: {e}")
        else:
            logger.warning(f"Target participant {target_participant_id} not found in room {room_id}")

    async def webrtc_ice_candidate(self, user_id: str, message: dict):
        """Handle WebRTC ICE candidate - forward to target participant"""
        room_id = message.get('channelId')
        target_participant_id = message.get('targetParticipantId')
        
        if not room_id or not target_participant_id:
            logger.warning(f"Invalid ICE candidate message: {message}")
            return
            
        if room_id in self.video_rooms and target_participant_id in self.video_rooms[room_id]:
            target_participant = self.video_rooms[room_id][target_participant_id]
            try:
                await target_participant['websocket'].send_text(json.dumps(message))
                logger.info(f"ICE candidate forwarded from {message.get('participantId')} to {target_participant_id}")
            except Exception as e:
                logger.error(f"Error forwarding ICE candidate: {e}")
        else:
            logger.warning(f"Target participant {target_participant_id} not found in room {room_id}")

    async def webrtc_leave_room(self, user_id: str, message: dict):
        """Handle user leaving a video room"""
        room_id = message.get('channelId')
        participant_id = message.get('participantId')
        
        if not room_id or not participant_id:
            logger.warning(f"Invalid leave room message: {message}")
            return
            
        if room_id in self.video_rooms and participant_id in self.video_rooms[room_id]:
            participant = self.video_rooms[room_id][participant_id]
            participant_name = participant['name']
            
            # Remove participant from room
            del self.video_rooms[room_id][participant_id]
            logger.info(f"Participant {participant_name} left room {room_id}")
            
            # Notify remaining participants
            for p_id, other_participant in self.video_rooms[room_id].items():
                try:
                    await other_participant['websocket'].send_text(json.dumps({
                        'type': 'webrtc_participant_left',
                        'channelId': room_id,
                        'participantId': participant_id
                    }))
                except Exception as e:
                    logger.error(f"Error notifying participant {p_id}: {e}")
            
            # Remove room if empty
            if len(self.video_rooms[room_id]) == 0:
                del self.video_rooms[room_id]
                logger.info(f"Video room {room_id} deleted (empty)")

    async def handle_websocket_message(self, websocket: WebSocket, user_id: str):
        """Handle incoming WebSocket messages"""
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                message_type = message.get('type')
                
                logger.info(f"Received message from user {user_id}: {message_type}")
                
                if message_type == 'ping':
                    try:
                        await websocket.send_text(json.dumps({"type": "pong"}))
                        logger.debug(f"Sent pong to user {user_id}")
                    except Exception as e:
                        logger.error(f"Error sending pong to user {user_id}: {e}")
                        self.disconnect(user_id)
                        break
                elif message_type == 'join_channel':
                    await self.join_channel(user_id, message.get('channel_id'))
                elif message_type == 'leave_channel':
                    await self.leave_channel(user_id, message.get('channel_id'))
                elif message_type == 'send_message':
                    await self.send_message(
                        content=message.get('content'),
                        sender_id=user_id,
                        channel_id=message.get('channel_id'),
                        recipient_id=message.get('recipient_id'),
                        image_url=message.get('image_url')
                    )
                # Simplified WebRTC signaling (friend-face-connect pattern)
                elif message_type == 'webrtc_join_room':
                    await self.webrtc_join_room(user_id, message)
                elif message_type == 'webrtc_room_query':
                    await self.webrtc_room_query(user_id, message)
                elif message_type == 'webrtc_room_response':
                    await self.webrtc_room_response(user_id, message)
                elif message_type == 'webrtc_offer':
                    await self.webrtc_offer(user_id, message)
                elif message_type == 'webrtc_answer':
                    await self.webrtc_answer(user_id, message)
                elif message_type == 'webrtc_ice_candidate':
                    await self.webrtc_ice_candidate(user_id, message)
                elif message_type == 'webrtc_leave_room':
                    await self.webrtc_leave_room(user_id, message)
                else:
                    logger.warning(f"Unknown message type: {message_type}")
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for user {user_id}")
            self.disconnect(user_id)
            await self.broadcast_user_status(user_id, "offline")
        except Exception as e:
            logger.error(f"Error handling WebSocket message for user {user_id}: {e}")
            self.disconnect(user_id)

# Global WebSocket manager instance
websocket_manager = WebSocketManager()