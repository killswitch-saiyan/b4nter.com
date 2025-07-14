from supabase import create_client, Client
from config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase: Client = create_client(settings.supabase_url, settings.supabase_anon_key)


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
                '*, users(username, full_name, avatar_url)'
            ).eq('channel_id', channel_id).order('created_at', desc=False).limit(limit).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting channel messages: {e}")
            return []
    
    async def get_direct_messages(self, user1_id: str, user2_id: str, limit: int = 50):
        """Get direct messages between two users"""
        try:
            response = self.client.table('messages').select(
                '*, users(username, full_name, avatar_url)'
            ).or_(f'sender_id.eq.{user1_id},sender_id.eq.{user2_id}').and_(
                f'recipient_id.eq.{user1_id},recipient_id.eq.{user2_id}'
            ).order('created_at', desc=False).limit(limit).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting direct messages: {e}")
            return []
    
    async def get_all_users(self):
        """Get all users (for user search)"""
        try:
            response = self.client.table('users').select('id, username, full_name, avatar_url').execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting all users: {e}")
            return []


# Global database manager instance
db = DatabaseManager() 