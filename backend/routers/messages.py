from fastapi import APIRouter, HTTPException, status, Depends, Body, UploadFile, File
from typing import List, Optional
from models import MessageCreate, MessageResponse, UserResponse
from auth import get_current_user
from database import db
import logging
from pydantic import BaseModel
from config import settings
import uuid

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
            
            # Check if recipient has blocked the sender
            is_blocked = await db.is_user_blocked(message_data.recipient_id, current_user.id)
            if is_blocked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot send message to this user - you have been blocked"
                )
            
            # Check if sender has blocked the recipient
            sender_blocked_recipient = await db.is_user_blocked(current_user.id, message_data.recipient_id)
            if sender_blocked_recipient:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot send message to blocked user - unblock them first"
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
        if not sender:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get sender information"
            )
        
        # Return message response
        message_response = MessageResponse(
            id=new_message["id"],
            content=message_data.content,
            sender_id=current_user.id,
            sender_name=sender.get("full_name") or sender.get("username"),
            channel_id=message_data.channel_id,
            recipient_id=message_data.recipient_id,
            created_at=new_message["created_at"],
            updated_at=new_message["updated_at"],
            sender={
                "id": current_user.id,
                "username": sender.get("username"),
                "full_name": sender.get("full_name"),
                "avatar_url": sender.get("avatar_url")
            }
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
        message_ids = [msg["id"] for msg in messages]
        reactions_by_message = await db.get_reactions_for_messages(message_ids)
        print("DEBUG: reactions_by_message", reactions_by_message)
        
        # Convert to response format
        message_responses = []
        for msg in messages:
            sender_info = msg.get("users", {})
            reactions = reactions_by_message.get(msg["id"], [])
            print(f"DEBUG: msg id {msg['id']} reactions: {reactions}")
            message_response = MessageResponse(
                id=msg["id"],
                content=msg["content"],
                sender_id=msg["sender_id"],
                sender_name=sender_info.get("full_name") or sender_info.get("username"),
                channel_id=msg["channel_id"],
                recipient_id=msg.get("recipient_id"),
                created_at=msg["created_at"],
                updated_at=msg["updated_at"],
                sender={
                    "id": msg["sender_id"],
                    "username": sender_info.get("username"),
                    "full_name": sender_info.get("full_name"),
                    "avatar_url": sender_info.get("avatar_url")
                },
                reactions=reactions,
                image_url=msg.get("image_url")
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
        
        # Check blocking status
        current_user_blocked_other = await db.is_user_blocked(current_user.id, user_id)
        other_blocked_current_user = await db.is_user_blocked(user_id, current_user.id)
        
        # Get direct messages
        messages = await db.get_direct_messages(current_user.id, user_id, limit)
        # (No filtering here: always return all messages between the two users)
        
        message_ids = [msg["id"] for msg in messages]
        reactions_by_message = await db.get_reactions_for_messages(message_ids)
        print("DEBUG: reactions_by_message", reactions_by_message)
        
        # Convert to response format
        message_responses = []
        for msg in messages:
            sender_info = msg.get("users", {})
            reactions = reactions_by_message.get(msg["id"], [])
            print(f"DEBUG: msg id {msg['id']} reactions: {reactions}")
            message_response = MessageResponse(
                id=msg["id"],
                content=msg["content"],
                sender_id=msg["sender_id"],
                sender_name=sender_info.get("full_name") or sender_info.get("username"),
                channel_id=msg.get("channel_id"),
                recipient_id=msg.get("recipient_id"),
                created_at=msg["created_at"],
                updated_at=msg["updated_at"],
                sender={
                    "id": msg["sender_id"],
                    "username": sender_info.get("username"),
                    "full_name": sender_info.get("full_name"),
                    "avatar_url": sender_info.get("avatar_url")
                },
                reactions=reactions,
                image_url=msg.get("image_url")
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

class ReactionRequest(BaseModel):
    emoji: str

@router.post("/message/{message_id}/reactions", status_code=201)
async def add_reaction(message_id: str, data: ReactionRequest, current_user: UserResponse = Depends(get_current_user)):
    reaction = await db.add_reaction(message_id, current_user.id, data.emoji)
    if not reaction:
        raise HTTPException(status_code=400, detail="Could not add reaction")
    return reaction

@router.delete("/message/{message_id}/reactions", status_code=204)
async def remove_reaction(message_id: str, data: ReactionRequest = Body(...), current_user: UserResponse = Depends(get_current_user)):
    result = await db.remove_reaction(message_id, current_user.id, data.emoji)
    if not result:
        raise HTTPException(status_code=404, detail="Reaction not found")
    return {"ok": True}

@router.get("/message/{message_id}/reactions")
async def get_reactions(message_id: str, current_user: UserResponse = Depends(get_current_user)):
    reactions = await db.get_reactions_for_message(message_id)
    return reactions 

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    """Upload an image to Supabase Storage and return its public URL"""
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        # Generate a unique filename
        ext = file.filename.split('.')[-1]
        filename = f"{current_user.id}/{uuid.uuid4()}.{ext}"
        bucket = "chat-images"
        # Read file content
        file_bytes = await file.read()
        # Upload to Supabase Storage
        storage = db.client.storage
        res = storage.from_(bucket).upload(filename, file_bytes, {"content-type": file.content_type})
        if hasattr(res, "status_code") and res.status_code >= 400:
            # Try to get error message from response
            try:
                error_detail = res.json() if hasattr(res, "json") else res.text
            except Exception:
                error_detail = str(res)
            raise HTTPException(status_code=500, detail=f"Failed to upload image: {error_detail}")
        # Get public URL
        public_url = storage.from_(bucket).get_public_url(filename)
        return {"url": public_url}
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading image: {e}") 