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


class ChannelBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: bool = False


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