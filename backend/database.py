from supabase import create_client, Client
from config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Initialize Supabase client with service role key for backend operations
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)


class DatabaseManager:
    def __init__(self):
        self.client = supabase
    
    async def get_user_by_email(self, email: str):
        """Get user by email"""
        try:
            response = self.client.table('users').select('*').eq('email', email).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting user by email: {e}")
            return None
    
    async def get_user_by_id(self, user_id: str):
        """Get user by ID"""
        try:
            response = self.client.table('users').select('*').eq('id', user_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting user by ID: {e}")
            return None
    
    async def create_user(self, user_data: dict):
        """Create a new user"""
        try:
            response = self.client.table('users').insert(user_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None
    
    async def update_user(self, user_id: str, update_data: dict):
        """Update user data"""
        try:
            response = self.client.table('users').update(update_data).eq('id', user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating user: {e}")
            return None
    
    async def create_channel(self, channel_data: dict):
        """Create a new channel"""
        try:
            response = self.client.table('channels').insert(channel_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating channel: {e}")
            return None
    
    async def get_channel_by_id(self, channel_id: str):
        """Get channel by ID"""
        try:
            response = self.client.table('channels').select('*').eq('id', channel_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting channel by ID: {e}")
            return None
    
    async def get_channel_by_name(self, name: str):
        """Get channel by name"""
        try:
            response = self.client.table('channels').select('*').eq('name', name).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting channel by name: {e}")
            return None
    
    async def get_user_channels(self, user_id: str):
        """Get all channels a user is a member of"""
        try:
            response = self.client.table('channel_members').select(
                'channel_id, channels(*)'
            ).eq('user_id', user_id).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting user channels: {e}")
            return []
    
    async def add_channel_member(self, member_data: dict):
        """Add a user to a channel"""
        try:
            response = self.client.table('channel_members').insert(member_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error adding channel member: {e}")
            return None
    
    async def get_channel_members(self, channel_id: str):
        """Get all members of a channel"""
        try:
            response = self.client.table('channel_members').select(
                'user_id, users(*)'
            ).eq('channel_id', channel_id).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting channel members: {e}")
            return []
    
    async def create_message(self, message_data: dict):
        """Create a new message"""
        try:
            response = self.client.table('messages').insert(message_data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating message: {e}")
            return None
    
    async def get_channel_messages(self, channel_id: str, limit: int = 50):
        """Get messages for a channel"""
        try:
            response = self.client.table('messages').select(
                '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
            ).eq('channel_id', channel_id).order('created_at', desc=False).limit(limit).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting channel messages: {e}")
            return []
    
    async def get_direct_messages(self, user1_id: str, user2_id: str, limit: int = 50):
        """Get direct messages between two users"""
        try:
            # Fetch messages sent from user1 to user2
            resp1 = self.client.table('messages').select(
                '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
            ).eq('sender_id', user1_id).eq('recipient_id', user2_id).order('created_at', desc=False).limit(limit).execute()
            # Fetch messages sent from user2 to user1
            resp2 = self.client.table('messages').select(
                '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
            ).eq('sender_id', user2_id).eq('recipient_id', user1_id).order('created_at', desc=False).limit(limit).execute()
            messages = (resp1.data or []) + (resp2.data or [])
            # Sort all messages by created_at ascending
            messages.sort(key=lambda m: m['created_at'])
            # Optionally, limit to the most recent 'limit' messages
            if len(messages) > limit:
                messages = messages[-limit:]
            return messages
        except Exception as e:
            logger.error(f"Error getting direct messages: {e}")
            return []
    
    async def get_all_users(self):
        """Get all users (for user search)"""
        try:
            response = self.client.table('users').select('*').execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting all users: {e}")
            return []

    async def block_user(self, blocker_id: str, blocked_id: str):
        """Block a user"""
        try:
            response = self.client.table('user_blocks').insert({
                'blocker_id': blocker_id,
                'blocked_id': blocked_id
            }).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error blocking user: {e}")
            return None

    async def unblock_user(self, blocker_id: str, blocked_id: str):
        """Unblock a user"""
        try:
            response = self.client.table('user_blocks').delete().eq('blocker_id', blocker_id).eq('blocked_id', blocked_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error unblocking user: {e}")
            return None

    async def get_blocked_users(self, user_id: str):
        """Get list of users blocked by a user"""
        try:
            response = self.client.table('user_blocks').select('blocked_id').eq('blocker_id', user_id).execute()
            return [block['blocked_id'] for block in response.data]
        except Exception as e:
            logger.error(f"Error getting blocked users: {e}")
            return []

    async def is_user_blocked(self, blocker_id: str, blocked_id: str):
        """Check if a user is blocked by another user"""
        try:
            response = self.client.table('user_blocks').select('id').eq('blocker_id', blocker_id).eq('blocked_id', blocked_id).execute()
            return len(response.data) > 0
        except Exception as e:
            logger.error(f"Error checking if user is blocked: {e}")
            return False

    async def get_users_for_dm_filtered(self, user_id: str):
        """Get all users for DM, excluding blocked users"""
        try:
            # Get all users
            all_users = await self.get_all_users()
            if not all_users:
                return []
            
            # Get blocked users
            blocked_users = await self.get_blocked_users(user_id)
            
            # Filter out current user and blocked users
            filtered_users = [
                user for user in all_users 
                if user['id'] != user_id and user['id'] not in blocked_users
            ]
            
            return filtered_users
        except Exception as e:
            logger.error(f"Error getting filtered users for DM: {e}")
            return []

    async def add_reaction(self, message_id: str, user_id: str, emoji: str):
        """Add a reaction to a message"""
        try:
            logger.info(f"Attempting to add reaction: message_id={message_id}, user_id={user_id}, emoji={emoji}")
            response = self.client.table('message_reactions').insert({
                'message_id': message_id,
                'user_id': user_id,
                'emoji': emoji
            }).execute()
            logger.info(f"add_reaction response: {response.data}")
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error adding reaction: {e}")
            return None

    async def remove_reaction(self, message_id: str, user_id: str, emoji: str):
        """Remove a reaction from a message"""
        try:
            response = self.client.table('message_reactions').delete()\
                .eq('message_id', message_id)\
                .eq('user_id', user_id)\
                .eq('emoji', emoji).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error removing reaction: {e}")
            return None

    async def get_reactions_for_message(self, message_id: str):
        """Get all reactions for a message"""
        try:
            response = self.client.table('message_reactions').select('*').eq('message_id', message_id).execute()
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error getting reactions for message: {e}")
            return []

    async def get_reactions_for_messages(self, message_ids: list):
        """Batch fetch all reactions for a list of message IDs"""
        if not message_ids:
            return {}
        try:
            response = self.client.table('message_reactions').select('*').in_('message_id', message_ids).execute()
            reactions_by_message = {}
            for reaction in response.data or []:
                mid = reaction['message_id']
                if mid not in reactions_by_message:
                    reactions_by_message[mid] = []
                reactions_by_message[mid].append(reaction)
            return reactions_by_message
        except Exception as e:
            logger.error(f"Error batch fetching reactions: {e}")
            return {}


# Global database manager instance
db = DatabaseManager() 