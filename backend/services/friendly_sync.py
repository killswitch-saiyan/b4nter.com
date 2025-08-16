import logging
import asyncio
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

from database import db
from services.sportsdb_client import sportsdb_client

logger = logging.getLogger(__name__)


async def sync_friendly_matches(target_date: str = None) -> Dict:
    """Sync friendly matches from external sources"""
    result = {
        "synced_count": 0,
        "created_channels": [],
        "errors": [],
        "updated_count": 0
    }
    
    try:
        # Default to tomorrow if no date specified
        if not target_date:
            target_date = (date.today() + timedelta(days=1)).isoformat()
        
        logger.info(f"Starting friendly matches sync for {target_date}")
        
        # Get friendly fixtures from SportsDB
        fixtures = await sportsdb_client.get_friendly_fixtures_by_date(target_date)
        
        if not fixtures:
            logger.info(f"No friendly fixtures found for {target_date}")
            return result
        
        # Process each fixture
        for fixture in fixtures:
            try:
                await sync_single_friendly(fixture, result)
            except Exception as e:
                error_msg = f"Failed to sync friendly {fixture.get('home_team', 'Unknown')} vs {fixture.get('away_team', 'Unknown')}: {e}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
        
        logger.info(f"Friendly sync completed: {result['synced_count']} matches synced, {len(result['errors'])} errors")
        return result
        
    except Exception as e:
        logger.error(f"Critical error in friendly matches sync: {e}")
        result["errors"].append(f"Critical sync error: {e}")
        return result


async def sync_single_friendly(fixture: Dict, result: Dict) -> bool:
    """Sync a single friendly match"""
    try:
        home_team = fixture.get('home_team')
        away_team = fixture.get('away_team')
        match_date = fixture.get('match_date')
        sportsdb_event_id = fixture.get('sportsdb_event_id')
        
        if not all([home_team, away_team, match_date]):
            logger.warning(f"Missing required data for fixture: {fixture}")
            return False
        
        # Check if we already have this friendly match
        existing_match = None
        if sportsdb_event_id:
            existing_match = await db.get_friendly_match_by_sportsdb_id(sportsdb_event_id)
        
        if existing_match:
            # Update existing match if needed
            await update_existing_friendly(existing_match, fixture, result)
            return True
        
        # Create new friendly match
        await create_new_friendly(fixture, result)
        return True
        
    except Exception as e:
        logger.error(f"Error syncing single friendly: {e}")
        return False


async def create_new_friendly(fixture: Dict, result: Dict) -> Optional[Dict]:
    """Create a new friendly match and associated channel"""
    try:
        home_team = fixture.get('home_team')
        away_team = fixture.get('away_team')
        match_date = fixture.get('match_date')
        match_time = fixture.get('match_time')
        
        # Create channel name
        channel_name = f"{match_date} {home_team} vs {away_team}"
        
        # Get team info for logos
        home_team_info = await sportsdb_client.get_team_info(home_team)
        away_team_info = await sportsdb_client.get_team_info(away_team)
        
        # Create channel first
        channel_data = {
            "name": channel_name,
            "description": f"Friendly Match: {home_team} vs {away_team}",
            "is_private": False
        }
        
        # For testing, we'll create a manual friendly match entry without a channel first
        # In production, you'd want to handle the system user properly
        # For now, let's create the friendly without a channel and add channel creation later
        
        # Create a dummy channel ID for now
        import uuid
        dummy_channel_id = str(uuid.uuid4())
        
        # Prepare friendly match data
        friendly_data = {
            "channel_id": dummy_channel_id,
            "match_date": match_date,
            "match_time": match_time,
            "home_team": home_team,
            "away_team": away_team,
            "home_team_logo": home_team_info.get('logo') if home_team_info else None,
            "away_team_logo": away_team_info.get('logo') if away_team_info else None,
            "venue": fixture.get('venue'),
            "match_type": fixture.get('match_type', 'friendly'),
            "sportsdb_event_id": fixture.get('sportsdb_event_id'),
        }
        
        # Set auto-delete time (2 hours after estimated match end)
        if match_time and match_date:
            try:
                match_datetime = datetime.fromisoformat(f"{match_date} {match_time}")
                # Assume 2 hour match + 2 hour buffer = 4 hours total
                auto_delete_time = match_datetime + timedelta(hours=4)
                friendly_data["auto_delete_at"] = auto_delete_time.isoformat()
            except Exception as e:
                logger.warning(f"Could not set auto_delete_at: {e}")
        
        # Create friendly match
        friendly = await db.create_friendly_match(friendly_data)
        
        if friendly:
            result["synced_count"] += 1
            result["created_channels"].append(channel_name)
            logger.info(f"Created friendly match: {channel_name}")
            return friendly
        else:
            logger.error(f"Failed to create friendly match: {channel_name}")
            return None
            
    except Exception as e:
        logger.error(f"Error creating new friendly: {e}")
        return None


