from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from models import ChannelCreate, ChannelResponse, UserResponse
from auth import get_current_user, require_channel_admin
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/channels", tags=["channels"])


@router.post("/", response_model=ChannelResponse)
async def create_channel(
    channel_data: ChannelCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new channel"""
    try:
        # Create channel data
        channel_dict = channel_data.dict()
        channel_dict["created_by"] = current_user.id
        
        # Create channel in database
        new_channel = await db.create_channel(channel_dict)
        if not new_channel:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create channel"
            )
        
        # Add creator as admin member
        member_data = {
            "user_id": current_user.id,
            "channel_id": new_channel["id"],
            "role": "admin"
        }
        await db.add_channel_member(member_data)
        
        # Return channel with member count
        channel_response = ChannelResponse(**new_channel)
        channel_response.member_count = 1
        
        return channel_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_channel: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/", response_model=List[ChannelResponse])
async def get_user_channels(current_user: UserResponse = Depends(get_current_user)):
    """Get all channels the current user is a member of"""
    try:
        channels_data = await db.get_user_channels(current_user.id)
        channels = []
        
        for channel_data in channels_data:
            if channel_data.get("channels"):
                channel = channel_data["channels"]
                channel_response = ChannelResponse(**channel)
                channels.append(channel_response)
        
        return channels
        
    except Exception as e:
        logger.error(f"Error in get_user_channels: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/{channel_id}", response_model=ChannelResponse)
async def get_channel(
    channel_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get channel by ID"""
    try:
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # Check if user is member of channel
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        if channel_id not in user_channel_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this channel"
            )
        
        # Get member count
        members = await db.get_channel_members(channel_id)
        channel["member_count"] = len(members)
        
        return ChannelResponse(**channel)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_channel: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.post("/{channel_id}/join")
async def join_channel(
    channel_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Join a channel"""
    try:
        # Check if channel exists
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # Check if user is already a member
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        if channel_id in user_channel_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Already a member of this channel"
            )
        
        # Add user to channel
        member_data = {
            "user_id": current_user.id,
            "channel_id": channel_id,
            "role": "user"
        }
        
        new_member = await db.add_channel_member(member_data)
        if not new_member:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to join channel"
            )
        
        return {"message": "Successfully joined channel"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in join_channel: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.delete("/{channel_id}/leave")
async def leave_channel(
    channel_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Leave a channel"""
    try:
        # Check if channel exists
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # Check if user is a member
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        if channel_id not in user_channel_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Not a member of this channel"
            )
        
        # Check if user is the creator (admin)
        if channel["created_by"] == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Channel creator cannot leave. Transfer ownership or delete the channel."
            )
        
        # Remove user from channel (you'll need to implement this in database.py)
        # await db.remove_channel_member(current_user.id, channel_id)
        
        return {"message": "Successfully left channel"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in leave_channel: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/{channel_id}/members")
async def get_channel_members(
    channel_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all members of a channel"""
    try:
        # Check if channel exists
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # Check if user is member of channel
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        if channel_id not in user_channel_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this channel"
            )
        
        # Get members
        members = await db.get_channel_members(channel_id)
        return members
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_channel_members: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 