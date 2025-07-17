from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from models import UserResponse
from auth import get_current_user
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


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