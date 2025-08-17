#!/usr/bin/env python3
"""
Script to update Manchester United channel widget URL to use Peacock TV link
This replaces the current widget with the Peacock TV streaming link
"""

import asyncio
import sys
import os
from datetime import date, timedelta

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db


async def update_manutd_widget():
    """Update Manchester United channel widget URL to Peacock TV link"""
    print("Updating Manchester United channel widget URL...")
    print("=" * 60)
    
    # The Peacock TV link for Manchester United
    peacock_url = "https://www.peacocktv.com/watch/playback/event/PCKSLE:5019469/19951cb5-40e8-3a10-8a3a-56476fc0ab25"
    
    try:
        # Find Manchester United match channels using a simpler query
        print("Searching for Manchester United match channels...")
        
        # Get all match channels directly without joins
        from database import run_sync_in_thread
        response = await run_sync_in_thread(
            lambda: db.client.table('match_channels').select('*').execute()
        )
        
        match_channels = response.data or []
        manutd_channels = []
        
        for channel in match_channels:
            home_team = channel.get('home_team', '').lower()
            away_team = channel.get('away_team', '').lower()
            
            # Check if Manchester United is involved in this match
            if ('manchester united' in home_team or 'man utd' in home_team or 'manchester' in home_team) or \
               ('manchester united' in away_team or 'man utd' in away_team or 'manchester' in away_team):
                manutd_channels.append(channel)
        
        print(f"Found {len(manutd_channels)} Manchester United match channels")
        
        if not manutd_channels:
            print("No Manchester United match channels found!")
            print("Make sure there are active match channels for Manchester United")
            return
        
        # Update each Manchester United channel
        updated_count = 0
        for channel in manutd_channels:
            print(f"\nUpdating channel: {channel.get('home_team')} vs {channel.get('away_team')}")
            print(f"  - Channel ID: {channel.get('id')}")
            print(f"  - Current widget URL: {channel.get('widget_url', 'None')}")
            
            # Update the widget URL to use Peacock TV
            widget_data = {
                'widget_url': peacock_url,
                'widget_provider': 'custom',  # Set to custom since it's a direct Peacock link
                'widget_enabled': True
            }
            
            # Update the match channel
            result = await db.update_match_widget(channel.get('id'), widget_data)
            
            if result:
                print(f"  ✅ Successfully updated widget URL to Peacock TV")
                updated_count += 1
            else:
                print(f"  ❌ Failed to update widget URL")
        
        # Also check friendly matches
        print("\nChecking friendly matches...")
        response = await run_sync_in_thread(
            lambda: db.client.table('friendly_matches').select('*').execute()
        )
        
        friendly_matches = response.data or []
        manutd_friendlies = []
        
        for friendly in friendly_matches:
            home_team = friendly.get('home_team', '').lower()
            away_team = friendly.get('away_team', '').lower()
            
            if ('manchester united' in home_team or 'man utd' in home_team or 'manchester' in home_team) or \
               ('manchester united' in away_team or 'man utd' in away_team or 'manchester' in away_team):
                manutd_friendlies.append(friendly)
        
        print(f"Found {len(manutd_friendlies)} Manchester United friendly matches")
        
        for friendly in manutd_friendlies:
            print(f"\nUpdating friendly: {friendly.get('home_team')} vs {friendly.get('away_team')}")
            print(f"  - Friendly ID: {friendly.get('id')}")
            print(f"  - Current widget URL: {friendly.get('widget_url', 'None')}")
            
            # Update the widget URL to use Peacock TV
            widget_data = {
                'widget_url': peacock_url,
                'widget_provider': 'custom',
                'widget_enabled': True
            }
            
            # Update the friendly match
            result = await db.update_friendly_widget(friendly.get('id'), widget_data)
            
            if result:
                print(f"  ✅ Successfully updated widget URL to Peacock TV")
                updated_count += 1
            else:
                print(f"  ❌ Failed to update widget URL")
        
        print("\n" + "=" * 60)
        print(f"Update Summary:")
        print(f"  - Total channels updated: {updated_count}")
        print(f"  - New widget URL: {peacock_url}")
        print(f"  - Widget provider: custom (Peacock TV)")
        print(f"  - Widget enabled: true")
        
        print("\nNext Steps:")
        print("1. Start the backend server: python main.py")
        print("2. Start the frontend: npm run dev")
        print("3. Navigate to Manchester United match channels")
        print("4. The widget should now show the Peacock TV stream instead of live scores")
        
        print("\n" + "=" * 60)
        
    except Exception as e:
        print(f"Error updating Manchester United widget: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Main function"""
    print("Manchester United Widget Update Script")
    print("This script will update all Manchester United channels to use Peacock TV link")
    print()
    
    # Confirm with user
    response = input("Do you want to proceed? (y/N): ").strip().lower()
    if response not in ['y', 'yes']:
        print("Update cancelled.")
        return
    
    await update_manutd_widget()


if __name__ == "__main__":
    asyncio.run(main())
