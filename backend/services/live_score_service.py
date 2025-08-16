import logging
import asyncio
from datetime import datetime, date
from typing import Dict, List
from database import db
from services.sportsdb_client import sportsdb_client
from websocket_manager import websocket_manager

logger = logging.getLogger(__name__)


async def update_live_scores() -> Dict:
    """Update live scores for all active matches"""
    result = {
        "updated_count": 0,
        "errors": [],
        "live_matches": []
    }
    
    try:
        # Get all today's match channels
        today_matches = await db.get_today_match_channels()
        
        if not today_matches:
            logger.info("No matches today to update")
            return result
        
        # Group matches by league for efficient API calls
        matches_by_league = {}
        for match in today_matches:
            group_id = match.get('group_id')
            if group_id not in matches_by_league:
                matches_by_league[group_id] = []
            matches_by_league[group_id].append(match)
        
        # Update scores for each league
        for group_id, matches in matches_by_league.items():
            try:
                # Get league info
                group = await db.get_group_by_id(group_id)
                if not group or not group.get('league_id'):
                    logger.warning(f"No league_id for group {group_id}")
                    continue
                
                league_id = group['league_id']
                
                # Get live scores for this league
                live_scores = await sportsdb_client.get_league_live_scores(league_id)
                
                # Update each match
                for match in matches:
                    try:
                        await update_single_match_score(match, live_scores)
                        result["updated_count"] += 1
                    except Exception as e:
                        error_msg = f"Failed to update match {match.get('id')}: {e}"
                        logger.error(error_msg)
                        result["errors"].append(error_msg)
                        
            except Exception as e:
                error_msg = f"Failed to get live scores for group {group_id}: {e}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
        
        logger.info(f"Live score update completed: {result['updated_count']} matches updated")
        return result
        
    except Exception as e:
        logger.error(f"Critical error in live score update: {e}")
        result["errors"].append(f"Critical update error: {e}")
        return result


async def update_single_match_score(match: Dict, live_scores: List[Dict]) -> bool:
    """Update score for a single match"""
    try:
        sportsdb_event_id = match.get('sportsdb_event_id')
        if not sportsdb_event_id:
            logger.warning(f"No SportsDB event ID for match {match.get('id')}")
            return False
        
        # Find corresponding live score
        live_score = None
        for score in live_scores:
            if score.get('idEvent') == sportsdb_event_id:
                live_score = score
                break
        
        if not live_score:
            # No live score found - match might not be live yet
            logger.debug(f"No live score found for match {sportsdb_event_id}")
            return True
        
        # Parse the live score data
        score_data = sportsdb_client.parse_match_data(live_score)
        
        if not score_data:
            logger.warning(f"Could not parse live score for match {sportsdb_event_id}")
            return False
        
        # Get current scores from database
        current_match = await db.get_match_channel_with_scores(match['id'])
        
        # Check if scores have changed
        if current_match:
            current_home = current_match.get('home_score', 0)
            current_away = current_match.get('away_score', 0)
            current_status = current_match.get('match_status', 'scheduled')
            current_minute = current_match.get('match_minute')
            
            new_home = score_data.get('home_score', 0)
            new_away = score_data.get('away_score', 0)
            new_status = score_data.get('match_status', 'scheduled')
            new_minute = score_data.get('match_minute')
            
            # Only update if something has changed
            if (current_home != new_home or current_away != new_away or 
                current_status != new_status or current_minute != new_minute):
                
                # Update in database
                live_score_update = {
                    "home_score": new_home,
                    "away_score": new_away,
                    "match_status": new_status,
                    "match_minute": new_minute
                }
                
                await db.update_live_scores(match['id'], live_score_update)
                
                # Broadcast update via WebSocket
                await broadcast_score_update(match, live_score_update)
                
                logger.info(f"Updated scores for {match.get('home_team')} vs {match.get('away_team')}: {new_home}-{new_away}")
                return True
        
        return True
        
    except Exception as e:
        logger.error(f"Error updating single match score: {e}")
        return False


async def broadcast_score_update(match: Dict, score_data: Dict):
    """Broadcast live score update via WebSocket"""
    try:
        channel_id = match.get('channel_id')
        if not channel_id:
            return
        
        # Prepare WebSocket message
        message = {
            "type": "live_score_update",
            "match_id": match.get('id'),
            "channel_id": channel_id,
            "home_team": match.get('home_team'),
            "away_team": match.get('away_team'),
            "home_score": score_data.get('home_score', 0),
            "away_score": score_data.get('away_score', 0),
            "match_status": score_data.get('match_status', 'scheduled'),
            "match_minute": score_data.get('match_minute'),
            "last_updated": datetime.utcnow().isoformat()
        }
        
        # Broadcast to all users in the channel
        await websocket_manager.broadcast_to_channel(channel_id, message)
        
        # Also broadcast to all connected users (for general score updates)
        await websocket_manager.broadcast_to_all({
            "type": "global_score_update",
            "match": message
        })
        
        logger.debug(f"Broadcasted score update for channel {channel_id}")
        
    except Exception as e:
        logger.error(f"Error broadcasting score update: {e}")


async def start_live_score_monitoring():
    """Start continuous monitoring of live scores"""
    logger.info("Starting live score monitoring service")
    
    while True:
        try:
            # Update live scores every 30 seconds during active hours
            await update_live_scores()
            await asyncio.sleep(30)  # 30 second interval
            
        except Exception as e:
            logger.error(f"Error in live score monitoring: {e}")
            await asyncio.sleep(60)  # Wait longer on error


async def update_match_status_to_finished():
    """Update match status for matches that should be finished"""
    try:
        # Get live matches that have been running for too long (over 2 hours)
        from datetime import timedelta
        cutoff_time = datetime.now() - timedelta(hours=2)
        
        live_matches = await db.get_live_matches()
        finished_count = 0
        
        for match in live_matches:
            try:
                # Check if match has been live for too long without updates
                last_updated = match.get('last_updated')
                if last_updated:
                    last_update_time = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
                    if last_update_time < cutoff_time:
                        # Mark as finished
                        await db.update_live_scores(match['match_channel_id'], {
                            "match_status": "finished"
                        })
                        finished_count += 1
                        
                        logger.info(f"Marked match as finished: {match.get('home_team')} vs {match.get('away_team')}")
                        
            except Exception as e:
                logger.error(f"Error updating match status: {e}")
        
        if finished_count > 0:
            logger.info(f"Updated {finished_count} matches to finished status")
            
        return finished_count
        
    except Exception as e:
        logger.error(f"Error updating match statuses: {e}")
        return 0