from supabase.client import create_client, Client
from config import settings
from typing import Optional
import logging
import asyncio
from functools import wraps
import concurrent.futures

logger = logging.getLogger(__name__)

# Initialize Supabase client with service role key for backend operations
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

# Thread pool for running synchronous Supabase operations
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=10)

def run_sync_in_thread(func, *args, **kwargs):
    """Run a synchronous function in a thread pool"""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(thread_pool, lambda: func(*args, **kwargs))

def with_timeout(timeout_seconds=10):
    """Decorator to add timeout to database operations"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                # Run the database operation with timeout
                return await asyncio.wait_for(func(*args, **kwargs), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                logger.error(f"Database operation timed out after {timeout_seconds} seconds: {func.__name__}")
                return None
            except Exception as e:
                logger.error(f"Database operation failed: {func.__name__} - {e}")
                return None
        return wrapper
    return decorator


class DatabaseManager:
    def __init__(self):
        self.client = supabase
    
    async def get_user_by_email(self, email: str):
        """Get user by email"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('users').select('*').eq('email', email).execute()
            )
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting user by email: {e}")
            return None
    
    async def get_user_by_username(self, username: str):
        """Get user by username"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('users').select('*').eq('username', username).execute()
            )
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting user by username: {e}")
            return None
    
    async def get_user_by_id(self, user_id: str):
        """Get user by ID"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('users').select('*').eq('id', user_id).execute()
            )
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
    
    async def update_channel(self, channel_id: str, update_data: dict):
        """Update a channel"""
        try:
            response = self.client.table('channels').update(update_data).eq('id', channel_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating channel: {e}")
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
    
    @with_timeout(8)
    async def get_channel_messages(self, channel_id: str, limit: int = 50):
        """Get messages for a channel"""
        try:
            # Special handling for call channels - they don't exist in the database
            if channel_id.startswith('call-'):
                logger.info(f"Call channel detected: {channel_id}, returning empty messages")
                return []
            
            response = await run_sync_in_thread(
                lambda: self.client.table('messages').select(
                    '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
                ).eq('channel_id', channel_id).order('created_at', desc=False).limit(limit).execute()
            )
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error getting channel messages: {e}")
            return []
    
    @with_timeout(10)
    async def get_direct_messages(self, user1_id: str, user2_id: str, limit: int = 50):
        """Get direct messages between two users"""
        try:
            # Create queries for both directions
            query1 = self.client.table('messages').select(
                '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
            ).eq('sender_id', user1_id).eq('recipient_id', user2_id).order('created_at', desc=False).limit(limit)
            
            query2 = self.client.table('messages').select(
                '*, users:users!messages_sender_id_fkey(username, full_name, avatar_url)'
            ).eq('sender_id', user2_id).eq('recipient_id', user1_id).order('created_at', desc=False).limit(limit)
            
            # Run both queries concurrently
            resp1, resp2 = await asyncio.gather(
                run_sync_in_thread(lambda: query1.execute()),
                run_sync_in_thread(lambda: query2.execute())
            )
            
            # Combine and sort messages
            messages = (resp1.data or []) + (resp2.data or [])
            messages.sort(key=lambda m: m['created_at'])
            
            # Limit to the most recent messages
            if len(messages) > limit:
                messages = messages[-limit:]
            
            return messages
        except Exception as e:
            logger.error(f"Error getting direct messages: {e}")
            return []
    
    async def get_all_users(self):
        """Get all users (for user search)"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('users').select('*').execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Error getting all users: {e}")
            return []

    async def block_user(self, blocker_id: str, blocked_id: str):
        """Block a user"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('user_blocks').insert({
                    'blocker_id': blocker_id,
                    'blocked_id': blocked_id
                }).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error blocking user: {e}")
            return None

    async def unblock_user(self, blocker_id: str, blocked_id: str):
        """Unblock a user"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('user_blocks').delete().eq('blocker_id', blocker_id).eq('blocked_id', blocked_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error unblocking user: {e}")
            return None

    async def get_blocked_users(self, user_id: str):
        """Get list of users blocked by a user"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('user_blocks').select('blocked_id').eq('blocker_id', user_id).execute()
            )
            return [block['blocked_id'] for block in response.data]
        except Exception as e:
            logger.error(f"Error getting blocked users: {e}")
            return []

    async def is_user_blocked(self, blocker_id: str, blocked_id: str):
        """Check if a user is blocked by another user"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('user_blocks').select('id').eq('blocker_id', blocker_id).eq('blocked_id', blocked_id).execute()
            )
            return len(response.data) > 0
        except Exception as e:
            logger.error(f"Error checking if user is blocked: {e}")
            return False

    async def get_users_for_dm_filtered(self, user_id: str):
        """Get all users for DM, including blocked users with blocking status"""
        try:
            # Get all users
            all_users = await self.get_all_users()
            if not all_users:
                return []
            
            # Get blocked users
            blocked_users = await self.get_blocked_users(user_id)
            
            # Return all users except current user, with blocking status
            filtered_users = []
            for user in all_users:
                if user['id'] != user_id:
                    user_with_status = {
                        **user,
                        'is_blocked': user['id'] in blocked_users
                    }
                    filtered_users.append(user_with_status)
            
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

    async def update_user_public_key(self, user_id: str, public_key: str):
        """Update user's public key for E2EE"""
        try:
            response = self.client.table('users').update({
                'public_key': public_key,
                'updated_at': 'now()'
            }).eq('id', user_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating user public key: {e}")
            return None

    async def get_user_public_key(self, user_id: str):
        """Get user's public key for E2EE"""
        try:
            response = self.client.table('users').select('public_key').eq('id', user_id).execute()
            if response.data:
                return response.data[0].get('public_key')
            return None
        except Exception as e:
            logger.error(f"Error getting user public key: {e}")
            return None

    async def delete_channel(self, channel_id: str):
        """Delete a channel and all its associated data (cascade delete)"""
        try:
            # Delete the channel - this should cascade delete members and messages
            response = self.client.table('channels').delete().eq('id', channel_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error deleting channel: {e}")
            return None

    async def get_all_channels(self):
        """Get all channels"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('channels').select('*').execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Error getting all channels: {e}")
            return []

    # Groups and Match Channels methods
    async def create_group(self, group_data: dict):
        """Create a new group/league"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('groups').insert(group_data).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating group: {e}")
            return None

    async def get_groups(self, active_only: bool = True):
        """Get all groups/leagues"""
        try:
            query = self.client.table('groups').select('*')
            if active_only:
                query = query.eq('is_active', True)
            
            response = await run_sync_in_thread(lambda: query.execute())
            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error getting groups: {e}")
            return []

    async def get_group_by_id(self, group_id: str):
        """Get group by ID"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('groups').select('*').eq('id', group_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting group by ID: {e}")
            return None

    async def update_group(self, group_id: str, update_data: dict):
        """Update a group"""
        try:
            update_data['updated_at'] = 'now()'
            response = await run_sync_in_thread(
                lambda: self.client.table('groups').update(update_data).eq('id', group_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error updating group: {e}")
            return None

    async def create_match_channel(self, match_data: dict):
        """Create a new match channel record"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').insert(match_data).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error creating match channel: {e}")
            return None

    async def get_today_match_channels(self, group_id: str = None):
        """Get today's match channels, optionally filtered by group"""
        try:
            from datetime import date
            today = date.today().isoformat()
            
            query = self.client.table('match_channels').select('''
                id, channel_id, group_id, match_date, home_team, away_team, match_time, 
                sportsdb_event_id, auto_delete_at,
                groups!match_channels_group_id_fkey(name),
                channels!match_channels_channel_id_fkey(name, description, created_at),
                live_match_data!match_channels_id_fkey(home_score, away_score, match_status, match_minute)
            ''').eq('match_date', today)
            
            if group_id:
                query = query.eq('group_id', group_id)
            
            response = await run_sync_in_thread(lambda: query.execute())
            
            # Format the response to flatten nested data
            formatted_matches = []
            for match in response.data or []:
                group_data = match.get('groups', {})
                channel_data = match.get('channels', {})
                live_data = match.get('live_match_data', [{}])[0] if match.get('live_match_data') else {}
                
                formatted_match = {
                    **match,
                    'group_name': group_data.get('name', 'Unknown League'),
                    'channel_name': channel_data.get('name', 'Unknown Channel'),
                    'home_score': live_data.get('home_score', 0),
                    'away_score': live_data.get('away_score', 0),
                    'match_status': live_data.get('match_status', 'scheduled'),
                    'match_minute': live_data.get('match_minute')
                }
                # Remove nested objects
                formatted_match.pop('groups', None)
                formatted_match.pop('channels', None)
                formatted_match.pop('live_match_data', None)
                formatted_matches.append(formatted_match)
            
            return formatted_matches
        except Exception as e:
            logger.error(f"Error getting today's match channels: {e}")
            return []

    async def get_group_channels(self, group_id: str):
        """Get all channels for a group (including match channels)"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').select('''
                    id, channel_id, match_date, home_team, away_team, match_time,
                    channels!match_channels_channel_id_fkey(id, name, description, created_at),
                    live_match_data!match_channels_id_fkey(home_score, away_score, match_status, match_minute)
                ''').eq('group_id', group_id).order('match_date', desc=True).execute()
            )
            
            # Format the response
            channels = []
            for match in response.data or []:
                channel_data = match.get('channels', {})
                live_data = match.get('live_match_data', [{}])[0] if match.get('live_match_data') else {}
                
                channel = {
                    'match_channel_id': match['id'],
                    'channel_id': match['channel_id'],
                    'name': f"{match['home_team']} vs {match['away_team']}",
                    'match_date': match['match_date'],
                    'match_time': match['match_time'],
                    'home_team': match['home_team'],
                    'away_team': match['away_team'],
                    'home_score': live_data.get('home_score', 0),
                    'away_score': live_data.get('away_score', 0),
                    'match_status': live_data.get('match_status', 'scheduled'),
                    'match_minute': live_data.get('match_minute'),
                    'is_match_channel': True
                }
                channels.append(channel)
            
            return channels
        except Exception as e:
            logger.error(f"Error getting group channels: {e}")
            return []

    async def get_match_channel_by_id(self, match_channel_id: str):
        """Get match channel by ID"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').select('*').eq('id', match_channel_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting match channel by ID: {e}")
            return None

    async def get_match_channel_with_scores(self, match_channel_id: str):
        """Get match channel with live score data"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').select('''
                    *, 
                    groups!match_channels_group_id_fkey(name),
                    live_match_data!match_channels_id_fkey(home_score, away_score, match_status, match_minute, last_updated)
                ''').eq('id', match_channel_id).execute()
            )
            
            if not response.data:
                return None
                
            match = response.data[0]
            group_data = match.get('groups', {})
            live_data = match.get('live_match_data', [{}])[0] if match.get('live_match_data') else {}
            
            return {
                **match,
                'group_name': group_data.get('name', 'Unknown League'),
                'home_score': live_data.get('home_score', 0),
                'away_score': live_data.get('away_score', 0),
                'match_status': live_data.get('match_status', 'scheduled'),
                'match_minute': live_data.get('match_minute'),
                'last_updated': live_data.get('last_updated')
            }
        except Exception as e:
            logger.error(f"Error getting match channel with scores: {e}")
            return None

    async def update_live_scores(self, match_channel_id: str, score_data: dict):
        """Update or insert live score data for a match"""
        try:
            # First try to update existing record
            update_response = await run_sync_in_thread(
                lambda: self.client.table('live_match_data')
                .update({**score_data, 'last_updated': 'now()'})
                .eq('match_channel_id', match_channel_id)
                .execute()
            )
            
            # If no rows were affected, insert new record
            if not update_response.data:
                insert_response = await run_sync_in_thread(
                    lambda: self.client.table('live_match_data')
                    .insert({**score_data, 'match_channel_id': match_channel_id})
                    .execute()
                )
                return insert_response.data[0] if insert_response.data else None
            
            return update_response.data[0]
        except Exception as e:
            logger.error(f"Error updating live scores: {e}")
            return None

    async def get_live_matches(self):
        """Get all currently live matches"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('live_match_data').select('''
                    *, 
                    match_channels!live_match_data_match_channel_id_fkey(
                        id, channel_id, home_team, away_team, match_date, match_time,
                        groups!match_channels_group_id_fkey(name)
                    )
                ''').eq('match_status', 'live').execute()
            )
            
            # Format response
            live_matches = []
            for live_data in response.data or []:
                match_data = live_data.get('match_channels', {})
                group_data = match_data.get('groups', {}) if match_data else {}
                
                live_matches.append({
                    'match_channel_id': live_data['match_channel_id'],
                    'channel_id': match_data.get('channel_id'),
                    'home_team': match_data.get('home_team'),
                    'away_team': match_data.get('away_team'),
                    'home_score': live_data['home_score'],
                    'away_score': live_data['away_score'],
                    'match_status': live_data['match_status'],
                    'match_minute': live_data['match_minute'],
                    'group_name': group_data.get('name', 'Unknown League'),
                    'match_date': match_data.get('match_date'),
                    'last_updated': live_data['last_updated']
                })
            
            return live_matches
        except Exception as e:
            logger.error(f"Error getting live matches: {e}")
            return []

    async def get_match_channels_by_date(self, match_date):
        """Get match channels for a specific date"""
        try:
            date_str = match_date.isoformat() if hasattr(match_date, 'isoformat') else str(match_date)
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').select('''
                    id, channel_id, group_id, match_date, home_team, away_team, match_time,
                    groups!match_channels_group_id_fkey(name),
                    live_match_data!match_channels_id_fkey(home_score, away_score, match_status, match_minute)
                ''').eq('match_date', date_str).execute()
            )
            
            # Format response
            matches = []
            for match in response.data or []:
                group_data = match.get('groups', {})
                live_data = match.get('live_match_data', [{}])[0] if match.get('live_match_data') else {}
                
                matches.append({
                    **match,
                    'group_name': group_data.get('name', 'Unknown League'),
                    'home_score': live_data.get('home_score', 0),
                    'away_score': live_data.get('away_score', 0),
                    'match_status': live_data.get('match_status', 'scheduled'),
                    'match_minute': live_data.get('match_minute')
                })
            
            return matches
        except Exception as e:
            logger.error(f"Error getting match channels by date: {e}")
            return []

    async def cleanup_expired_match_channels(self):
        """Delete expired match channels and their associated data"""
        try:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            
            # Get expired channels
            expired_response = await run_sync_in_thread(
                lambda: self.client.table('match_channels')
                .select('id, channel_id')
                .lte('auto_delete_at', now)
                .execute()
            )
            
            deleted_count = 0
            for expired_match in expired_response.data or []:
                # Delete the actual channel (cascade will handle match_channels and live_match_data)
                await self.delete_channel(expired_match['channel_id'])
                deleted_count += 1
            
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up expired match channels: {e}")
            return 0

    async def get_match_channel_by_sportsdb_id(self, sportsdb_event_id: str):
        """Get match channel by SportsDB event ID"""
        try:
            response = await run_sync_in_thread(
                lambda: self.client.table('match_channels').select('*').eq('sportsdb_event_id', sportsdb_event_id).execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.error(f"Error getting match channel by SportsDB ID: {e}")
            return None


# Global database manager instance
db = DatabaseManager() 