#!/usr/bin/env python3
"""
Script to create a test friendly match for Man United vs Fiorentina
This will help test the friendlies functionality
"""

import asyncio
import sys
import os
from datetime import date, timedelta

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.friendly_sync import create_test_friendly_match, sync_specific_friendly_match
from database import db


async def create_man_utd_vs_fiorentina():
    """Create the specific Man United vs Fiorentina friendly match"""
    print("Creating Man United vs Fiorentina friendly match...")
    print("=" * 60)
    
    try:
        # Tomorrow's date
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        
        print(f"Match Date: {tomorrow}")
        print(f"Teams: Manchester United vs Fiorentina")
        print(f"Venue: Old Trafford")
        print(f"Time: 19:30 GMT")
        print()
        
        # Try to sync from SportsDB first
        result = await sync_specific_friendly_match(
            home_team="Manchester United",
            away_team="Fiorentina",
            match_date=tomorrow
        )
        
        print("Sync Result:")
        print(f"  - Found in SportsDB: {'Yes' if result.get('found') else 'No'}")
        print(f"  - Matches synced: {result.get('synced_count', 0)}")
        print(f"  - Channels created: {len(result.get('created_channels', []))}")
        print(f"  - Errors: {len(result.get('errors', []))}")
        
        if result.get('created_channels'):
            print(f"  - Created channel: {result['created_channels'][0]}")
        
        if result.get('errors'):
            print("Errors encountered:")
            for error in result['errors']:
                print(f"    - {error}")
        
        # Check if the friendly was created
        friendly_matches = await db.get_tomorrows_friendly_matches()
        man_utd_match = None
        
        for match in friendly_matches:
            if ('manchester' in match.get('home_team', '').lower() and 
                'fiorentina' in match.get('away_team', '').lower()) or \
               ('fiorentina' in match.get('home_team', '').lower() and 
                'manchester' in match.get('away_team', '').lower()):
                man_utd_match = match
                break
        
        if man_utd_match:
            print("\nFriendly Match Created Successfully!")
            print("=" * 60)
            print("Match Details:")
            print(f"  - ID: {man_utd_match.get('id')}")
            print(f"  - Channel ID: {man_utd_match.get('channel_id')}")
            print(f"  - Home Team: {man_utd_match.get('home_team')}")
            print(f"  - Away Team: {man_utd_match.get('away_team')}")
            print(f"  - Date: {man_utd_match.get('match_date')}")
            print(f"  - Time: {man_utd_match.get('match_time')}")
            print(f"  - Venue: {man_utd_match.get('venue')}")
            print(f"  - Type: {man_utd_match.get('match_type')}")
            print(f"  - Status: {man_utd_match.get('match_status')}")
            
            if man_utd_match.get('home_team_logo'):
                print(f"  - Home Logo: {man_utd_match.get('home_team_logo')}")
            if man_utd_match.get('away_team_logo'):
                print(f"  - Away Logo: {man_utd_match.get('away_team_logo')}")
            
            print("\nNext Steps:")
            print("1. Start the backend server: python main.py")
            print("2. Start the frontend: npm run dev")
            print("3. Navigate to the app and expand the 'Friendlies' section")
            print("4. You should see the Man United vs Fiorentina match!")
        else:
            print("No Man United vs Fiorentina match found in database")
            print("The match might not have been created due to API limitations")
            print("or the teams weren't found in SportsDB")
        
        print("\n" + "=" * 60)
        
    except Exception as e:
        print(f"Error creating friendly match: {e}")
        import traceback
        traceback.print_exc()


async def show_all_friendly_matches():
    """Show all current friendly matches"""
    print("\nAll Current Friendly Matches:")
    print("=" * 60)
    
    try:
        today_matches = await db.get_todays_friendly_matches()
        tomorrow_matches = await db.get_tomorrows_friendly_matches()
        
        print(f"Today's matches: {len(today_matches)}")
        for match in today_matches:
            print(f"  - {match.get('home_team')} vs {match.get('away_team')} ({match.get('match_status')})")
        
        print(f"\nTomorrow's matches: {len(tomorrow_matches)}")
        for match in tomorrow_matches:
            print(f"  - {match.get('home_team')} vs {match.get('away_team')} ({match.get('match_status')})")
            
        if not today_matches and not tomorrow_matches:
            print("No friendly matches found")
            
    except Exception as e:
        print(f"Error fetching friendly matches: {e}")


async def main():
    """Run the test script"""
    print("Man United vs Fiorentina Friendly Match Creator")
    print("=" * 60)
    
    await create_man_utd_vs_fiorentina()
    await show_all_friendly_matches()
    
    print("\nScript completed!")
    print("Check the friendlies section in your app to see the match.")


if __name__ == "__main__":
    asyncio.run(main())