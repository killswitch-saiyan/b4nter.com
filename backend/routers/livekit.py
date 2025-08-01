from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import User
import os
from livekit import api
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/livekit", tags=["livekit"])

class TokenRequest(BaseModel):
    roomName: str
    participantName: str

@router.post("/token")
async def get_livekit_token(
    request: TokenRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate a LiveKit access token for the current user"""
    
    try:
        # LiveKit configuration - you'll need to set these environment variables
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL", "wss://localhost:7880")
        
        if not api_key or not api_secret:
            logger.error("LiveKit API key or secret not configured")
            raise HTTPException(
                status_code=500, 
                detail="LiveKit not configured properly"
            )
        
        # Create token with permissions
        token = (
            api.AccessToken(api_key, api_secret)
            .with_identity(current_user.username)
            .with_name(current_user.username)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=request.roomName,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                )
            )
        )
        
        jwt_token = token.to_jwt()
        
        logger.info(f"Generated LiveKit token for user {current_user.username} in room {request.roomName}")
        
        return {
            "token": jwt_token,
            "url": livekit_url,
            "roomName": request.roomName
        }
        
    except Exception as e:
        logger.error(f"Error generating LiveKit token: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate LiveKit token: {str(e)}"
        )

@router.get("/rooms")
async def list_rooms(current_user: User = Depends(get_current_user)):
    """List available LiveKit rooms"""
    
    try:
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        
        if not api_key or not api_secret:
            raise HTTPException(
                status_code=500, 
                detail="LiveKit not configured properly"
            )
        
        # Create LiveKit API client
        lk_api = api.LiveKitAPI(livekit_url, api_key, api_secret)
        
        # List rooms
        rooms = await lk_api.room.list_rooms(api.ListRoomsRequest())
        
        return {
            "rooms": [
                {
                    "name": room.name,
                    "num_participants": room.num_participants,
                    "creation_time": room.creation_time,
                }
                for room in rooms.rooms
            ]
        }
        
    except Exception as e:
        logger.error(f"Error listing LiveKit rooms: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list rooms: {str(e)}"
        )