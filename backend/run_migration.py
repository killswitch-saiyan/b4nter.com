#!/usr/bin/env python3
"""
Script to run the friendlies migration
"""

import asyncio
import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db


async def run_migration():
    """Run the friendly matches migration"""
    print("Running friendly matches migration...")
    print("=" * 60)
    
    try:
        # Read the migration file
        migration_file = "migrations/006_add_friendly_matches.sql"
        
        if not os.path.exists(migration_file):
            print(f"Migration file not found: {migration_file}")
            return False
        
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        print("Migration SQL loaded successfully")
        print("Note: This script cannot execute the SQL directly.")
        print("Please run this SQL in your Supabase dashboard or psql:")
        print("\n" + "=" * 60)
        print(migration_sql)
        print("=" * 60)
        
        # Try to check if tables exist
        print("\nChecking current database state...")
        
        # This will fail if tables don't exist, which is expected
        try:
            friendly_matches = await db.get_friendly_matches()
            print(f"friendly_matches table exists with {len(friendly_matches)} records")
        except Exception as e:
            print(f"friendly_matches table does not exist: {e}")
            print("Please run the migration SQL above in your Supabase dashboard")
        
        return True
        
    except Exception as e:
        print(f"Error running migration: {e}")
        return False


async def create_manual_test_data():
    """Create test friendly match data manually"""
    print("\nCreating manual test data...")
    print("=" * 60)
    
    try:
        from datetime import date, timedelta
        import uuid
        
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        
        # Create manual test data by inserting directly
        test_friendly = {
            "channel_id": str(uuid.uuid4()),
            "match_date": tomorrow,
            "match_time": "19:30:00",
            "home_team": "Manchester United",
            "away_team": "Fiorentina",
            "venue": "Old Trafford",
            "match_type": "club_friendly"
        }
        
        print("Test data to be created:")
        print(f"  - Match: {test_friendly['home_team']} vs {test_friendly['away_team']}")
        print(f"  - Date: {test_friendly['match_date']}")
        print(f"  - Time: {test_friendly['match_time']}")
        print(f"  - Venue: {test_friendly['venue']}")
        
        # This will create the friendly if the tables exist
        result = await db.create_friendly_match(test_friendly)
        
        if result:
            print("Test friendly match created successfully!")
            return True
        else:
            print("Failed to create test friendly match")
            return False
            
    except Exception as e:
        print(f"Error creating manual test data: {e}")
        return False


async def main():
    """Main function"""
    print("Friendly Matches Migration Runner")
    print("=" * 60)
    
    migration_result = await run_migration()
    
    if migration_result:
        # Try to create test data
        await create_manual_test_data()
    
    print("\nMigration runner completed!")
    print("If the migration SQL was shown above, please run it in Supabase dashboard.")


if __name__ == "__main__":
    asyncio.run(main())