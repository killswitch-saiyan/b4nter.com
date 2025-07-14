from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socketio
from config import settings, cors_origins_list
from routers import auth, channels, messages
from socket_manager import sio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="B4nter API",
    description="A Slack-like messaging platform for soccer communities",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(channels.router)
app.include_router(messages.router)

# Create Socket.IO app
socket_app = socketio.ASGIApp(sio, app)

# Mount Socket.IO app
app.mount("/socket.io", socket_app)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to B4nter API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    ) 