from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import UserResponse
from config import settings
from livekit import api
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/livekit", tags=["livekit"])

@router.get("/config-check")
async def check_livekit_config():
    """Check if LiveKit is configured properly (for debugging)"""
    return {
        "livekit_configured": bool(settings.livekit_api_key and settings.livekit_api_secret),
        "has_api_key": bool(settings.livekit_api_key),
        "has_api_secret": bool(settings.livekit_api_secret),
        "livekit_url": settings.livekit_url,
        "api_key_length": len(settings.livekit_api_key) if settings.livekit_api_key else 0,
        "secret_length": len(settings.livekit_api_secret) if settings.livekit_api_secret else 0
    }

class TokenRequest(BaseModel):
    roomName: str
    participantName: str

@router.post("/token")
async def get_livekit_token(
    request: TokenRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Generate a LiveKit access token for the current user"""
    
    try:
        # LiveKit configuration from settings
        api_key = settings.livekit_api_key
        api_secret = settings.livekit_api_secret
        livekit_url = settings.livekit_url or "wss://localhost:7880"
        
        logger.info(f"LiveKit config check - API Key exists: {bool(api_key)}, Secret exists: {bool(api_secret)}, URL: {livekit_url}")
        
        if not api_key or not api_secret:
            logger.error(f"LiveKit not configured - API Key: {bool(api_key)}, Secret: {bool(api_secret)}")
            logger.error("Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in your .env file")
            raise HTTPException(
                status_code=500, 
                detail="LiveKit not configured properly - check environment variables"
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
async def list_rooms(current_user: UserResponse = Depends(get_current_user)):
    """List available LiveKit rooms"""
    
    try:
        api_key = settings.livekit_api_key
        api_secret = settings.livekit_api_secret
        livekit_url = settings.livekit_url or "ws://localhost:7880"
        
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