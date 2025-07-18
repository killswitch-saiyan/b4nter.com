from fastapi import APIRouter, HTTPException
from database import db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        users = await db.get_all_users()
        
        return {
            "status": "healthy",
            "database": "connected",
            "users_count": len(users) if users else 0,
            "timestamp": "2024-01-01T00:00:00Z"  # You can add proper timestamp here
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@router.get("/database")
async def database_health():
    """Database health check"""
    try:
        # Test database connection by getting users
        users = await db.get_all_users()
        
        return {
            "status": "connected",
            "users_count": len(users) if users else 0,
            "tables": ["users", "channels", "channel_members", "messages"]
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

@router.get("/auth")
async def auth_health():
    """Authentication health check"""
    try:
        # Test authentication by trying to get a user
        test_user = await db.get_user_by_email("admin@b4nter.com")
        
        return {
            "status": "working",
            "test_user_found": test_user is not None,
            "auth_providers": ["email", "google"]
        }
    except Exception as e:
        logger.error(f"Auth health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication check failed: {str(e)}") 