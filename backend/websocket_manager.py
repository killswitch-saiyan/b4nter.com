import json
import logging
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

    async def connect(self, websocket: WebSocket, user_id: str):
        # Don't call websocket.accept() here - FastAPI already accepts it in the main endpoint
        logger.info(f"Adding user {user_id} to connection tracking")
        self.active_connections.append(websocket)
        self.user_connections[user_id] = websocket
        connected_users[user_id] = websocket
        user_channels[user_id] = []
        
        logger.info(f"User {user_id} connected successfully")
        logger.info(f"Total active connections: {len(self.active_connections)}")
        logger.info(f"Total user connections: {len(self.user_connections)}")
        
        # Send connection confirmation with error handling
        try:
            logger.info(f"Sending connection confirmation to user {user_id}")
            await websocket.send_text(json.dumps({
                "type": "connection_established",
                "user_id": user_id
            }))
            logger.info(f"Connection confirmation sent successfully to user {user_id}")
        except Exception as e:
            logger.error(f"Error sending connection confirmation to user {user_id}: {e}")
            logger.error(f"Exception type: {type(e).__name__}")
            logger.error(f"Exception details: {str(e)}")
            # If we can't send the confirmation, the connection might be broken
            self.disconnect(user_id)
            return

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

    async def send_message(self, content: str, sender_id: str, channel_id: str | None = None, recipient_id: str | None = None, image_url: str | None = None):
        try:
            # Map channel_id string to UUID if needed
            if channel_id:
                channel_id_mapped = await get_channel_uuid(channel_id)
                if not channel_id_mapped:
                    logger.error(f"Channel not found for id or name: {channel_id}")
                    return
                channel_id = channel_id_mapped
            # Create message data
            message_data = {
                'content': content,
                'sender_id': sender_id,
                'channel_id': channel_id,
                'recipient_id': recipient_id,
                'image_url': image_url
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
                'sender': {
                    'username': sender.get('username'),
                    'full_name': sender.get('full_name'),
                    'avatar_url': sender.get('avatar_url')
                },
                'channel_id': channel_id,
                'recipient_id': recipient_id,
                'created_at': saved_message['created_at'],
                'updated_at': saved_message['updated_at'],
                'image_url': saved_message.get('image_url')
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
            
            logger.info(f"Message sent by {sender_id} to {'channel ' + str(channel_id) if channel_id else 'user ' + str(recipient_id)}")
            
        except Exception as e:
            logger.error(f"Error in send_message: {e}")

    async def broadcast_to_channel(self, channel_id: str, message: dict):
        """Send message to all users in a channel"""
        disconnected_users = []
        for user_id, channels in user_channels.items():
            if channel_id in channels and user_id in self.user_connections:
                try:
                    await self.user_connections[user_id].send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending to user {user_id}: {e}")
                    # Mark user for disconnection
                    disconnected_users.append(user_id)
        
        # Clean up disconnected users
        for user_id in disconnected_users:
            self.disconnect(user_id)

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to a specific user"""
        if user_id in self.user_connections:
            try:
                await self.user_connections[user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending to user {user_id}: {e}")
                # If we can't send to the user, they might be disconnected
                # Clean up the connection
                self.disconnect(user_id)

    async def add_reaction(self, user_id: str, message: dict):
        message_id = message.get('message_id')
        emoji = message.get('emoji')
        channel_id = message.get('channel_id')
        recipient_id = message.get('recipient_id')
        if not message_id or not emoji:
            logger.warning(f"Missing message_id or emoji in add_reaction: {message}")
            return
        await db.add_reaction(message_id, user_id, emoji)
        all_reactions = await db.get_reactions_for_message(message_id)
        emoji_count = sum(1 for r in all_reactions if r['emoji'] == emoji)
        payload = {
            'type': 'reaction_update',
            'message_id': message_id,
            'emoji': emoji,
            'user_id': user_id,
            'action': 'add',
            'count': emoji_count
        }
        if isinstance(channel_id, str) and channel_id:
            logger.info(f"Broadcasting reaction add to channel {channel_id}")
            await self.broadcast_to_channel(channel_id, payload)
        elif isinstance(recipient_id, str) and recipient_id:
            logger.info(f"Sending reaction add to DM users {user_id} and {recipient_id}")
            # Always send to both users in the DM conversation
            await self.send_to_user(recipient_id, payload)
            await self.send_to_user(user_id, payload)
        else:
            logger.warning(f"No valid channel_id or recipient_id for reaction add: {message}")

    async def remove_reaction(self, user_id: str, message: dict):
        message_id = message.get('message_id')
        emoji = message.get('emoji')
        channel_id = message.get('channel_id')
        recipient_id = message.get('recipient_id')
        if not message_id or not emoji:
            logger.warning(f"Missing message_id or emoji in remove_reaction: {message}")
            return
        await db.remove_reaction(message_id, user_id, emoji)
        all_reactions = await db.get_reactions_for_message(message_id)
        emoji_count = sum(1 for r in all_reactions if r['emoji'] == emoji)
        payload = {
            'type': 'reaction_update',
            'message_id': message_id,
            'emoji': emoji,
            'user_id': user_id,
            'action': 'remove',
            'count': emoji_count
        }
        if isinstance(channel_id, str) and channel_id:
            logger.info(f"Broadcasting reaction remove to channel {channel_id}")
            await self.broadcast_to_channel(channel_id, payload)
        elif isinstance(recipient_id, str) and recipient_id:
            logger.info(f"Sending reaction remove to DM users {user_id} and {recipient_id}")
            # Always send to both users in the DM conversation
            await self.send_to_user(recipient_id, payload)
            await self.send_to_user(user_id, payload)
        else:
            logger.warning(f"No valid channel_id or recipient_id for reaction remove: {message}")

    def get_connected_users(self) -> list:
        return list(self.user_connections.keys())

    def is_user_connected(self, user_id: str) -> bool:
        return user_id in self.user_connections

    async def broadcast_user_status(self, user_id: str, status: str):
        # Broadcast user status (online/offline) to all users
        payload = {"type": "user_status", "user_id": user_id, "status": status}
        for ws in self.user_connections.values():
            try:
                await ws.send_text(json.dumps(payload))
            except Exception as e:
                logger.error(f"Error broadcasting user status: {e}")

    async def send_notification_to_user(self, user_id: str, notification: dict):
        # Send a notification to a specific user
        if user_id in self.user_connections:
            try:
                await self.user_connections[user_id].send_text(json.dumps({"type": "notification", **notification}))
            except Exception as e:
                logger.error(f"Error sending notification to user {user_id}: {e}")

    async def handle_websocket_message(self, websocket: WebSocket, user_id: str):
        """Handle incoming WebSocket messages"""
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                message_type = message.get('type')
                
                logger.info(f"Received message from user {user_id}: {message_type}")
                
                if message_type == 'ping':
                    # Respond to ping with pong to keep connection alive
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
                elif message_type == 'add_reaction':
                    await self.add_reaction(user_id, message)
                elif message_type == 'remove_reaction':
                    await self.remove_reaction(user_id, message)
                elif message_type == 'typing_start':
                    await self.handle_typing(user_id, message, typing=True)
                elif message_type == 'typing_stop':
                    await self.handle_typing(user_id, message, typing=False)
                # WebRTC signaling handlers
                elif message_type == 'call_incoming':
                    await self.handle_call_incoming(user_id, message)
                elif message_type == 'call_accepted':
                    await self.handle_call_accepted(user_id, message)
                elif message_type == 'call_rejected':
                    await self.handle_call_rejected(user_id, message)
                elif message_type == 'call_ended':
                    await self.handle_call_ended(user_id, message)
                elif message_type == 'webrtc_offer':
                    await self.handle_webrtc_offer(user_id, message)
                elif message_type == 'webrtc_answer':
                    await self.handle_webrtc_answer(user_id, message)
                elif message_type == 'webrtc_ice_candidate':
                    await self.handle_webrtc_ice_candidate(user_id, message)
                elif message_type == 'call_channel_created':
                    await self.handle_call_channel_created(user_id, message)
                elif message_type == 'call_channel_joined':
                    await self.handle_call_channel_joined(user_id, message)
                elif message_type == 'call_channel_left':
                    await self.handle_call_channel_left(user_id, message)
                else:
                    logger.warning(f"Unknown message type: {message_type}")
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for user {user_id}")
            self.disconnect(user_id)
            # Broadcast offline status
            await self.broadcast_user_status(user_id, "offline")
        except Exception as e:
            logger.error(f"Error handling WebSocket message for user {user_id}: {e}")
            self.disconnect(user_id)

    async def handle_typing(self, user_id: str, message: dict, typing: bool):
        channel_id = message.get('channel_id')
        recipient_id = message.get('recipient_id')
        payload = {
            "type": "user_typing" if typing else "user_stopped_typing",
            "user_id": user_id
        }
        if channel_id:
            payload["channel_id"] = channel_id
            # Broadcast to all users in the channel
            for uid, channels in user_channels.items():
                if channel_id in channels and uid in self.user_connections and uid != user_id:
                    try:
                        await self.user_connections[uid].send_text(json.dumps(payload))
                    except Exception as e:
                        logger.error(f"Error sending typing indicator to user {uid}: {e}")
        elif recipient_id:
            payload["recipient_id"] = recipient_id
            # Send to the DM recipient only
            if recipient_id in self.user_connections:
                try:
                    await self.user_connections[recipient_id].send_text(json.dumps(payload))
                except Exception as e:
                    logger.error(f"Error sending typing indicator to user {recipient_id}: {e}")

    # WebRTC signaling handlers
    async def handle_call_incoming(self, user_id: str, message: dict):
        """Handle incoming call notification"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                # Get caller information
                from database import db
                caller = await db.get_user_by_id(user_id)
                caller_name = caller.get('username') if caller else user_id
                
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_incoming",
                    "from": user_id,
                    "from_name": caller_name,
                    "offer": message.get('offer'),
                    "isVideo": message.get('isVideo', False),
                    "channelId": message.get('channelId')
                }))
                logger.info(f"Call incoming from {user_id} ({caller_name}) to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call incoming to user {target_user_id}: {e}")
                # If we can't send to the user, they might be disconnected
                self.disconnect(target_user_id)

    async def handle_call_accepted(self, user_id: str, message: dict):
        """Handle call acceptance"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_accepted",
                    "from": user_id
                }))
                logger.info(f"Call accepted by {user_id} from {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call accepted to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_call_rejected(self, user_id: str, message: dict):
        """Handle call rejection"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_rejected",
                    "from": user_id
                }))
                logger.info(f"Call rejected by {user_id} from {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call rejected to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_call_ended(self, user_id: str, message: dict):
        """Handle call end"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_ended",
                    "from": user_id
                }))
                logger.info(f"Call ended by {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call ended to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_webrtc_offer(self, user_id: str, message: dict):
        """Handle WebRTC offer"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "webrtc_offer",
                    "from": user_id,
                    "offer": message.get('offer')
                }))
                logger.info(f"WebRTC offer from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending WebRTC offer to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_webrtc_answer(self, user_id: str, message: dict):
        """Handle WebRTC answer"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "webrtc_answer",
                    "from": user_id,
                    "answer": message.get('answer')
                }))
                logger.info(f"WebRTC answer from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending WebRTC answer to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_webrtc_ice_candidate(self, user_id: str, message: dict):
        """Handle WebRTC ICE candidate"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "webrtc_ice_candidate",
                    "from": user_id,
                    "candidate": message.get('candidate')
                }))
                logger.info(f"WebRTC ICE candidate from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending WebRTC ICE candidate to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_call_channel_created(self, user_id: str, message: dict):
        """Handle call channel creation notification"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_channel_created",
                    "from": user_id,
                    "channelId": message.get('channelId'),
                    "channelName": message.get('channelName'),
                    "callType": message.get('callType'),
                    "participants": message.get('participants')
                }))
                logger.info(f"Call channel creation notification from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call channel creation notification to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_call_channel_joined(self, user_id: str, message: dict):
        """Handle call channel join notification"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_channel_joined",
                    "from": user_id,
                    "channelId": message.get('channelId'),
                    "userId": message.get('userId'),
                    "username": message.get('username')
                }))
                logger.info(f"Call channel join notification from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call channel join notification to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

    async def handle_call_channel_left(self, user_id: str, message: dict):
        """Handle call channel leave notification"""
        target_user_id = message.get('to')
        if target_user_id and target_user_id in self.user_connections:
            try:
                await self.user_connections[target_user_id].send_text(json.dumps({
                    "type": "call_channel_left",
                    "from": user_id,
                    "channelId": message.get('channelId'),
                    "userId": message.get('userId'),
                    "username": message.get('username')
                }))
                logger.info(f"Call channel leave notification from {user_id} to {target_user_id}")
            except Exception as e:
                logger.error(f"Error sending call channel leave notification to user {target_user_id}: {e}")
                self.disconnect(target_user_id)

# Global WebSocket manager instance
websocket_manager = WebSocketManager() 