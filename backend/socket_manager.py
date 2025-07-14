import socketio
from typing import Dict, List, Optional
from models import MessageResponse, UserResponse
from database import db
import logging

logger = logging.getLogger(__name__)

# Create Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*"
)

# Store connected users
connected_users: Dict[str, str] = {}  # user_id -> session_id


@sio.event
async def connect(sid, environ, auth):
    """Handle client connection"""
    try:
        # Extract user info from auth (you'll need to implement this)
        user_id = auth.get('user_id') if auth else None
        if user_id:
            connected_users[user_id] = sid
            await sio.emit('user_connected', {'user_id': user_id}, skip_sid=sid)
            logger.info(f"User {user_id} connected with session {sid}")
        else:
            # Reject connection if no valid auth
            return False
    except Exception as e:
        logger.error(f"Error in connect: {e}")
        return False


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    try:
        # Find user by session ID
        user_id = None
        for uid, session_id in connected_users.items():
            if session_id == sid:
                user_id = uid
                break
        
        if user_id:
            del connected_users[user_id]
            await sio.emit('user_disconnected', {'user_id': user_id}, skip_sid=sid)
            logger.info(f"User {user_id} disconnected")
    except Exception as e:
        logger.error(f"Error in disconnect: {e}")


@sio.event
async def join_channel(sid, data):
    """Handle user joining a channel"""
    try:
        channel_id = data.get('channel_id')
        user_id = data.get('user_id')
        
        if channel_id and user_id:
            # Join the channel room
            await sio.enter_room(sid, f"channel_{channel_id}")
            await sio.emit('user_joined_channel', {
                'user_id': user_id,
                'channel_id': channel_id
            }, room=f"channel_{channel_id}")
            logger.info(f"User {user_id} joined channel {channel_id}")
    except Exception as e:
        logger.error(f"Error in join_channel: {e}")


@sio.event
async def leave_channel(sid, data):
    """Handle user leaving a channel"""
    try:
        channel_id = data.get('channel_id')
        user_id = data.get('user_id')
        
        if channel_id and user_id:
            # Leave the channel room
            await sio.leave_room(sid, f"channel_{channel_id}")
            await sio.emit('user_left_channel', {
                'user_id': user_id,
                'channel_id': channel_id
            }, room=f"channel_{channel_id}")
            logger.info(f"User {user_id} left channel {channel_id}")
    except Exception as e:
        logger.error(f"Error in leave_channel: {e}")


@sio.event
async def send_message(sid, data):
    """Handle sending a message"""
    try:
        content = data.get('content')
        sender_id = data.get('sender_id')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        
        if not content or not sender_id:
            return
        
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
            return
        
        # Get sender info
        sender = await db.get_user_by_id(sender_id)
        if not sender:
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
        
        # Emit message to appropriate recipients
        if channel_id:
            # Channel message
            await sio.emit('new_channel_message', message_response, room=f"channel_{channel_id}")
        elif recipient_id:
            # Direct message
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('new_direct_message', message_response, room=recipient_sid)
            # Also send to sender (for confirmation)
            await sio.emit('new_direct_message', message_response, room=sid)
        
        logger.info(f"Message sent by {sender_id} to {'channel ' + channel_id if channel_id else 'user ' + recipient_id}")
        
    except Exception as e:
        logger.error(f"Error in send_message: {e}")


@sio.event
async def typing_start(sid, data):
    """Handle typing indicator start"""
    try:
        user_id = data.get('user_id')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        
        if channel_id:
            await sio.emit('user_typing', {
                'user_id': user_id,
                'channel_id': channel_id
            }, room=f"channel_{channel_id}", skip_sid=sid)
        elif recipient_id:
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('user_typing', {
                    'user_id': user_id,
                    'recipient_id': recipient_id
                }, room=recipient_sid)
    except Exception as e:
        logger.error(f"Error in typing_start: {e}")


@sio.event
async def typing_stop(sid, data):
    """Handle typing indicator stop"""
    try:
        user_id = data.get('user_id')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        
        if channel_id:
            await sio.emit('user_stopped_typing', {
                'user_id': user_id,
                'channel_id': channel_id
            }, room=f"channel_{channel_id}", skip_sid=sid)
        elif recipient_id:
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('user_stopped_typing', {
                    'user_id': user_id,
                    'recipient_id': recipient_id
                }, room=recipient_sid)
    except Exception as e:
        logger.error(f"Error in typing_stop: {e}")


async def broadcast_user_status(user_id: str, status: str):
    """Broadcast user status change"""
    try:
        await sio.emit('user_status_change', {
            'user_id': user_id,
            'status': status
        })
    except Exception as e:
        logger.error(f"Error broadcasting user status: {e}")


async def send_notification_to_user(user_id: str, notification: dict):
    """Send notification to specific user"""
    try:
        user_sid = connected_users.get(user_id)
        if user_sid:
            await sio.emit('notification', notification, room=user_sid)
    except Exception as e:
        logger.error(f"Error sending notification: {e}")


def get_connected_users() -> List[str]:
    """Get list of connected user IDs"""
    return list(connected_users.keys())


def is_user_connected(user_id: str) -> bool:
    """Check if user is connected"""
    return user_id in connected_users 