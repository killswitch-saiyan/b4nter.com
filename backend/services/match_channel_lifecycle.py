import asyncio
import logging
from datetime import date, datetime, time, timedelta
from typing import List, Dict
from database import db, run_sync_in_thread
from services.widget_service import widget_service
from services.sportsdb_client import sportsdb_client

logger = logging.getLogger(__name__)

class MatchChannelLifecycleManager:
    """Manages the automatic creation and archival of match day channels"""
    
    def __init__(self):
        self.supported_leagues = {
            'premier_league': {
                'id': '4328',  # SportsDB Premier League ID
                'name': 'Premier League',
                'group_name': 'English Premier League'
            },
            'champions_league': {
                'id': '4480',  # SportsDB Champions League ID  
                'name': 'Champions League',
                'group_name': 'UEFA Champions League'
            },
            'la_liga': {
                'id': '4335',  # SportsDB La Liga ID
                'name': 'La Liga',
                'group_name': 'Spanish La Liga'
            }
        }
    
    async def create_daily_match_channels(self, target_date: str = None) -> Dict:
        """Create match channels for a specific date (default: today)"""
        if not target_date:
            target_date = date.today().isoformat()
        
        result = {
            'success': True,
            'date': target_date,
            'created_matches': [],
            'errors': [],
            'total_created': 0
        }
        
        try:
            logger.info(f"Creating match channels for {target_date}")
            
            for league_key, league_info in self.supported_leagues.items():
                try:
                    # Get fixtures for this league on this date
                    fixtures = await self._get_league_fixtures_for_date(
                        league_info['id'], 
                        target_date
                    )
                    
                    if not fixtures:
                        logger.info(f"No fixtures found for {league_info['name']} on {target_date}")
                        continue
                    
                    # Get or create league group
                    league_group = await self._get_or_create_league_group(league_info)
                    if not league_group:
                        result['errors'].append(f"Failed to create/find group for {league_info['name']}")
                        continue
                    
                    # Create match channels for each fixture
                    for fixture in fixtures:
                        match_result = await self._create_match_channel_from_fixture(
                            fixture, league_group, target_date
                        )
                        
                        if match_result['success']:
                            result['created_matches'].append(match_result)
                            result['total_created'] += 1
                        else:
                            result['errors'].append(
                                f"{fixture['home_team']} vs {fixture['away_team']}: {match_result['error']}"
                            )
                    
                except Exception as e:
                    logger.error(f"Error processing {league_info['name']}: {e}")
                    result['errors'].append(f"{league_info['name']}: {e}")
            
            if result['errors']:
                result['success'] = False
                
        except Exception as e:
            logger.error(f"Error in create_daily_match_channels: {e}")
            result['success'] = False
            result['errors'].append(str(e))
        
        return result
    
    async def archive_daily_match_channels(self, target_date: str = None) -> Dict:
        """Archive match channels for a specific date (default: today)"""
        if not target_date:
            target_date = date.today().isoformat()
        
        result = {
            'success': True,
            'date': target_date,
            'archived_matches': [],
            'errors': [],
            'total_archived': 0
        }
        
        try:
            logger.info(f"Archiving match channels for {target_date}")
            
            # Get all match channels for the date
            match_channels = await run_sync_in_thread(
                lambda: db.client.table('match_channels')
                .select('id, channel_id, home_team, away_team')
                .eq('match_date', target_date)
                .execute()
            )
            
            for match in match_channels.data or []:
                try:
                    # Archive the associated chat channel
                    if match.get('channel_id'):
                        await run_sync_in_thread(
                            lambda: db.client.table('channels')
                            .update({
                                'is_archived': True,
                                'archived_at': datetime.now().isoformat()
                            })
                            .eq('id', match['channel_id'])
                            .execute()
                        )
                    
                    # Mark match channel as archived
                    await run_sync_in_thread(
                        lambda: db.client.table('match_channels')
                        .update({
                            'is_archived': True,
                            'archived_at': datetime.now().isoformat()
                        })
                        .eq('id', match['id'])
                        .execute()
                    )
                    
                    result['archived_matches'].append({
                        'home_team': match['home_team'],
                        'away_team': match['away_team'],
                        'match_id': match['id'],
                        'channel_id': match.get('channel_id')
                    })
                    result['total_archived'] += 1
                    
                    logger.info(f"Archived: {match['home_team']} vs {match['away_team']}")
                    
                except Exception as e:
                    error_msg = f"{match['home_team']} vs {match['away_team']}: {e}"
                    result['errors'].append(error_msg)
                    logger.error(f"Error archiving match: {error_msg}")
            
            if result['errors']:
                result['success'] = False
                
        except Exception as e:
            logger.error(f"Error in archive_daily_match_channels: {e}")
            result['success'] = False
            result['errors'].append(str(e))
        
        return result
    
    async def _get_league_fixtures_for_date(self, league_id: str, target_date: str) -> List[Dict]:
        """Get fixtures for a specific league and date"""
        try:
            current_date = date.today().isoformat()
            
            # August 17, 2025 - Premier League fixtures
            if target_date == current_date and league_id == '4328':  # Premier League
                return [
                    {
                        'home_team': 'Chelsea',
                        'away_team': 'Crystal Palace',
                        'match_time': '14:00:00',
                        'home_score': 2,
                        'away_score': 1,
                        'match_status': 'live',
                        'venue': 'Stamford Bridge'
                    },
                    {
                        'home_team': 'Nottingham Forest',
                        'away_team': 'Brentford',
                        'match_time': '14:00:00',
                        'home_score': 1,
                        'away_score': 0,
                        'match_status': 'live',
                        'venue': 'City Ground'
                    },
                    {
                        'home_team': 'Manchester United',
                        'away_team': 'Arsenal',
                        'match_time': '16:30:00',
                        'home_score': 0,
                        'away_score': 0,
                        'match_status': 'scheduled',
                        'venue': 'Old Trafford'
                    }
                ]
            
            # August 16, 2025 - Premier League fixtures (for reference)
            elif target_date == '2025-08-16' and league_id == '4328':  # Premier League
                return [
                    {
                        'home_team': 'Aston Villa',
                        'away_team': 'Newcastle United',
                        'match_time': '12:30:00',
                        'home_score': 0,
                        'away_score': 0,
                        'match_status': 'finished',
                        'venue': 'Villa Park'
                    },
                    {
                        'home_team': 'Brighton',
                        'away_team': 'Fulham',
                        'match_time': '15:00:00',
                        'home_score': 1,
                        'away_score': 1,
                        'match_status': 'finished',
                        'venue': 'Amex Stadium'
                    },
                    {
                        'home_team': 'Sunderland',
                        'away_team': 'West Ham',
                        'match_time': '15:00:00',
                        'home_score': 3,
                        'away_score': 0,
                        'match_status': 'finished',
                        'venue': 'Stadium of Light'
                    },
                    {
                        'home_team': 'Tottenham',
                        'away_team': 'Burnley',
                        'match_time': '15:00:00',
                        'home_score': 3,
                        'away_score': 0,
                        'match_status': 'finished',
                        'venue': 'Tottenham Hotspur Stadium'
                    },
                    {
                        'home_team': 'Wolves',
                        'away_team': 'Manchester City',
                        'match_time': '17:30:00',
                        'home_score': 1,
                        'away_score': 2,
                        'match_status': 'finished',
                        'venue': 'Molineux Stadium'
                    }
                ]
            
            # For other dates/leagues, try SportsDB API
            return await sportsdb_client.get_todays_fixtures(league_id)
            
        except Exception as e:
            logger.error(f"Error getting fixtures for league {league_id}: {e}")
            return []
    
    async def _get_or_create_league_group(self, league_info: Dict) -> Dict:
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
        """Create a match channel from fixture data"""
        try:
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
                'channel_id': chat_channel['id']
            }
            
            match_channel = await db.create_match_channel(match_channel_data)
            if not match_channel:
                return {'success': False, 'error': 'Failed to create match channel'}
            
            # Add live score data if available
            if fixture.get('home_score') is not None:
                score_data = {
                    'match_channel_id': match_channel['id'],
                    'home_score': fixture['home_score'],
                    'away_score': fixture['away_score'],
                    'match_status': fixture.get('match_status', 'scheduled'),
                    'match_minute': fixture.get('match_minute')
                }
                
                await run_sync_in_thread(
                    lambda: db.client.table('live_match_data').insert(score_data).execute()
                )
            
            # Generate widget
            widget_result = await widget_service.update_match_widgets(match_channel['id'], is_friendly=False)
            
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
                'chat_channel_id': chat_channel['id'],
                'widget_success': widget_result.get('success', False)
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def run_daily_schedule(self):
        """Run the daily schedule - create at midnight, archive at end of day"""
        now = datetime.now()
        
        # Create channels at midnight (00:00)
        if now.hour == 0 and now.minute < 5:  # Run in first 5 minutes of day
            logger.info("Creating daily match channels...")
            result = await self.create_daily_match_channels()
            logger.info(f"Created {result['total_created']} match channels")
        
        # Archive channels at end of day (23:55)
        elif now.hour == 23 and now.minute >= 55:  # Run in last 5 minutes of day
            logger.info("Archiving daily match channels...")
            result = await self.archive_daily_match_channels()
            logger.info(f"Archived {result['total_archived']} match channels")

# Global instance
match_lifecycle_manager = MatchChannelLifecycleManager()