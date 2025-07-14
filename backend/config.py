from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # Supabase Configuration
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    
    # Google OAuth
    google_client_id: str
    google_client_secret: str
    
    # JWT Configuration
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiration: int = 3600
    
    # CORS Configuration
    cors_origins: List[str] = ["http://localhost:3000"]
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Load settings
settings = Settings()

# Parse CORS origins from environment variable
if hasattr(settings, 'cors_origins') and isinstance(settings.cors_origins, str):
    settings.cors_origins = [origin.strip() for origin in settings.cors_origins.split(',')] 