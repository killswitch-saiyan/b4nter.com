from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import date, timedelta
import logging

from models import (
    GroupResponse, MatchChannelResponse, LiveScoreData, 
    MatchSyncResult, UserResponse
)
from database import db
from auth import get_current_user
from websocket_manager import websocket_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=List[dict])
async def get_friendly_matches(
    date_filter: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get friendly matches, optionally filtered by date"""
    try:
        matches = await db.get_friendly_matches(date_filter)
        return matches
    except Exception as e:
        logger.error(f"Error getting friendly matches: {e}")
        raise HTTPException(status_code=500, detail="Failed to get friendly matches")


@router.get("/today", response_model=List[dict])
async def get_todays_friendly_matches(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get today's friendly matches"""
    try:
        matches = await db.get_todays_friendly_matches()
        return matches
    except Exception as e:
        logger.error(f"Error getting today's friendly matches: {e}")
        raise HTTPException(status_code=500, detail="Failed to get today's friendly matches")


@router.get("/tomorrow", response_model=List[dict])
async def get_tomorrows_friendly_matches(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get tomorrow's friendly matches"""
    try:
        matches = await db.get_tomorrows_friendly_matches()
        return matches
    except Exception as e:
        logger.error(f"Error getting tomorrow's friendly matches: {e}")
        raise HTTPException(status_code=500, detail="Failed to get tomorrow's friendly matches")


@router.get("/live", response_model=List[dict])
async def get_live_friendly_matches(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get currently live friendly matches"""
    try:
        matches = await db.get_live_friendly_matches()
        return matches
    except Exception as e:
        logger.error(f"Error getting live friendly matches: {e}")
        raise HTTPException(status_code=500, detail="Failed to get live friendly matches")


@router.post("/", response_model=dict)
async def create_friendly_match(
    match_data: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new friendly match"""
    try:
        # First create a channel for this match
        channel_name = f"{match_data['match_date']} {match_data['home_team']} vs {match_data['away_team']}"
        channel_data = {
            "name": channel_name,
            "description": f"Friendly: {match_data['home_team']} vs {match_data['away_team']}",
            "is_private": False
        }
        
        channel = await db.create_channel(channel_data, current_user.id)
        if not channel:
            raise HTTPException(status_code=500, detail="Failed to create channel")
        
        # Add channel_id to match data
        match_data['channel_id'] = channel['id']
        
        # Create the friendly match
        friendly = await db.create_friendly_match(match_data)
        if not friendly:
            # Clean up channel if match creation failed
            await db.delete_channel(channel['id'])
            raise HTTPException(status_code=500, detail="Failed to create friendly match")
        
        return friendly
    except Exception as e:
        logger.error(f"Error creating friendly match: {e}")
        raise HTTPException(status_code=500, detail="Failed to create friendly match")


@router.patch("/{friendly_id}/score")
async def update_friendly_score(
    friendly_id: str,
    score_data: LiveScoreData,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update live scores for a friendly match"""
    try:
        # Update scores in database
        updated = await db.update_friendly_scores(friendly_id, score_data.dict())
        
        if not updated:
            raise HTTPException(status_code=404, detail="Friendly match not found")
        
        # Get full match data for broadcasting
        matches = await db.get_friendly_matches()
        match = next((m for m in matches if m['id'] == friendly_id), None)
        
        if match:
            # Broadcast update via WebSocket
            await broadcast_friendly_score_update(match, score_data.dict())
        
        return {"message": "Score updated successfully", "data": updated}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating friendly score: {e}")
        raise HTTPException(status_code=500, detail="Failed to update score")


@router.delete("/{friendly_id}")
async def delete_friendly_match(
    friendly_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a friendly match"""
    try:
        # Get match data first to clean up channel
        matches = await db.get_friendly_matches()
        match = next((m for m in matches if m['id'] == friendly_id), None)
        
        if not match:
            raise HTTPException(status_code=404, detail="Friendly match not found")
        
        # Delete the friendly match
        deleted = await db.delete_friendly_match(friendly_id)
        
        if deleted and match.get('channel_id'):
            # Clean up associated channel
            await db.delete_channel(match['channel_id'])
        
        return {"message": "Friendly match deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting friendly match: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete friendly match")


async def broadcast_friendly_score_update(match: dict, score_data: dict):
    """Broadcast friendly match score update via WebSocket"""
    try:
        channel_id = match.get('channel_id')
        if not channel_id:
            return
        
        # Prepare WebSocket message
        message = {
            "type": "friendly_score_update",
            "friendly_id": match.get('id'),
            "channel_id": channel_id,
            "home_team": match.get('home_team'),
            "away_team": match.get('away_team'),
            "home_score": score_data.get('home_score', 0),
            "away_score": score_data.get('away_score', 0),
            "match_status": score_data.get('match_status', 'scheduled'),
            "match_minute": score_data.get('match_minute'),
            "venue": match.get('venue'),
            "match_type": match.get('match_type', 'friendly'),
            "last_updated": match.get('last_updated')
        }
        
        # Broadcast to all users in the channel
        await websocket_manager.broadcast_to_channel(channel_id, message)
        
        # Also broadcast to all connected users (for general score updates)
        await websocket_manager.broadcast_to_all({
            "type": "global_friendly_update",
            "match": message
        })
        
        logger.info(f"Broadcasted friendly score update for {match.get('home_team')} vs {match.get('away_team')}")
        
    except Exception as e:
        logger.error(f"Error broadcasting friendly score update: {e}")


@router.post("/sync")
async def sync_friendly_matches(
    current_user: UserResponse = Depends(get_current_user)
):
    """Sync friendly matches from external sources (SportsDB, etc.)"""
    try:
        # This endpoint can be used to trigger manual sync
        # For now, return placeholder data
        from services.friendly_sync import sync_friendly_matches
        result = await sync_friendly_matches()
        return result
    except Exception as e:
        logger.error(f"Error syncing friendly matches: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync friendly matches")