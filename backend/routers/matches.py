from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
from pydantic import BaseModel
from auth import get_current_user
from database import db
import logging
from datetime import date, datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/matches", tags=["matches"])


class LiveScoreData(BaseModel):
    home_score: int
    away_score: int
    match_status: str  # 'scheduled', 'live', 'finished'
    match_minute: Optional[str] = None


class MatchChannelResponse(BaseModel):
    id: str
    channel_id: str
    group_id: str
    group_name: str
    match_date: str
    home_team: str
    away_team: str
    match_time: Optional[str]
    home_score: int = 0
    away_score: int = 0
    match_status: str = "scheduled"
    match_minute: Optional[str] = None
    auto_delete_at: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.get("/today", response_model=List[MatchChannelResponse])
async def get_today_matches(
    current_user=Depends(get_current_user)
):
    """Get all today's match channels across all leagues"""
    try:
        matches = await db.get_today_match_channels()
        return [MatchChannelResponse(**match) for match in matches]
    except Exception as e:
        logger.error(f"Error getting today's matches: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch today's matches"
        )


@router.get("/live-scores")
async def get_live_scores(
    current_user=Depends(get_current_user)
):
    """Get live scores for all active matches"""
    try:
        live_matches = await db.get_live_matches()
        return {
            "live_matches": live_matches,
            "last_updated": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting live scores: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch live scores"
        )


@router.get("/{match_channel_id}/score")
async def get_match_score(
    match_channel_id: str,
    current_user=Depends(get_current_user)
):
    """Get live score for a specific match channel"""
    try:
        match_data = await db.get_match_channel_with_scores(match_channel_id)
        if not match_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found"
            )
        
        return MatchChannelResponse(**match_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting match score for {match_channel_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch match score"
        )


@router.patch("/{match_channel_id}/score")
async def update_match_score(
    match_channel_id: str,
    score_data: LiveScoreData,
    current_user=Depends(get_current_user)
):
    """Update live score for a match (internal API for background services)"""
    try:
        # TODO: Add service authentication for internal calls
        # For now, any authenticated user can update scores
        
        # Verify match exists
        match_data = await db.get_match_channel_by_id(match_channel_id)
        if not match_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found"
            )
        
        # Update live score data
        updated_score = await db.update_live_scores(
            match_channel_id, 
            score_data.dict()
        )
        
        if not updated_score:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update match score"
            )
        
        # Broadcast score update via WebSocket
        from websocket_manager import websocket_manager
        await websocket_manager.broadcast_live_score_update(
            match_data["channel_id"],
            {
                "match_id": match_channel_id,
                "home_team": match_data["home_team"],
                "away_team": match_data["away_team"],
                "home_score": score_data.home_score,
                "away_score": score_data.away_score,
                "match_status": score_data.match_status,
                "match_minute": score_data.match_minute
            }
        )
        
        return {
            "message": "Match score updated successfully",
            "match_id": match_channel_id,
            "scores": score_data.dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating match score for {match_channel_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update match score"
        )


@router.get("/history/{date}")
async def get_matches_by_date(
    date: str,  # YYYY-MM-DD format
    current_user=Depends(get_current_user)
):
    """Get match channels for a specific date"""
    try:
        # Validate date format
        try:
            match_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD"
            )
        
        matches = await db.get_match_channels_by_date(match_date)
        return {
            "date": date,
            "matches": [MatchChannelResponse(**match) for match in matches]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting matches for date {date}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch matches for date"
        )


@router.post("/cleanup-expired")
async def cleanup_expired_channels(
    current_user=Depends(get_current_user)
):
    """Trigger cleanup of expired match channels (admin functionality)"""
    try:
        # TODO: Add admin/service authentication
        
        deleted_count = await db.cleanup_expired_match_channels()
        return {
            "message": "Cleanup completed",
            "deleted_channels": deleted_count
        }
    except Exception as e:
        logger.error(f"Error cleaning up expired channels: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cleanup expired channels"
        )


@router.post("/refresh-live-scores")
async def refresh_live_scores(
    current_user=Depends(get_current_user)
):
    """Trigger manual refresh of live scores from SportsDB API"""
    try:
        # TODO: Add admin/service authentication
        # Import here to avoid circular dependencies
        from services.live_score_service import update_live_scores
        
        result = await update_live_scores()
        return {
            "message": "Live scores updated",
            "updated_matches": result.get("updated_count", 0),
            "errors": result.get("errors", [])
        }
    except Exception as e:
        logger.error(f"Error refreshing live scores: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh live scores"
        )