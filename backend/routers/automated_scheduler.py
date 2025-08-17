from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import date
import logging

from auth import get_current_user
from services.automated_match_scheduler import automated_match_scheduler

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/manual-create-matches", response_model=Dict[str, Any])
async def manual_create_matches(
    target_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Manually trigger match creation for a specific date"""
    try:
        if not target_date:
            target_date = date.today().isoformat()
        
        logger.info(f"Manual match creation triggered by user {current_user['id']} for {target_date}")
        
        await automated_match_scheduler.create_daily_matches()
        
        return {
            "success": True,
            "message": f"Match creation triggered for {target_date}",
            "date": target_date
        }
        
    except Exception as e:
        logger.error(f"Error in manual match creation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manual-archive-matches", response_model=Dict[str, Any])
async def manual_archive_matches(
    target_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Manually trigger match archival for a specific date"""
    try:
        if not target_date:
            target_date = date.today().isoformat()
        
        logger.info(f"Manual match archival triggered by user {current_user['id']} for {target_date}")
        
        await automated_match_scheduler.archive_daily_matches()
        
        return {
            "success": True,
            "message": f"Match archival triggered for {target_date}",
            "date": target_date
        }
        
    except Exception as e:
        logger.error(f"Error in manual match archival: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manual-update-scores", response_model=Dict[str, Any])
async def manual_update_scores(current_user: dict = Depends(get_current_user)):
    """Manually trigger live score updates"""
    try:
        logger.info(f"Manual live score update triggered by user {current_user['id']}")
        
        await automated_match_scheduler.update_live_scores()
        
        return {
            "success": True,
            "message": "Live score update triggered"
        }
        
    except Exception as e:
        logger.error(f"Error in manual live score update: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/scheduler-status", response_model=Dict[str, Any])
async def get_scheduler_status(current_user: dict = Depends(get_current_user)):
    """Get the current status of the automated scheduler"""
    try:
        scheduler = automated_match_scheduler.scheduler
        
        # Get job information
        jobs = []
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": str(job.next_run_time) if job.next_run_time else None,
                "trigger": str(job.trigger)
            })
        
        return {
            "running": scheduler.running,
            "jobs": jobs,
            "supported_leagues": list(automated_match_scheduler.supported_leagues.keys())
        }
        
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))