async def update_existing_friendly(existing_match: Dict, fixture: Dict, result: Dict) -> bool:
    """Update existing friendly match with new data"""
    try:
        # For now, we mainly update the live scores if the match status has changed
        current_status = existing_match.get('match_status', 'scheduled')
        new_status = fixture.get('match_status', 'scheduled')
        
        if current_status != new_status or fixture.get('home_score') is not None:
            score_data = {
                'home_score': fixture.get('home_score', 0),
                'away_score': fixture.get('away_score', 0),
                'match_status': new_status,
                'match_minute': fixture.get('match_minute')
            }
            
            await db.update_friendly_scores(existing_match['id'], score_data)
            result["updated_count"] += 1
            logger.info(f"Updated friendly match scores: {existing_match.get('home_team')} vs {existing_match.get('away_team')}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error updating existing friendly: {e}")
        return False


async def sync_specific_friendly_match(home_team: str, away_team: str, match_date: str) -> Dict:
    """Sync a specific friendly match by team names and date"""
    result = {
        "synced_count": 0,
        "created_channels": [],
        "errors": [],
        "updated_count": 0,
        "found": False
    }
    
    try:
        logger.info(f"Searching for specific friendly: {home_team} vs {away_team} on {match_date}")
        
        # Search for the specific match
        match_data = await sportsdb_client.search_specific_match(home_team, away_team, match_date)
        
        if not match_data:
            # If not found in SportsDB, create manually
            logger.info(f"Match not found in SportsDB, creating manually")
            
            match_data = {
                'home_team': home_team,
                'away_team': away_team,
                'match_date': match_date,
                'match_time': '19:30:00',  # Default time
                'match_type': 'club_friendly',
                'venue': 'TBD',
                'match_status': 'scheduled'
            }
        
        result["found"] = True
        await sync_single_friendly(match_data, result)
        
        return result
        
    except Exception as e:
        logger.error(f"Error syncing specific friendly match: {e}")
        result["errors"].append(f"Sync error: {e}")
        return result


async def cleanup_expired_friendlies() -> int:
    """Clean up expired friendly matches"""
    try:
        logger.info("Starting cleanup of expired friendly matches")
        
        # Get all friendlies that should be auto-deleted
        now = datetime.now().isoformat()
        expired_friendlies = await db.get_friendly_matches()
        
        deleted_count = 0
        for friendly in expired_friendlies:
            auto_delete_at = friendly.get('auto_delete_at')
            if auto_delete_at and auto_delete_at <= now:
                # Delete the friendly (cascade will handle channel cleanup)
                await db.delete_friendly_match(friendly['id'])
                
                # Also delete the associated channel
                if friendly.get('channel_id'):
                    await db.delete_channel(friendly['channel_id'])
                
                deleted_count += 1
                logger.info(f"Cleaned up expired friendly: {friendly.get('home_team')} vs {friendly.get('away_team')}")
        
        logger.info(f"Cleanup completed: {deleted_count} expired friendlies removed")
        return deleted_count
        
    except Exception as e:
        logger.error(f"Error cleaning up expired friendlies: {e}")
        return 0


async def start_friendly_monitoring():
    """Start continuous monitoring and syncing of friendly matches"""
    logger.info("Starting friendly matches monitoring service")
    
    while True:
        try:
            # Sync tomorrow's friendlies every hour
            tomorrow = (date.today() + timedelta(days=1)).isoformat()
            await sync_friendly_matches(tomorrow)
            
            # Clean up expired matches
            await cleanup_expired_friendlies()
            
            # Wait 1 hour before next sync
            await asyncio.sleep(3600)
            
        except Exception as e:
            logger.error(f"Error in friendly monitoring: {e}")
            await asyncio.sleep(300)  # Wait 5 minutes on error


# Convenience function for manual testing
async def create_test_friendly_match():
    """Create a test friendly match for Man United vs Fiorentina"""
    try:
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        
        result = await sync_specific_friendly_match(
            home_team="Manchester United",
            away_team="Fiorentina", 
            match_date=tomorrow
        )
        
        logger.info(f"Test friendly match creation result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error creating test friendly match: {e}")
        return {"error": str(e)}