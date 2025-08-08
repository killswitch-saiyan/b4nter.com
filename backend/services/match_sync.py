import logging
import asyncio
from datetime import datetime, date, timedelta
from typing import Dict, List
from database import db
from services.sportsdb_client import sportsdb_client

logger = logging.getLogger(__name__)


async def sync_todays_matches() -> Dict:
    """Sync today's matches from SportsDB API for all active leagues"""
    result = {
        "synced_count": 0,
        "errors": [],
        "created_channels": []
    }
    
    try:
        # Get all active leagues
        groups = await db.get_groups(active_only=True)
        
        for group in groups:
            league_id = group.get('league_id')
            if not league_id:
                logger.warning(f"Group {group['name']} has no league_id, skipping")
                continue
            
            try:
                # Get today's fixtures for this league
                todays_fixtures = await sportsdb_client.get_todays_fixtures(league_id)
                
                for fixture in todays_fixtures:
                    try:
                        await sync_single_match(group, fixture)
                        result["synced_count"] += 1
                    except Exception as e:
                        error_msg = f"Failed to sync match {fixture.get('idEvent', 'unknown')}: {e}"
                        logger.error(error_msg)
                        result["errors"].append(error_msg)
                        
            except Exception as e:
                error_msg = f"Failed to get fixtures for league {group['name']}: {e}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
        
        logger.info(f"Match sync completed: {result['synced_count']} matches synced, {len(result['errors'])} errors")
        return result
        
    except Exception as e:
        logger.error(f"Critical error in match sync: {e}")
        result["errors"].append(f"Critical sync error: {e}")
        return result


async def sync_single_match(group: Dict, fixture: Dict) -> bool:
    """Sync a single match fixture"""
    try:
        # Parse match data from SportsDB
        match_data = sportsdb_client.parse_match_data(fixture)
        
        if not match_data:
            logger.warning(f"Could not parse fixture data for {fixture.get('idEvent')}")
            return False
        
        # Check if match channel already exists
        existing_match = await db.get_match_channel_by_sportsdb_id(match_data['sportsdb_event_id'])
        
        if existing_match:
            logger.info(f"Match channel already exists for {match_data['sportsdb_event_id']}")
            return True
        
        # Create channel name in format: YYYY-MM-DD HomeTeam vs AwayTeam
        channel_name = f"{match_data['match_date']} {match_data['home_team']} vs {match_data['away_team']}"
        
        # Calculate auto-delete time (2 hours after match time, or 4 hours after start of day if no time)
        auto_delete_at = calculate_auto_delete_time(
            match_data['match_date'], 
            match_data['match_time']
        )
        
        # Create the actual channel first
        channel_data = {
            "name": channel_name,
            "description": f"{group['name']} match: {match_data['home_team']} vs {match_data['away_team']}",
            "is_private": False,  # Match channels are public
            "created_by": "system"  # System-created channel
        }
        
        # Create channel in database
        new_channel = await db.create_channel(channel_data)
        
        if not new_channel:
            logger.error(f"Failed to create channel for match {match_data['sportsdb_event_id']}")
            return False
        
        # Create match channel record
        match_channel_data = {
            "channel_id": new_channel["id"],
            "group_id": group["id"],
            "match_date": match_data['match_date'],
            "home_team": match_data['home_team'],
            "away_team": match_data['away_team'],
            "match_time": match_data['match_time'],
            "sportsdb_event_id": match_data['sportsdb_event_id'],
            "auto_delete_at": auto_delete_at
        }
        
        match_channel = await db.create_match_channel(match_channel_data)
        
        if not match_channel:
            # Clean up the channel if match channel creation failed
            await db.delete_channel(new_channel["id"])
            logger.error(f"Failed to create match channel record for {match_data['sportsdb_event_id']}")
            return False
        
        # Initialize live score data if match has scores
        if match_data['home_score'] > 0 or match_data['away_score'] > 0 or match_data['match_status'] != 'scheduled':
            live_score_data = {
                "home_score": match_data['home_score'],
                "away_score": match_data['away_score'],
                "match_status": match_data['match_status'],
                "match_minute": match_data['match_minute']
            }
            
            await db.update_live_scores(match_channel["id"], live_score_data)
        
        logger.info(f"Successfully synced match: {channel_name}")
        return True
        
    except Exception as e:
        logger.error(f"Error syncing single match: {e}")
        return False


def calculate_auto_delete_time(match_date: str, match_time: str = None) -> str:
    """Calculate when a match channel should be auto-deleted (2 hours after match end)"""
    try:
        # Parse match date
        match_date_obj = datetime.strptime(match_date, "%Y-%m-%d").date()
        
        if match_time:
            # Parse match time and combine with date
            try:
                match_time_obj = datetime.strptime(match_time, "%H:%M:%S").time()
                match_datetime = datetime.combine(match_date_obj, match_time_obj)
                # Add 2 hours for match duration + 2 hours buffer = 4 hours total
                delete_time = match_datetime + timedelta(hours=4)
            except ValueError:
                # If time parsing fails, default to end of day + 2 hours
                match_datetime = datetime.combine(match_date_obj, datetime.min.time().replace(hour=23, minute=59))
                delete_time = match_datetime + timedelta(hours=2)
        else:
            # No match time, default to end of day + 2 hours
            match_datetime = datetime.combine(match_date_obj, datetime.min.time().replace(hour=23, minute=59))
            delete_time = match_datetime + timedelta(hours=2)
        
        return delete_time.isoformat()
        
    except Exception as e:
        logger.error(f"Error calculating auto-delete time: {e}")
        # Default to 6 hours from now
        return (datetime.now() + timedelta(hours=6)).isoformat()


async def cleanup_old_channels():
    """Clean up expired match channels"""
    try:
        deleted_count = await db.cleanup_expired_match_channels()
        logger.info(f"Cleaned up {deleted_count} expired match channels")
        return deleted_count
    except Exception as e:
        logger.error(f"Error cleaning up old channels: {e}")
        return 0


async def sync_leagues_info():
    """Sync league information from SportsDB API"""
    try:
        groups = await db.get_groups(active_only=True)
        updated_count = 0
        
        for group in groups:
            league_id = group.get('league_id')
            if not league_id:
                continue
            
            try:
                league_info = await sportsdb_client.get_league_info(league_id)
                if league_info:
                    # Update group with league info
                    update_data = {}
                    if league_info.get('description') and not group.get('description'):
                        update_data['description'] = league_info['description']
                    if league_info.get('badge') and not group.get('logo_url'):
                        update_data['logo_url'] = league_info['badge']
                    
                    if update_data:
                        await db.update_group(group['id'], update_data)
                        updated_count += 1
                        logger.info(f"Updated league info for {group['name']}")
                        
            except Exception as e:
                logger.error(f"Error syncing league info for {group['name']}: {e}")
        
        logger.info(f"League info sync completed: {updated_count} leagues updated")
        return updated_count
        
    except Exception as e:
        logger.error(f"Error syncing leagues info: {e}")
        return 0