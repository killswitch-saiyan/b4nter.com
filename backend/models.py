from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    public_key: Optional[str] = None  # Add public key for E2EE


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserResponseWithBlocking(UserResponse):
    is_blocked: bool = False
    
    class Config:
        from_attributes = True


class ChannelBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: bool = False
    # Call channel fields
    is_call_channel: Optional[str] = None  # VARCHAR field
    call_type: Optional[str] = None  # VARCHAR field  
    call_participants: Optional[str] = None  # VARCHAR field (JSON string)
    call_started_at: Optional[str] = None  # VARCHAR field


class ChannelCreate(ChannelBase):
    pass


class ChannelResponse(ChannelBase):
    id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    
    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    content: str
    channel_id: Optional[str] = None
    recipient_id: Optional[str] = None
    is_encrypted: bool = False  # Add flag to indicate if message is encrypted
    image_url: Optional[str] = None  # Add image_url for image/meme sharing


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: str
    sender_id: str
    sender_name: str
    channel_id: Optional[str] = None
    recipient_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    sender: Optional[dict] = None
    reactions: Optional[list] = None
    is_encrypted: bool = False  # Add flag to indicate if message is encrypted
    image_url: Optional[str] = None  # Add image_url for image/meme sharing
    
    class Config:
        from_attributes = True


class ChannelMember(BaseModel):
    user_id: str
    channel_id: str
    role: UserRole = UserRole.USER
    joined_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class RegisterData(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class CreateChannelData(BaseModel):
    name: str
    description: Optional[str] = None


class ReactionRequest(BaseModel):
    emoji: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class SocketEvent(BaseModel):
    event: str
    data: dict


# Groups and Soccer Leagues Models
class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    league_id: Optional[str] = None  # SportsDB league ID
    logo_url: Optional[str] = None
    is_active: bool = True


class GroupCreate(GroupBase):
    pass


class GroupResponse(GroupBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MatchChannelBase(BaseModel):
    group_id: str
    match_date: str  # YYYY-MM-DD format
    home_team: str
    away_team: str
    match_time: Optional[str] = None  # HH:MM:SS format
    sportsdb_event_id: Optional[str] = None


class MatchChannelCreate(MatchChannelBase):
    channel_id: str
    auto_delete_at: Optional[str] = None


class MatchChannelResponse(MatchChannelBase):
    id: str
    channel_id: str
    auto_delete_at: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Live score data (populated from live_match_data table)
    home_score: int = 0
    away_score: int = 0
    match_status: str = "scheduled"  # scheduled, live, finished
    match_minute: Optional[str] = None
    
    # Group information
    group_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class LiveScoreData(BaseModel):
    home_score: int = 0
    away_score: int = 0
    match_status: str = "scheduled"
    match_minute: Optional[str] = None


class MatchSyncResult(BaseModel):
    synced_count: int
    errors: List[str]
    created_channels: List[str] 