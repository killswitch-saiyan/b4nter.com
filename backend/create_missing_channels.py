#!/usr/bin/env python3
"""
Script to create missing channels in the database
"""

import asyncio
import logging
from database import db

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_missing_channels():
    """Create missing channels"""
    try:
        logger.info("Checking for missing channels...")
        
        # Check if free-for-all channel exists
        free_channel = await db.get_channel_by_name('free-for-all')
        
        if not free_channel:
            logger.info("Creating 'free-for-all' channel...")
            
            # Get admin user to create the channel
            admin_user = await db.get_user_by_email('admin@b4nter.com')
            if not admin_user:
                logger.error("Admin user not found. Creating channel with first available user...")
                users = await db.get_all_users()
                if not users:
                    logger.error("No users found in database")
                    return False
                admin_user = users[0]
            
            # Create the free-for-all channel
            channel_data = {
                "name": "free-for-all",
                "description": "General discussion channel for all users",
                "created_by": admin_user["id"]
            }
            
            new_channel = await db.create_channel(channel_data)
            if new_channel:
                logger.info(f"✅ Created 'free-for-all' channel with ID: {new_channel['id']}")
                
                # Add all existing users to this channel
                users = await db.get_all_users()
                for user in users:
                    member_data = {
                        "user_id": user["id"],
                        "channel_id": new_channel["id"],
                        "role": "user"
                    }
                    result = await db.add_channel_member(member_data)
                    if result:
                        logger.info(f"✅ Added user {user['username']} to free-for-all channel")
                    else:
                        logger.warning(f"⚠️ Failed to add user {user['username']} to free-for-all channel")
                
                return True
            else:
                logger.error("❌ Failed to create 'free-for-all' channel")
                return False
        else:
            logger.info(f"✅ 'free-for-all' channel already exists with ID: {free_channel['id']}")
            return True
            
    except Exception as e:
        logger.error(f"❌ Error creating missing channels: {e}")
        return False

async def main():
    """Main function"""
    logger.info("🚀 Creating missing channels...")
    
    success = await create_missing_channels()
    
    if success:
        logger.info("🎉 Channel setup completed successfully!")
    else:
        logger.error("❌ Channel setup failed!")

if __name__ == "__main__":
    asyncio.run(main()) 