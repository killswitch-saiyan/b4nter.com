from pydantic_settings import BaseSettings
from typing import List, Optional
import os


class Settings(BaseSettings):
    # Supabase Configuration
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    
    # Google OAuth (optional)
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    
    # JWT Configuration
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiration: int = 3600
    
    # CORS Configuration
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002"
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    # LiveKit Configuration
    livekit_api_key: Optional[str] = None
    livekit_api_secret: Optional[str] = None
    livekit_url: Optional[str] = "wss://localhost:7880"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Load settings with required environment variables
settings = Settings()

# Parse CORS origins from environment variable
cors_origins_list = [origin.strip() for origin in settings.cors_origins.split(',') if origin.strip()]