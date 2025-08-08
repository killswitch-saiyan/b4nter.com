from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
from pydantic import BaseModel
from auth import get_current_user
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])


class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    league_id: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True


class GroupCreate(GroupBase):
    pass


class GroupResponse(GroupBase):
    id: str
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True


class GroupWithMatchesResponse(GroupResponse):
    today_matches_count: int = 0


@router.get("/", response_model=List[GroupResponse])
async def get_groups(
    active_only: bool = True,
    current_user=Depends(get_current_user)
):
    """Get all groups/leagues"""
    try:
        groups = await db.get_groups(active_only=active_only)
        return [GroupResponse(**group) for group in groups]
    except Exception as e:
        logger.error(f"Error getting groups: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch groups"
        )


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: str,
    current_user=Depends(get_current_user)
):
    """Get a specific group by ID"""
    try:
        group = await db.get_group_by_id(group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found"
            )
        return GroupResponse(**group)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group {group_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch group"
        )


@router.get("/{group_id}/matches/today")
async def get_today_matches_for_group(
    group_id: str,
    current_user=Depends(get_current_user)
):
    """Get today's match channels for a specific group"""
    try:
        # First verify group exists
        group = await db.get_group_by_id(group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found"
            )
        
        matches = await db.get_today_match_channels(group_id)
        return {
            "group": GroupResponse(**group),
            "matches": matches
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting today's matches for group {group_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch today's matches"
        )


@router.get("/{group_id}/channels")
async def get_group_channels(
    group_id: str,
    current_user=Depends(get_current_user)
):
    """Get all channels (including match channels) for a group"""
    try:
        # Verify group exists
        group = await db.get_group_by_id(group_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found"
            )
        
        channels = await db.get_group_channels(group_id)
        return {
            "group": GroupResponse(**group),
            "channels": channels
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting channels for group {group_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch group channels"
        )


@router.post("/", response_model=GroupResponse)
async def create_group(
    group_data: GroupCreate,
    current_user=Depends(get_current_user)
):
    """Create a new group/league (admin functionality)"""
    try:
        # TODO: Add admin permission check
        # For now, any authenticated user can create groups
        
        group_dict = group_data.dict()
        new_group = await db.create_group(group_dict)
        
        if not new_group:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create group"
            )
        
        return GroupResponse(**new_group)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create group"
        )


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: str,
    update_data: dict,
    current_user=Depends(get_current_user)
):
    """Update a group (admin functionality)"""
    try:
        # TODO: Add admin permission check
        
        # Verify group exists
        existing_group = await db.get_group_by_id(group_id)
        if not existing_group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found"
            )
        
        updated_group = await db.update_group(group_id, update_data)
        if not updated_group:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update group"
            )
        
        return GroupResponse(**updated_group)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating group {group_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update group"
        )


@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    current_user=Depends(get_current_user)
):
    """Delete a group (admin functionality - soft delete by marking inactive)"""
    try:
        # TODO: Add admin permission check
        
        # Verify group exists
        existing_group = await db.get_group_by_id(group_id)
        if not existing_group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found"
            )
        
        # Soft delete by marking inactive
        await db.update_group(group_id, {"is_active": False})
        
        return {"message": "Group deactivated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting group {group_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete group"
        )


@router.post("/sync-matches")
async def sync_matches(
    current_user=Depends(get_current_user)
):
    """Trigger manual sync of today's matches from SportsDB API"""
    try:
        # TODO: Add admin permission check
        # Import here to avoid circular dependencies
        from services.match_sync import sync_todays_matches
        
        result = await sync_todays_matches()
        return {
            "message": "Match sync completed",
            "synced_matches": result.get("synced_count", 0),
            "errors": result.get("errors", [])
        }
    except Exception as e:
        logger.error(f"Error syncing matches: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync matches"
        )