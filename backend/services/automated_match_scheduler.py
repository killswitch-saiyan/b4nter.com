import asyncio
import logging
from datetime import date, datetime, time, timedelta
from typing import List, Dict, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import aiohttp
import json

from database import db, run_sync_in_thread
from services.widget_service import widget_service
from services.reliable_sports_api import reliable_sports_api

logger = logging.getLogger(__name__)

class AutomatedMatchScheduler:
    """Automated scheduler for daily match channel creation and archival"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.supported_leagues = {
            'premier_league': {
                'api_id': '4328',  # SportsDB ID
                'name': 'Premier League',
                'group_name': 'English Premier League',
                'country': 'England'
            },
            'la_liga': {
                'api_id': '4335',  # SportsDB ID
                'name': 'La Liga', 
                'group_name': 'Spanish La Liga',
                'country': 'Spain'
            },
            'bundesliga': {
                'api_id': '4331',  # SportsDB ID
                'name': 'Bundesliga',
                'group_name': 'German Bundesliga',
                'country': 'Germany'
            },
            'serie_a': {
                'api_id': '4332',  # SportsDB ID
                'name': 'Serie A',
                'group_name': 'Italian Serie A',
                'country': 'Italy'
            },
            'ligue_1': {
                'api_id': '4334',  # SportsDB ID
                'name': 'Ligue 1',
                'group_name': 'French Ligue 1',
                'country': 'France'
            },
            'champions_league': {
                'api_id': '4480',  # SportsDB ID
                'name': 'Champions League',
                'group_name': 'UEFA Champions League',
                'country': 'Europe'
            }
        }
        
    def start_scheduler(self):
        """Start the automated scheduler"""
        try:
            # Schedule daily match creation at 12:00 AM
            self.scheduler.add_job(
                func=self.create_daily_matches,
                trigger=CronTrigger(hour=0, minute=0),  # 12:00 AM
                id='create_daily_matches',
                name='Create Daily Match Channels',
                replace_existing=True
            )
            
            # Schedule daily match archival at 11:59 PM
            self.scheduler.add_job(
                func=self.archive_daily_matches,
                trigger=CronTrigger(hour=23, minute=59),  # 11:59 PM
                id='archive_daily_matches',
                name='Archive Daily Match Channels',
                replace_existing=True
            )
            
            # Schedule live score updates every 5 minutes during match hours
            self.scheduler.add_job(
                func=self.update_live_scores,
                trigger=CronTrigger(minute='*/5'),  # Every 5 minutes
                id='update_live_scores',
                name='Update Live Scores',
                replace_existing=True
            )
            
            self.scheduler.start()
            logger.info("Automated match scheduler started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
    
    def stop_scheduler(self):
        """Stop the automated scheduler"""
        try:
            if self.scheduler.running:
                self.scheduler.shutdown()
                logger.info("Automated match scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")
    
    async def create_daily_matches(self):
        """Daily job to create match channels for today's fixtures"""
        today = date.today().isoformat()
        logger.info(f"Starting daily match channel creation for {today}")
        
        total_created = 0
        errors = []
        
        try:
            for league_key, league_info in self.supported_leagues.items():
                try:
                    # Fetch real fixtures from reliable sources
                    fixtures = await reliable_sports_api.get_reliable_fixtures(league_key, today)
                    
                    if not fixtures:
                        logger.info(f"No fixtures found for {league_info['name']} on {today}")
                        continue
                    
                    # Get or create league group
                    league_group = await self._get_or_create_league_group(league_info)
                    if not league_group:
                        errors.append(f"Failed to create group for {league_info['name']}")
                        continue
                    
                    # Create channels for each fixture
                    for fixture in fixtures:
                        try:
                            result = await self._create_match_channel_from_fixture(
                                fixture, league_group, today
                            )
                            if result['success']:
                                total_created += 1
                                logger.info(f"Created: {fixture['home_team']} vs {fixture['away_team']}")
                            else:
                                errors.append(f"{fixture['home_team']} vs {fixture['away_team']}: {result['error']}")
                        except Exception as e:
                            errors.append(f"{fixture['home_team']} vs {fixture['away_team']}: {e}")
                
                except Exception as e:
                    logger.error(f"Error processing {league_info['name']}: {e}")
                    errors.append(f"{league_info['name']}: {e}")
            
            logger.info(f"Daily creation complete: {total_created} channels created")
            if errors:
                logger.warning(f"Errors during creation: {errors}")
                
        except Exception as e:
            logger.error(f"Critical error in create_daily_matches: {e}")
    
    async def archive_daily_matches(self):
        """Daily job to archive today's match channels"""
        today = date.today().isoformat()
        logger.info(f"Starting daily match channel archival for {today}")
        
        total_archived = 0
        errors = []
        
        try:
            # Get all match channels for today
            match_channels = await run_sync_in_thread(
                lambda: db.client.table('match_channels')
                .select('id, channel_id, home_team, away_team')
                .eq('match_date', today)
                .execute()
            )
            
            for match in match_channels.data or []:
                try:
                    # Remove channel members first
                    if match.get('channel_id'):
                        await run_sync_in_thread(
                            lambda c=match['channel_id']: db.client.table('channel_members')
                            .delete()
                            .eq('channel_id', c)
                            .execute()
                        )
                    
                    # Remove live match data
                    await run_sync_in_thread(
                        lambda m=match['id']: db.client.table('live_match_data')
                        .delete()
                        .eq('match_channel_id', m)
                        .execute()
                    )
                    
                    # Delete the chat channel
                    if match.get('channel_id'):
                        await run_sync_in_thread(
                            lambda c=match['channel_id']: db.client.table('channels')
                            .delete()
                            .eq('id', c)
                            .execute()
                        )
                    
                    # Delete the match channel
                    await run_sync_in_thread(
                        lambda m=match['id']: db.client.table('match_channels')
                        .delete()
                        .eq('id', m)
                        .execute()
                    )
                    
                    total_archived += 1
                    logger.info(f"Archived: {match['home_team']} vs {match['away_team']}")
                    
                except Exception as e:
                    error_msg = f"{match['home_team']} vs {match['away_team']}: {e}"
                    errors.append(error_msg)
                    logger.error(f"Error archiving: {error_msg}")
            
            logger.info(f"Daily archival complete: {total_archived} channels archived")
            if errors:
                logger.warning(f"Errors during archival: {errors}")
                
        except Exception as e:
            logger.error(f"Critical error in archive_daily_matches: {e}")
    
    async def update_live_scores(self):
        """Regular job to update live scores for ongoing matches"""
        try:
            today = date.today().isoformat()
            
            # Get all live matches for today
            live_matches = await run_sync_in_thread(
                lambda: db.client.table('live_match_data')
                .select('*, match_channels(home_team, away_team, group_id)')
                .eq('match_channels.match_date', today)
                .eq('match_status', 'live')
                .execute()
            )
            
            updates_made = 0
            for match in live_matches.data or []:
                try:
                    # Fetch updated score from API
                    updated_data = await self._fetch_live_score_update(match)
                    if updated_data:
                        await run_sync_in_thread(
                            lambda: db.client.table('live_match_data')
                            .update(updated_data)
                            .eq('match_channel_id', match['match_channel_id'])
                            .execute()
                        )
                        updates_made += 1
                        
                except Exception as e:
                    logger.error(f"Error updating live score: {e}")
            
            if updates_made > 0:
                logger.info(f"Updated {updates_made} live scores")
                
        except Exception as e:
            logger.error(f"Error in update_live_scores: {e}")
    
    async def _fetch_league_fixtures(self, league_id: str, target_date: str) -> List[Dict]:
        """Fetch real fixtures from SportsDB API"""
        try:
            async with aiohttp.ClientSession() as session:
                # Try multiple API endpoints for fixtures
                urls = [
                    f"https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d={target_date}&l={league_id}",
                    f"https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id={league_id}",
                    f"https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id={league_id}&r=1"
                ]
                
                for url in urls:
                    try:
                        async with session.get(url, timeout=10) as response:
                            if response.status == 200:
                                data = await response.json()
                                
                                events = data.get('events', [])
                                if not events:
                                    continue
                                
                                fixtures = []
                                for event in events:
                                    # Filter for target date
                                    event_date = event.get('dateEvent', '')
                                    if event_date == target_date:
                                        fixture = self._parse_sportsdb_event(event)
                                        if fixture:
                                            fixtures.append(fixture)
                                
                                if fixtures:
                                    logger.info(f"Found {len(fixtures)} fixtures for league {league_id}")
                                    return fixtures
                                    
                    except Exception as e:
                        logger.warning(f"API call failed for {url}: {e}")
                        continue
                
                logger.info(f"No fixtures found for league {league_id} on {target_date}")
                return []
                
        except Exception as e:
            logger.error(f"Error fetching fixtures for league {league_id}: {e}")
            return []
    
    def _parse_sportsdb_event(self, event: Dict) -> Optional[Dict]:
        """Parse SportsDB event into fixture format"""
        try:
            return {
                'home_team': event.get('strHomeTeam', ''),
                'away_team': event.get('strAwayTeam', ''),
                'match_time': event.get('strTime', '00:00:00'),
                'venue': event.get('strVenue', ''),
                'home_score': int(event.get('intHomeScore', 0)) if event.get('intHomeScore') else 0,
                'away_score': int(event.get('intAwayScore', 0)) if event.get('intAwayScore') else 0,
                'match_status': self._parse_match_status(event.get('strStatus', '')),
                'match_minute': event.get('strProgress', ''),
                'sportsdb_event_id': event.get('idEvent', '')
            }
        except Exception as e:
            logger.error(f"Error parsing SportsDB event: {e}")
            return None
    
    def _parse_match_status(self, status: str) -> str:
        """Convert SportsDB status to our format"""
        status_map = {
            'Match Finished': 'finished',
            'FT': 'finished',
            'Not Started': 'scheduled',
            'NS': 'scheduled',
            'Live': 'live',
            'HT': 'live',
            'Postponed': 'postponed',
            'Cancelled': 'cancelled'
        }
        return status_map.get(status, 'scheduled')
    
    async def _fetch_live_score_update(self, match: Dict) -> Optional[Dict]:
        """Fetch live score update for a specific match"""
        try:
            if not match.get('sportsdb_event_id'):
                return None
                
            async with aiohttp.ClientSession() as session:
                url = f"https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id={match['sportsdb_event_id']}"
                
                async with session.get(url, timeout=5) as response:
                    if response.status == 200:
                        data = await response.json()
                        events = data.get('events', [])
                        
                        if events and len(events) > 0:
                            event = events[0]
                            return {
                                'home_score': int(event.get('intHomeScore', 0)) if event.get('intHomeScore') else 0,
                                'away_score': int(event.get('intAwayScore', 0)) if event.get('intAwayScore') else 0,
                                'match_status': self._parse_match_status(event.get('strStatus', '')),
                                'match_minute': event.get('strProgress', ''),
                                'last_updated': datetime.now().isoformat()
                            }
                            
        except Exception as e:
            logger.error(f"Error fetching live score update: {e}")
            
        return None
    
    async def _get_or_create_league_group(self, league_info: Dict) -> Optional[Dict]:
        """Get existing league group or create new one"""
        try:
            groups = await db.get_groups()
            
            # Look for existing group
            for group in groups:
                if (league_info['group_name'] in group.get('name', '') or 
                    league_info['name'] in group.get('name', '')):
                    return group
            
            # Create new group
            group_data = {
                'name': league_info['group_name'],
                'description': f'{league_info["name"]} matches and discussions',
                'creator_id': '25293ea3-1122-4989-acd2-f28736b3f698'  # System user
            }
            
            return await db.create_group(group_data)
            
        except Exception as e:
            logger.error(f"Error getting/creating league group: {e}")
            return None
    
    async def _create_match_channel_from_fixture(self, fixture: Dict, league_group: Dict, match_date: str) -> Dict:
        """Create a match channel from fixture data - with duplicate prevention"""
        try:
            # Check for existing match channel first (without is_archived for now)
            existing_match = await run_sync_in_thread(
                lambda: db.client.table('match_channels')
                .select('id, channel_id, home_team, away_team')
                .eq('home_team', fixture['home_team'])
                .eq('away_team', fixture['away_team'])
                .eq('match_date', match_date)
                .execute()
            )
            
            if existing_match.data:
                logger.info(f"Match channel already exists: {fixture['home_team']} vs {fixture['away_team']}")
                return {
                    'success': True,
                    'home_team': fixture['home_team'],
                    'away_team': fixture['away_team'],
                    'match_channel_id': existing_match.data[0]['id'],
                    'chat_channel_id': existing_match.data[0]['channel_id'],
                    'already_existed': True
                }
            
            # Create chat channel
            channel_data = {
                'name': f'{fixture["home_team"]} vs {fixture["away_team"]}',
                'description': f'Live discussion for {fixture["home_team"]} vs {fixture["away_team"]} | {league_group["name"]}',
                'is_private': False,
                'created_by': '25293ea3-1122-4989-acd2-f28736b3f698'
            }
            
            chat_channel = await db.create_channel(channel_data)
            if not chat_channel:
                return {'success': False, 'error': 'Failed to create chat channel'}
            
            # Create match channel
            match_channel_data = {
                'home_team': fixture['home_team'],
                'away_team': fixture['away_team'],
                'match_date': match_date,
                'match_time': fixture.get('match_time'),
                'group_id': league_group['id'],
                'channel_id': chat_channel['id'],
                'sportsdb_event_id': fixture.get('sportsdb_event_id')
            }
            
            match_channel = await db.create_match_channel(match_channel_data)
            if not match_channel:
                return {'success': False, 'error': 'Failed to create match channel'}
            
            # Add live score data
            score_data = {
                'match_channel_id': match_channel['id'],
                'home_score': fixture.get('home_score', 0),
                'away_score': fixture.get('away_score', 0),
                'match_status': fixture.get('match_status', 'scheduled'),
                'match_minute': fixture.get('match_minute'),
                'last_updated': datetime.now().isoformat()
            }
            
            await run_sync_in_thread(
                lambda: db.client.table('live_match_data').insert(score_data).execute()
            )
            
            # Generate reliable widget
            widget_config = reliable_sports_api.get_reliable_widget_config(
                fixture['home_team'], fixture['away_team'], league_group['name']
            )
            
            # Update match channel with reliable widget info
            await run_sync_in_thread(
                lambda: db.client.table('match_channels')
                .update({
                    'widget_url': widget_config['widget_url'],
                    'widget_provider': 'aiscore',
                    'widget_enabled': True
                })
                .eq('id', match_channel['id'])
                .execute()
            )
            
            # Add all users as channel members
            users_response = await run_sync_in_thread(
                lambda: db.client.table('users').select('id').execute()
            )
            users = users_response.data or []
            
            for user in users:
                await run_sync_in_thread(
                    lambda u=user: db.client.table('channel_members').insert({
                        'channel_id': chat_channel['id'],
                        'user_id': u['id'],
                        'role': 'admin' if u['id'] == '25293ea3-1122-4989-acd2-f28736b3f698' else 'user'
                    }).execute()
                )
            
            return {
                'success': True,
                'home_team': fixture['home_team'],
                'away_team': fixture['away_team'],
                'match_channel_id': match_channel['id'],
                'chat_channel_id': chat_channel['id']
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}

# Global instance
automated_match_scheduler = AutomatedMatchScheduler()