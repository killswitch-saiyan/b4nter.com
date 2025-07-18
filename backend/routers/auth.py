from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models import UserCreate, UserLogin, UserResponse, Token, AuthResponse, GoogleAuthRequest
from auth import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    authenticate_user,
    verify_google_token,
    get_or_create_google_user,
    get_current_user
)
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()


@router.post("/register", response_model=AuthResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    try:
        # Check if user already exists (email or username)
        existing_user = await db.get_user_by_email(user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )
        existing_username = await db.get_user_by_username(user_data.username)
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this username already exists"
            )
        
        # Hash password
        hashed_password = get_password_hash(user_data.password)
        
        # Create user data
        user_dict = user_data.dict()
        user_dict["password_hash"] = hashed_password
        user_dict["auth_provider"] = "email"
        
        # Remove password from dict
        del user_dict["password"]
        
        # Create user in database
        new_user = await db.create_user(user_dict)
        if not new_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user"
            )

        # Add new user to the 'free-for-all' channel by default
        try:
            free_channel = await db.get_channel_by_name('free-for-all')
            logger.info(f"Found free-for-all channel: {free_channel}")
            if free_channel:
                member_data = {
                    "user_id": new_user["id"],
                    "channel_id": free_channel["id"],
                    "role": "user"
                }
                logger.info(f"Adding user to free-for-all channel with data: {member_data}")
                result = await db.add_channel_member(member_data)
                logger.info(f"Add channel member result: {result}")
                if not result:
                    logger.error(f"Failed to add user {new_user['id']} to free-for-all channel {free_channel['id']}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to add user to free-for-all channel. Please contact support."
                    )
            else:
                logger.error("free-for-all channel not found - user will not be added to any default channel")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="free-for-all channel not found. Please contact support."
                )
        except Exception as e:
            logger.error(f"Error adding user to free-for-all channel: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error adding user to free-for-all channel: {e}"
            )

        # Create access token
        access_token = create_access_token(data={"sub": new_user["id"]})
        
        # Return token and user info
        return AuthResponse(
            access_token=access_token,
            token_type="bearer",
            user=UserResponse(**new_user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in register: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.post("/login", response_model=AuthResponse)
async def login(user_credentials: UserLogin):
    """Login user with email and password"""
    try:
        # Authenticate user
        user = await authenticate_user(user_credentials.email, user_credentials.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": user["id"]})
        
        # Return token and user info
        return AuthResponse(
            access_token=access_token,
            token_type="bearer",
            user=UserResponse(**user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.post("/google", response_model=AuthResponse)
async def google_auth(auth_request: GoogleAuthRequest):
    """Authenticate user with Google OAuth"""
    try:
        # Verify Google token
        google_user_info = await verify_google_token(auth_request.id_token)
        if not google_user_info:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token"
            )
        
        # Get or create user
        user = await get_or_create_google_user(google_user_info)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user"
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": user["id"]})
        
        # Return token and user info
        return AuthResponse(
            access_token=access_token,
            token_type="bearer",
            user=UserResponse(**user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in google_auth: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Get current user information"""
    return current_user


@router.post("/refresh")
async def refresh_token(current_user: UserResponse = Depends(get_current_user)):
    """Refresh access token"""
    try:
        # Create new access token
        access_token = create_access_token(data={"sub": current_user.id})
        
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        logger.error(f"Error in refresh_token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 