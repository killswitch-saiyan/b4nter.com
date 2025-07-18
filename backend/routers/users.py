from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from typing import List, Optional
from models import UserResponse, UserResponseWithBlocking, UserCreate, Token, AuthResponse, GoogleAuthRequest
from auth import get_current_user
from database import db
import logging
import base64
import uuid
import os
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[UserResponse])
async def get_users(current_user: UserResponse = Depends(get_current_user)):
    """Get all users (for user search)"""
    try:
        users = await db.get_all_users()
        return users
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/for-dm", response_model=List[UserResponseWithBlocking])
async def get_users_for_dm(current_user: UserResponse = Depends(get_current_user)):
    """Get all users for DM (including blocked users with blocking status)"""
    try:
        users = await db.get_users_for_dm_filtered(current_user.id)
        return users
    except Exception as e:
        logger.error(f"Error getting users for DM: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.put("/public-key")
async def update_public_key(
    public_key: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update user's public key for E2EE"""
    try:
        result = await db.update_user_public_key(current_user.id, public_key)
        if result:
            return {"message": "Public key updated successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update public key"
            )
    except Exception as e:
        logger.error(f"Error updating public key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.get("/{user_id}/public-key")
async def get_user_public_key(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get user's public key for E2EE"""
    try:
        public_key = await db.get_user_public_key(user_id)
        if public_key:
            return {"public_key": public_key}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Public key not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting public key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.post("/{user_id}/block")
async def block_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Lock a user"""
    try:
        # Prevent self-blocking
        if user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot block yourself"
            )
        
        # Check if user exists
        target_user = await db.get_user_by_id(user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check if already blocked
        is_blocked = await db.is_user_blocked(current_user.id, user_id)
        if is_blocked:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already blocked"
            )
        
        # Block the user
        result = await db.block_user(current_user.id, user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to block user"
            )
        
        return {"message": "User blocked successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in block_user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.delete("/{user_id}/block")
async def unblock_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Unblock a user"""
    try:
        # Check if user exists
        target_user = await db.get_user_by_id(user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check if user is blocked
        is_blocked = await db.is_user_blocked(current_user.id, user_id)
        if not is_blocked:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not blocked"
            )
        
        # Unblock the user
        result = await db.unblock_user(current_user.id, user_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to unblock user"
            )
        
        return {"message": "User unblocked successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in unblock_user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/blocks")
async def get_blocked_users(current_user: UserResponse = Depends(get_current_user)):
    """Get list of users blocked by current user"""
    try:
        blocked_user_ids = await db.get_blocked_users(current_user.id)
        
        # Get full user details for blocked users
        blocked_users = []
        for user_id in blocked_user_ids:
            user = await db.get_user_by_id(user_id)
            if user:
                blocked_users.append({
                    "id": user["id"],
                    "username": user["username"],
                    "full_name": user["full_name"],
                    "avatar_url": user.get("avatar_url")
                })
        
        return blocked_users
        
    except Exception as e:
        logger.error(f"Error in get_blocked_users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 

@router.post("/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    """Upload a profile picture"""
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Validate file size (max 5MB)
        if file.size and file.size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size must be less than 5MB"
            )
        
        # Read file content
        file_content = await file.read()
        
        # For now, we'll store the image as base64 in the database
        # In production, you'd want to use a proper file storage service like AWS S3
        image_base64 = base64.b64encode(file_content).decode('utf-8')
        data_url = f"data:{file.content_type};base64,{image_base64}"
        
        # Update user's avatar_url
        result = await db.update_user(current_user.id, {"avatar_url": data_url})
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile picture"
            )
        
        return {
            "message": "Profile picture updated successfully",
            "avatar_url": data_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading profile picture: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 

class ProfileUpdateRequest(BaseModel):
    username: str
    full_name: str
    email: str

@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: ProfileUpdateRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update user profile information"""
    try:
        # Check if username is already taken by another user
        if profile_data.username != current_user.username:
            existing_user = await db.get_user_by_username(profile_data.username)
            if existing_user and existing_user["id"] != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
        
        # Check if email is already taken by another user
        if profile_data.email != current_user.email:
            existing_user = await db.get_user_by_email(profile_data.email)
            if existing_user and existing_user["id"] != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already taken"
                )
        
        # Update user profile
        update_data = {
            "username": profile_data.username,
            "full_name": profile_data.full_name,
            "email": profile_data.email
        }
        
        result = await db.update_user(current_user.id, update_data)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile"
            )
        
        return UserResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        ) 