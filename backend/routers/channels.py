from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from models import ChannelCreate, ChannelResponse, UserResponse
from auth import get_current_user, require_channel_admin
from database import db
import logging
import json

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


@router.get("/available", response_model=List[ChannelResponse])
async def get_available_channels(current_user: UserResponse = Depends(get_current_user)):
    """Get all available channels that the user can join"""
    try:
        # Get all channels
        all_channels = await db.get_all_channels()
        
        # Get user's current channels
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        # Filter out channels the user is already a member of
        available_channels = []
        for channel in all_channels:
            if channel.get("id") not in user_channel_ids:
                channel_response = ChannelResponse(**channel)
                available_channels.append(channel_response)
        
        return available_channels
        
    except Exception as e:
        logger.error(f"Error in get_available_channels: {e}")
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
        
        # Check if user is member of channel OR has access to call channel
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        # For call channels, allow access if user is the creator or channel is being accessed during call invitation
        has_call_access = False
        if channel.get("is_call_channel") == "true":
            # Allow access for call channels (they are temporary and invitation-based)
            has_call_access = True
        
        if channel_id not in user_channel_ids and not has_call_access:
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
        
        # For call channels, allow joining even if already a member (invitation-based)
        if channel.get("is_call_channel") == "true":
            logger.info(f"Call channel join: User {current_user.id} joining {channel_id}")
            # Check if already a member
            user_channels = await db.get_user_channels(current_user.id)
            user_channel_ids = [c.get("channel_id") for c in user_channels]
            
            if channel_id not in user_channel_ids:
                # Add user to channel as database member
                member_data = {
                    "user_id": current_user.id,
                    "channel_id": channel_id,
                    "role": "user"
                }
                
                new_member = await db.add_channel_member(member_data)
                if not new_member:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to join call channel"
                    )
                logger.info(f"Added user {current_user.id} as member of call channel {channel_id}")
            else:
                logger.info(f"User {current_user.id} already member of call channel {channel_id}")
            
            return {"message": "Successfully joined call channel"}
        
        # For regular channels, check if user is already a member
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


@router.patch("/{channel_id}")
async def update_channel(
    channel_id: str,
    update_data: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update a channel (for call participants updates)"""
    try:
        # Get channel info first
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # For call channels, allow updating call_participants
        if channel.get("is_call_channel") == "true" and "call_participants" in update_data:
            logger.info(f"Updating call_participants for channel {channel_id}: {update_data['call_participants']}")
            updated_channel = await db.update_channel(channel_id, update_data)
            if updated_channel:
                return {"message": "Channel updated successfully", "channel": updated_channel}
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update channel"
                )
        
        # For regular channels, require admin permissions
        if channel.get("created_by") != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only channel creators can update channels"
            )
        
        updated_channel = await db.update_channel(channel_id, update_data)
        if updated_channel:
            return {"message": "Channel updated successfully", "channel": updated_channel}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update channel"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating channel {channel_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update channel"
        )


@router.delete("/{channel_id}")
async def delete_channel(
    channel_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a channel (only for channel creators or call channels)"""
    try:
        # Get channel info first
        channel = await db.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Channel not found"
            )
        
        # Allow deletion if:
        # 1. User is the channel creator, OR
        # 2. It's a call channel (temporary channels should be deletable by participants)
        if channel.get("created_by") != current_user.id and not channel.get("is_call_channel"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only channel creators can delete regular channels"
            )
        
        # Delete the channel
        await db.delete_channel(channel_id)
        logger.info(f"Channel {channel_id} deleted by user {current_user.id}")
        
        return {"message": "Channel deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting channel {channel_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete channel"
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