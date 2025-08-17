from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date
import logging

from models import UserResponse
from auth import get_current_user
from services.match_channel_lifecycle import match_lifecycle_manager

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/create-daily-channels")
async def create_daily_match_channels(
    target_date: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create match channels for a specific date (default: today)"""
    try:
        if not target_date:
            target_date = date.today().isoformat()
        
        result = await match_lifecycle_manager.create_daily_match_channels(target_date)
        
        if result['success']:
            return {
                "success": True,
                "message": f"Created {result['total_created']} match channels for {target_date}",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "Some errors occurred while creating match channels",
                "data": result
            }
    except Exception as e:
        logger.error(f"Error creating daily match channels: {e}")
        raise HTTPException(status_code=500, detail="Failed to create daily match channels")

@router.post("/archive-daily-channels")
async def archive_daily_match_channels(
    target_date: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Archive match channels for a specific date (default: today)"""
    try:
        if not target_date:
            target_date = date.today().isoformat()
        
        result = await match_lifecycle_manager.archive_daily_match_channels(target_date)
        
        if result['success']:
            return {
                "success": True,
                "message": f"Archived {result['total_archived']} match channels for {target_date}",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "Some errors occurred while archiving match channels",
                "data": result
            }
    except Exception as e:
        logger.error(f"Error archiving daily match channels: {e}")
        raise HTTPException(status_code=500, detail="Failed to archive daily match channels")

@router.get("/daily-schedule-status")
async def get_daily_schedule_status(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get status of today's match channels"""
    try:
        today = date.today().isoformat()
        
        # Get today's match channels
        from database import db, run_sync_in_thread
        match_response = await run_sync_in_thread(
            lambda: db.client.table('match_channels')
            .select('home_team, away_team, match_time, is_archived')
            .eq('match_date', today)
            .execute()
        )
        
        matches = match_response.data or []
        active_matches = [m for m in matches if not m.get('is_archived', False)]
        archived_matches = [m for m in matches if m.get('is_archived', False)]
        
        return {
            "date": today,
            "total_matches": len(matches),
            "active_matches": len(active_matches),
            "archived_matches": len(archived_matches),
            "matches": matches
        }
    except Exception as e:
        logger.error(f"Error getting daily schedule status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get schedule status")