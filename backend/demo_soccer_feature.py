#!/usr/bin/env python3
"""
Demo script for the Soccer Leagues Group Feature
This script demonstrates the key functionality of the soccer feature implementation.
"""

import asyncio
import sys
import os
from datetime import date, datetime, timedelta

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db
from services.sportsdb_client import sportsdb_client
from services.match_sync import sync_todays_matches
from services.live_score_service import update_live_scores


async def demo_groups_management():
    """Demonstrate groups/leagues management"""
    print("=" * 60)
    print("🏆 DEMO: Soccer Leagues Management")
    print("=" * 60)
    
    # Get all groups
    groups = await db.get_groups()
    print(f"\n📋 Found {len(groups)} soccer leagues:")
    for group in groups:
        print(f"  • {group['name']} (League ID: {group.get('league_id', 'N/A')})")
    
    return groups


async def demo_sportsdb_integration():
    """Demonstrate SportsDB API integration"""
    print("\n" + "=" * 60)
    print("⚽ DEMO: SportsDB API Integration")
    print("=" * 60)
    
    # Test API connectivity
    league_id = "4328"  # English Premier League
    print(f"\n🔌 Testing SportsDB API connectivity for league {league_id}...")
    
    try:
        # Get league info
        league_info = await sportsdb_client.get_league_info(league_id)
        if league_info:
            print(f"✅ League Info: {league_info['name']} ({league_info['country']})")
        else:
            print("❌ Could not fetch league info")
        
        # Get today's fixtures
        fixtures = await sportsdb_client.get_todays_fixtures(league_id)
        print(f"📅 Found {len(fixtures)} fixtures for today")
        
        if fixtures:
            for i, fixture in enumerate(fixtures[:3], 1):  # Show first 3
                match_data = sportsdb_client.parse_match_data(fixture)
                print(f"  {i}. {match_data['home_team']} vs {match_data['away_team']} ({match_data['match_status']})")
        
    except Exception as e:
        print(f"❌ API Error: {e}")
    
    finally:
        await sportsdb_client.close()


async def demo_match_sync():
    """Demonstrate match synchronization"""
    print("\n" + "=" * 60)
    print("🔄 DEMO: Match Synchronization")
    print("=" * 60)
    
    print("\n🎯 Syncing today's matches from SportsDB...")
    
    try:
        result = await sync_todays_matches()
        print(f"✅ Sync completed:")
        print(f"  • Matches synced: {result['synced_count']}")
        print(f"  • Errors: {len(result['errors'])}")
        
        if result['errors']:
            print("❌ Errors encountered:")
            for error in result['errors'][:3]:  # Show first 3 errors
                print(f"  • {error}")
        
        # Show today's match channels
        today_matches = await db.get_today_match_channels()
        print(f"\n📊 Today's match channels in database: {len(today_matches)}")
        
        for match in today_matches[:5]:  # Show first 5
            status_emoji = "🔴" if match.get('match_status') == 'live' else "⚪"
            print(f"  {status_emoji} {match.get('home_team')} vs {match.get('away_team')} ({match.get('group_name', 'Unknown League')})")
        
    except Exception as e:
        print(f"❌ Sync Error: {e}")


async def demo_live_scores():
    """Demonstrate live score updates"""
    print("\n" + "=" * 60)
    print("📊 DEMO: Live Score Updates")
    print("=" * 60)
    
    print("\n⚡ Updating live scores...")
    
    try:
        result = await update_live_scores()
        print(f"✅ Live score update completed:")
        print(f"  • Matches updated: {result['updated_count']}")
        print(f"  • Errors: {len(result['errors'])}")
        
        # Show live matches
        live_matches = await db.get_live_matches()
        print(f"\n🔴 Currently live matches: {len(live_matches)}")
        
        for match in live_matches:
            print(f"  ⚽ {match['home_team']} {match['home_score']}-{match['away_score']} {match['away_team']} ({match.get('match_minute', 'Live')})")
        
    except Exception as e:
        print(f"❌ Live score error: {e}")


async def demo_match_channels():
    """Demonstrate match channel creation and management"""
    print("\n" + "=" * 60)
    print("💬 DEMO: Match Channel Management")
    print("=" * 60)
    
    # Get today's match channels
    today_matches = await db.get_today_match_channels()
    print(f"\n📋 Today's match channels: {len(today_matches)}")
    
    if today_matches:
        print("\n🏟️ Match Channels:")
        for match in today_matches[:5]:
            channel_name = f"{match.get('match_date')} {match.get('home_team')} vs {match.get('away_team')}"
            score = f"{match.get('home_score', 0)}-{match.get('away_score', 0)}" if match.get('match_status') != 'scheduled' else "vs"
            status = match.get('match_status', 'scheduled').upper()
            
            print(f"  📺 {channel_name}")
            print(f"     Score: {match.get('home_team')} {score} {match.get('away_team')} ({status})")
            print(f"     League: {match.get('group_name', 'Unknown')}")
            print(f"     Channel ID: {match.get('channel_id')}")
            print()


async def demo_database_stats():
    """Show database statistics"""
    print("\n" + "=" * 60)
    print("📈 DEMO: Database Statistics")
    print("=" * 60)
    
    try:
        # Groups stats
        groups = await db.get_groups()
        print(f"\n📊 Database Statistics:")
        print(f"  • Total leagues: {len(groups)}")
        print(f"  • Active leagues: {len([g for g in groups if g.get('is_active')])}")
        
        # Today's matches
        today_matches = await db.get_today_match_channels()
        print(f"  • Today's matches: {len(today_matches)}")
        
        # Match status breakdown
        if today_matches:
            scheduled = len([m for m in today_matches if m.get('match_status') == 'scheduled'])
            live = len([m for m in today_matches if m.get('match_status') == 'live'])
            finished = len([m for m in today_matches if m.get('match_status') == 'finished'])
            
            print(f"    - Scheduled: {scheduled}")
            print(f"    - Live: {live}")
            print(f"    - Finished: {finished}")
        
        # Group breakdown
        if today_matches:
            by_group = {}
            for match in today_matches:
                group_name = match.get('group_name', 'Unknown')
                by_group[group_name] = by_group.get(group_name, 0) + 1
            
            print(f"\n🏆 Matches by league:")
            for league, count in by_group.items():
                print(f"  • {league}: {count} matches")
        
    except Exception as e:
        print(f"❌ Stats Error: {e}")


async def main():
    """Run all demos"""
    print("🚀 Starting Soccer Leagues Feature Demo")
    print("=" * 60)
    
    try:
        # Run all demo functions
        await demo_groups_management()
        await demo_sportsdb_integration()
        await demo_match_sync()
        await demo_live_scores()
        await demo_match_channels()
        await demo_database_stats()
        
        print("\n" + "=" * 60)
        print("✅ Demo completed successfully!")
        print("🎯 The Soccer Leagues Group Feature is ready for testing.")
        print("\nNext steps:")
        print("1. Run the database migration: 005_add_groups_and_matches.sql")
        print("2. Start the backend server: python main.py")
        print("3. Start the frontend: npm run dev")
        print("4. Navigate to the application and check the 'Leagues' section")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())