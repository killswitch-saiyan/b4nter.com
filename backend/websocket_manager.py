import json
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from models import MessageResponse, UserResponse
from database import db

logger = logging.getLogger(__name__)

# Store connected users and their WebSocket connections
connected_users: Dict[str, WebSocket] = {}  # user_id -> WebSocket
user_channels: Dict[str, List[str]] = {}  # user_id -> list of channel_ids

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.user_connections[user_id] = websocket
        connected_users[user_id] = websocket
        user_channels[user_id] = []
        
        logger.info(f"User {user_id} connected")
        
        # Send connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "user_id": user_id
        }))

    def disconnect(self, user_id: str):
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
            
            # Notify user that they joined the channel
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

    async def send_message(self, content: str, sender_id: str, channel_id: str = None, recipient_id: str = None):
        try:
            # Create message data
            message_data = {
                'content': content,
                'sender_id': sender_id,
                'channel_id': channel_id,
                'recipient_id': recipient_id
            }
            
            # Save message to database
            saved_message = await db.create_message(message_data)
            if not saved_message:
                logger.error(f"Failed to save message to database: {message_data}")
                return
            
            # Get sender info
            sender = await db.get_user_by_id(sender_id)
            if not sender:
                logger.error(f"Failed to get sender info for user_id: {sender_id}")
                return
            
            # Prepare message response
            message_response = {
                'id': saved_message['id'],
                'content': content,
                'sender_id': sender_id,
                'sender_name': sender.get('full_name') or sender.get('username'),
                'channel_id': channel_id,
                'recipient_id': recipient_id,
                'created_at': saved_message['created_at'],
                'updated_at': saved_message['updated_at']
            }
            
            # Send message to appropriate recipients
            if channel_id:
                # Channel message - send to all users in the channel
                await self.broadcast_to_channel(channel_id, {
                    "type": "new_channel_message",
                    "message": message_response
                })
            elif recipient_id:
                # Direct message
                await self.send_to_user(recipient_id, {
                    "type": "new_direct_message",
                    "message": message_response
                })
                # Also send to sender for confirmation
                await self.send_to_user(sender_id, {
                    "type": "new_direct_message",
                    "message": message_response
                })
            
            logger.info(f"Message sent by {sender_id} to {'channel ' + channel_id if channel_id else 'user ' + recipient_id}")
            
        except Exception as e:
            logger.error(f"Error in send_message: {e}")

    async def broadcast_to_channel(self, channel_id: str, message: dict):
        """Send message to all users in a channel"""
        for user_id, channels in user_channels.items():
            if channel_id in channels and user_id in self.user_connections:
                try:
                    await self.user_connections[user_id].send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending to user {user_id}: {e}")

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to a specific user"""
        if user_id in self.user_connections:
            try:
                await self.user_connections[user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending to user {user_id}: {e}")

    async def handle_websocket_message(self, websocket: WebSocket, user_id: str):
        """Handle incoming WebSocket messages"""
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                message_type = message.get('type')
                
                if message_type == 'join_channel':
                    await self.join_channel(user_id, message.get('channel_id'))
                
                elif message_type == 'leave_channel':
                    await self.leave_channel(user_id, message.get('channel_id'))
                
                elif message_type == 'send_message':
                    await self.send_message(
                        content=message.get('content'),
                        sender_id=user_id,
                        channel_id=message.get('channel_id'),
                        recipient_id=message.get('recipient_id')
                    )
                
                elif message_type == 'typing_start':
                    # Handle typing indicator
                    pass
                
                elif message_type == 'typing_stop':
                    # Handle typing indicator
                    pass
                
        except WebSocketDisconnect:
            self.disconnect(user_id)
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            self.disconnect(user_id)

# Global WebSocket manager instance
websocket_manager = WebSocketManager() 