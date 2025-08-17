from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from config import settings, cors_origins_list
from routers import auth, channels, messages, users, health, groups, matches, friendlies, widgets, match_lifecycle, automated_scheduler
from websocket_manager import websocket_manager
from scheduler import match_scheduler
from services.automated_match_scheduler import automated_match_scheduler
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="B4nter API",
    description="A Slack-like messaging platform for soccer communities",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(channels.router)
app.include_router(messages.router)
app.include_router(users.router)
app.include_router(health.router)
app.include_router(groups.router)
app.include_router(matches.router)
app.include_router(friendlies.router, prefix="/friendlies", tags=["friendlies"])
app.include_router(widgets.router, prefix="/widgets", tags=["widgets"])
app.include_router(match_lifecycle.router, prefix="/match-lifecycle", tags=["match-lifecycle"])
app.include_router(automated_scheduler.router, prefix="/scheduler", tags=["automated-scheduler"])

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting B4nter API...")
    # Start the match channel scheduler
    await match_scheduler.start()
    # Start the automated match scheduler with cron jobs
    automated_match_scheduler.start_scheduler()
    logger.info("B4nter API startup complete - All schedulers started")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down B4nter API...")
    # Stop the match channel scheduler
    await match_scheduler.stop()
    # Stop the automated match scheduler
    automated_match_scheduler.stop_scheduler()
    logger.info("B4nter API shutdown complete - All schedulers stopped")

@app.get("/")
async def root():
    return {"message": "Welcome to B4nter API", "version": "1.0.0", "docs": "/docs"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Add any health checks here
        return {"status": "healthy"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@app.get("/webrtc-config")
async def get_webrtc_config():
    """Get WebRTC configuration with STUN/TURN servers"""
    return {
        "iceServers": [
            # Google STUN servers
            {
                "urls": [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302"
                ]
            },
            # Additional STUN servers for better connectivity
            {
                "urls": [
                    "stun:stun.stunprotocol.org:3478",
                    "stun:stun.voiparound.com:3478",
                    "stun:stun.voipbuster.com:3478"
                ]
            },
            # Free TURN servers for NAT traversal
            {
                "urls": "turn:openrelay.metered.ca:80",
                "username": "openrelayproject",
                "credential": "openrelayproject"
            },
            {
                "urls": "turn:openrelay.metered.ca:443",
                "username": "openrelayproject", 
                "credential": "openrelayproject"
            },
            {
                "urls": "turn:openrelay.metered.ca:443?transport=tcp",
                "username": "openrelayproject",
                "credential": "openrelayproject"
            }
        ],
        "iceCandidatePoolSize": 10
    }

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    logger.info(f"WebSocket connection request from user {user_id}")
    await websocket.accept()
    logger.info(f"WebSocket accepted for user {user_id}")
    
    await websocket_manager.connect(websocket, user_id)
    logger.info(f"WebSocket manager connected for user {user_id}")
    
    try:
        logger.info(f"Starting message handling loop for user {user_id}")
        await websocket_manager.handle_websocket_message(websocket, user_id)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
        websocket_manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        websocket_manager.disconnect(user_id)

# Export the ASGI app for uvicorn
asgi_app = app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    ) 