#!/usr/bin/env python3
"""
Database Schema Fix Script
This script checks and fixes the database schema, specifically ensuring the public_key column exists.
"""

import asyncio
import logging
from database import supabase

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def check_and_fix_schema():
    """Check and fix the database schema"""
    try:
        logger.info("Checking database schema...")
        
        # Check if public_key column exists in users table
        try:
            # Try to select the public_key column
            response = supabase.table('users').select('public_key').limit(1).execute()
            logger.info("✅ public_key column exists in users table")
            return True
        except Exception as e:
            if "Could not find the 'public_key' column" in str(e):
                logger.warning("❌ public_key column missing from users table")
                return await add_public_key_column()
            else:
                logger.error(f"Unexpected error checking schema: {e}")
                return False
                
    except Exception as e:
        logger.error(f"Error checking database schema: {e}")
        return False

async def add_public_key_column():
    """Add the public_key column to the users table"""
    try:
        logger.info("Adding public_key column to users table...")
        
        # Execute SQL to add the column
        sql = """
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS public_key TEXT;
        """
        
        response = supabase.rpc('exec_sql', {'sql': sql}).execute()
        logger.info("✅ Successfully added public_key column to users table")
        return True
        
    except Exception as e:
        logger.error(f"Error adding public_key column: {e}")
        
        # Try alternative approach using direct SQL
        try:
            logger.info("Trying alternative approach...")
            
            # Use the SQL editor approach
            sql = """
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'public_key'
                ) THEN
                    ALTER TABLE users ADD COLUMN public_key TEXT;
                    RAISE NOTICE 'Added public_key column to users table';
                ELSE
                    RAISE NOTICE 'public_key column already exists in users table';
                END IF;
            END $$;
            """
            
            # This would need to be run in Supabase SQL Editor
            logger.info("Please run the following SQL in your Supabase SQL Editor:")
            logger.info("=" * 50)
            logger.info(sql)
            logger.info("=" * 50)
            
            return False
            
        except Exception as e2:
            logger.error(f"Alternative approach also failed: {e2}")
            return False

async def verify_schema():
    """Verify the schema is correct after fixes"""
    try:
        logger.info("Verifying schema...")
        
        # Test creating a user with public_key
        test_user_data = {
            "username": "test_user_schema",
            "email": "test_schema@example.com",
            "full_name": "Test User",
            "password_hash": "test_hash",
            "public_key": "test_public_key_123"
        }
        
        # Try to insert test user
        response = supabase.table('users').insert(test_user_data).execute()
        
        if response.data:
            logger.info("✅ Schema verification successful - can create users with public_key")
            
            # Clean up test user
            user_id = response.data[0]['id']
            supabase.table('users').delete().eq('id', user_id).execute()
            logger.info("✅ Test user cleaned up")
            
            return True
        else:
            logger.error("❌ Schema verification failed - no data returned")
            return False
            
    except Exception as e:
        logger.error(f"❌ Schema verification failed: {e}")
        return False

async def main():
    """Main function"""
    logger.info("Starting database schema check and fix...")
    
    # Check and fix schema
    schema_ok = await check_and_fix_schema()
    
    if schema_ok:
        # Verify the fix worked
        verification_ok = await verify_schema()
        
        if verification_ok:
            logger.info("🎉 Database schema is now correct!")
            return True
        else:
            logger.error("❌ Schema verification failed")
            return False
    else:
        logger.error("❌ Could not fix database schema")
        logger.info("Please run the migration manually in Supabase SQL Editor")
        return False

if __name__ == "__main__":
    result = asyncio.run(main())
    exit(0 if result else 1) 