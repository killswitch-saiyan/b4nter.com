from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from models import MessageCreate, MessageResponse, UserResponse
from auth import get_current_user
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("/", response_model=MessageResponse)
async def create_message(
    message_data: MessageCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new message"""
    try:
        # Validate message data
        if not message_data.channel_id and not message_data.recipient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message must be sent to a channel or user"
            )
        
        if message_data.channel_id and message_data.recipient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message cannot be sent to both channel and user"
            )
        
        # Check permissions
        if message_data.channel_id:
            # Check if user is member of channel
            user_channels = await db.get_user_channels(current_user.id)
            user_channel_ids = [c.get("channel_id") for c in user_channels]
            
            if message_data.channel_id not in user_channel_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not a member of this channel"
                )
        
        if message_data.recipient_id:
            # Check if recipient exists
            recipient = await db.get_user_by_id(message_data.recipient_id)
            if not recipient:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Recipient not found"
                )
        
        # Create message data
        message_dict = message_data.dict()
        message_dict["sender_id"] = current_user.id
        
        # Create message in database
        new_message = await db.create_message(message_dict)
        if not new_message:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create message"
            )
        
        # Get sender info
        sender = await db.get_user_by_id(current_user.id)
        
        # Return message response
        message_response = MessageResponse(
            id=new_message["id"],
            content=message_data.content,
            sender_id=current_user.id,
            sender_name=sender.get("full_name") or sender.get("username"),
            channel_id=message_data.channel_id,
            recipient_id=message_data.recipient_id,
            created_at=new_message["created_at"],
            updated_at=new_message["updated_at"]
        )
        
        return message_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/channel/{channel_id}", response_model=List[MessageResponse])
async def get_channel_messages(
    channel_id: str,
    limit: int = 50,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get messages for a channel"""
    try:
        # Check if user is member of channel
        user_channels = await db.get_user_channels(current_user.id)
        user_channel_ids = [c.get("channel_id") for c in user_channels]
        
        if channel_id not in user_channel_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this channel"
            )
        
        # Get messages
        messages = await db.get_channel_messages(channel_id, limit)
        
        # Convert to response format
        message_responses = []
        for msg in messages:
            sender_info = msg.get("users", {})
            message_response = MessageResponse(
                id=msg["id"],
                content=msg["content"],
                sender_id=msg["sender_id"],
                sender_name=sender_info.get("full_name") or sender_info.get("username"),
                channel_id=msg["channel_id"],
                recipient_id=msg.get("recipient_id"),
                created_at=msg["created_at"],
                updated_at=msg["updated_at"]
            )
            message_responses.append(message_response)
        
        return message_responses
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_channel_messages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/direct/{user_id}", response_model=List[MessageResponse])
async def get_direct_messages(
    user_id: str,
    limit: int = 50,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get direct messages between current user and another user"""
    try:
        # Check if other user exists
        other_user = await db.get_user_by_id(user_id)
        if not other_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get direct messages
        messages = await db.get_direct_messages(current_user.id, user_id, limit)
        
        # Convert to response format
        message_responses = []
        for msg in messages:
            sender_info = msg.get("users", {})
            message_response = MessageResponse(
                id=msg["id"],
                content=msg["content"],
                sender_id=msg["sender_id"],
                sender_name=sender_info.get("full_name") or sender_info.get("username"),
                channel_id=msg.get("channel_id"),
                recipient_id=msg.get("recipient_id"),
                created_at=msg["created_at"],
                updated_at=msg["updated_at"]
            )
            message_responses.append(message_response)
        
        return message_responses
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_direct_messages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/users")
async def get_users_for_direct_messages(current_user: UserResponse = Depends(get_current_user)):
    """Get all users for direct messaging (excluding blocked users)"""
    try:
        users = await db.get_users_for_dm_filtered(current_user.id)
        return users
    except Exception as e:
        logger.error(f"Error in get_users_for_direct_messages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 