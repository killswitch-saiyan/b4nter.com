from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from models import UserResponse
from config import settings
from livekit.api import AccessToken, VideoGrants
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/livekit", tags=["livekit"])

@router.get("/config-check")
async def check_livekit_config():
    """Check if LiveKit is configured properly (for debugging)"""
    try:
        # Test token generation
        if settings.livekit_api_key and settings.livekit_api_secret:
            token = AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
            token.identity = "test_user"
            token.name = "test_user"
            video_grants = VideoGrants(
                room_join=True,
                room="test-room",
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
            token.video = video_grants
            test_jwt = token.to_jwt()
            token_works = len(test_jwt) > 0
        else:
            token_works = False
            
        return {
            "livekit_configured": bool(settings.livekit_api_key and settings.livekit_api_secret),
            "has_api_key": bool(settings.livekit_api_key),
            "has_api_secret": bool(settings.livekit_api_secret),
            "livekit_url": settings.livekit_url,
            "api_key_length": len(settings.livekit_api_key) if settings.livekit_api_key else 0,
            "secret_length": len(settings.livekit_api_secret) if settings.livekit_api_secret else 0,
            "token_generation_works": token_works
        }
    except Exception as e:
        return {
            "error": str(e),
            "livekit_configured": False
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
        token = AccessToken(api_key, api_secret)
        token.identity = current_user.username
        token.name = current_user.username
        
        # Add video grants
        video_grants = VideoGrants(
            room_join=True,
            room=request.roomName,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        )
        token.video = video_grants
        
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

# Room listing endpoint removed for simplicity - token generation is sufficient for basic video calling