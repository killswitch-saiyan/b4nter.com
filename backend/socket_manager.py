import socketio
from typing import Dict, List, Optional
from models import MessageResponse, UserResponse
from database import db
import logging
import re

logger = logging.getLogger(__name__)

# Create Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True
)

# Store connected users
connected_users: Dict[str, str] = {}  # user_id -> session_id

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

@sio.event
async def connect(sid, environ, auth):
    """Handle client connection"""
    try:
        logger.info(f"Connection attempt from {sid}")
        logger.info(f"Auth data: {auth}")
        
        # Extract user info from auth
        user_id = auth.get('user_id') if auth else None
        
        # Always allow connection for now (for testing)
        if user_id:
            connected_users[user_id] = sid
            await sio.emit('user_connected', {'user_id': user_id}, skip_sid=sid)
            logger.info(f"User {user_id} connected with session {sid}")
        else:
            logger.info(f"Anonymous user connected with session {sid}")
        
        return True
    except Exception as e:
        logger.error(f"Error in connect: {e}")
        return False


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    try:
        logger.info(f"Disconnection from {sid}")
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
        logger.info(f"Join channel request from {sid}: {data}")
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
        else:
            logger.warning(f"Missing channel_id or user_id in join_channel: {data}")
    except Exception as e:
        logger.error(f"Error in join_channel: {e}")


@sio.event
async def leave_channel(sid, data):
    """Handle user leaving a channel"""
    try:
        logger.info(f"Leave channel request from {sid}: {data}")
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
        else:
            logger.warning(f"Missing channel_id or user_id in leave_channel: {data}")
    except Exception as e:
        logger.error(f"Error in leave_channel: {e}")


@sio.event
async def send_message(sid, data):
    """Handle sending a message"""
    try:
        logger.info(f"Send message request from {sid}: {data}")
        content = data.get('content')
        sender_id = data.get('sender_id')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        
        if not content or not sender_id:
            logger.warning(f"Missing content or sender_id in send_message: {data}")
            return
        
        # Map channel_id string to UUID if needed
        if channel_id:
            channel_id = await get_channel_uuid(channel_id)
            if not channel_id:
                logger.error(f"Channel not found for id or name: {data.get('channel_id')}")
                await sio.emit('error', {'message': f"Channel not found: {data.get('channel_id')}"}, room=sid)
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
        
        logger.info(f"Message response prepared: {message_response}")
        
        # Emit message to appropriate recipients
        if channel_id:
            # Channel message
            await sio.emit('new_channel_message', message_response, room=f"channel_{channel_id}")
            logger.info(f"Message sent to channel {channel_id}")
        elif recipient_id:
            # Direct message
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('new_direct_message', message_response, room=recipient_sid)
            # Also send to sender (for confirmation)
            await sio.emit('new_direct_message', message_response, room=sid)
            logger.info(f"Direct message sent to user {recipient_id}")
        
        logger.info(f"Message sent by {sender_id} to {'channel ' + str(channel_id) if channel_id else 'user ' + str(recipient_id)}")
        
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

@sio.event
async def add_reaction(sid, data):
    """Handle adding a reaction to a message"""
    try:
        message_id = data.get('message_id')
        user_id = data.get('user_id')
        emoji = data.get('emoji')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        if not message_id or not user_id or not emoji:
            logger.warning(f"Missing data in add_reaction: {data}")
            return
        reaction = await db.add_reaction(message_id, user_id, emoji)
        # Get new count for this emoji on this message
        all_reactions = await db.get_reactions_for_message(message_id)
        emoji_count = sum(1 for r in all_reactions if r['emoji'] == emoji)
        payload = {
            'message_id': message_id,
            'emoji': emoji,
            'user_id': user_id,
            'action': 'add',
            'count': emoji_count
        }
        # Broadcast to channel or DM
        if channel_id:
            await sio.emit('reaction_update', payload, room=f"channel_{channel_id}")
        elif recipient_id:
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('reaction_update', payload, room=recipient_sid)
            await sio.emit('reaction_update', payload, room=sid)
    except Exception as e:
        logger.error(f"Error in add_reaction: {e}")

@sio.event
async def remove_reaction(sid, data):
    """Handle removing a reaction from a message"""
    try:
        message_id = data.get('message_id')
        user_id = data.get('user_id')
        emoji = data.get('emoji')
        channel_id = data.get('channel_id')
        recipient_id = data.get('recipient_id')
        if not message_id or not user_id or not emoji:
            logger.warning(f"Missing data in remove_reaction: {data}")
            return
        await db.remove_reaction(message_id, user_id, emoji)
        # Get new count for this emoji on this message
        all_reactions = await db.get_reactions_for_message(message_id)
        emoji_count = sum(1 for r in all_reactions if r['emoji'] == emoji)
        payload = {
            'message_id': message_id,
            'emoji': emoji,
            'user_id': user_id,
            'action': 'remove',
            'count': emoji_count
        }
        # Broadcast to channel or DM
        if channel_id:
            await sio.emit('reaction_update', payload, room=f"channel_{channel_id}")
        elif recipient_id:
            recipient_sid = connected_users.get(recipient_id)
            if recipient_sid:
                await sio.emit('reaction_update', payload, room=recipient_sid)
            await sio.emit('reaction_update', payload, room=sid)
    except Exception as e:
        logger.error(f"Error in remove_reaction: {e}") 