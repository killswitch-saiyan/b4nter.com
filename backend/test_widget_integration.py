#!/usr/bin/env python3
"""
Test script for the widget integration functionality
This will test the widget generation for Man United vs Chelsea
"""

import asyncio
import sys
import os
from datetime import date, timedelta

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.widget_service import widget_service
from database import db


async def test_team_mappings():
    """Test team mapping functionality"""
    print("Testing Team Mappings")
    print("=" * 50)
    
    teams_to_test = ['Manchester United', 'Chelsea', 'Arsenal', 'Liverpool']
    providers = ['sofascore', 'footystats', 'fctables', 'livescore']
    
    for team in teams_to_test:
        print(f"\nTeam: {team}")
        for provider in providers:
            try:
                mapping = await db.get_team_mapping(team, provider)
                if mapping:
                    print(f"  {provider}: {mapping['provider_name']} (ID: {mapping.get('provider_id', 'N/A')})")
                else:
                    print(f"  {provider}: No mapping found")
            except Exception as e:
                print(f"  {provider}: Error - {e}")


async def test_widget_generation():
    """Test widget URL generation"""
    print("\nTesting Widget Generation")
    print("=" * 50)
    
    # Test match data
    home_team = "Manchester United"
    away_team = "Chelsea"
    match_date = date.today().isoformat()
    league = "Premier League"
    
    print(f"Match: {home_team} vs {away_team}")
    print(f"Date: {match_date}")
    print(f"League: {league}")
    print()
    
    providers = ['sofascore', 'footystats', 'fctables', 'livescore']
    
    for provider in providers:
        print(f"Testing {provider}...")
        try:
            result = await widget_service.generate_match_widget_url(
                home_team=home_team,
                away_team=away_team,
                match_date=match_date,
                league=league,
                preferred_provider=provider
            )
            
            if result['success']:
                print(f"  Success: {result['widget_url']}")
                print(f"  Provider: {result['provider']}")
                print(f"  Fallback used: {result.get('fallback_used', False)}")
            else:
                print(f"  Failed: {result['error']}")
                
        except Exception as e:
            print(f"  Error: {e}")
        print()


async def test_match_widget_update():
    """Test updating a real match with widget data"""
    print("\nTesting Match Widget Update")
    print("=" * 50)
    
    try:
        # Get today's matches
        today_matches = await db.get_matches_with_widgets(date.today().isoformat())
        today_friendlies = await db.get_friendlies_with_widgets(date.today().isoformat())
        
        print(f"Found {len(today_matches)} league matches and {len(today_friendlies)} friendlies for today")
        
        # Test with first available match
        test_match = None
        is_friendly = False
        
        if today_matches:
            test_match = today_matches[0]
            is_friendly = False
            print(f"\nTesting with league match: {test_match['home_team']} vs {test_match['away_team']}")
        elif today_friendlies:
            test_match = today_friendlies[0]
            is_friendly = True
            print(f"\nTesting with friendly match: {test_match['home_team']} vs {test_match['away_team']}")
        
        if test_match:
            result = await widget_service.update_match_widgets(test_match['id'], is_friendly)
            
            if result['success']:
                print("Widget update successful!")
                print(f"  Widget URL: {result['widget_data']['widget_url']}")
                print(f"  Provider: {result['widget_data']['widget_provider']}")
                print(f"  Fallback used: {result.get('fallback_used', False)}")
            else:
                print(f"Widget update failed: {result['error']}")
        else:
            print("No matches found for today to test with")
            
            # Create a test friendly match for testing
            print("\nCreating test friendly match...")
            tomorrow = (date.today() + timedelta(days=1)).isoformat()
            
            # This would normally be done through the friendlies API
            print(f"You can create a test match for {tomorrow} using:")
            print("POST /friendlies/")
            print("Body: {")
            print('  "match_date": "' + tomorrow + '",')
            print('  "match_time": "15:00:00",')
            print('  "home_team": "Manchester United",')
            print('  "away_team": "Chelsea",')
            print('  "match_type": "club_friendly",')
            print('  "venue": "Old Trafford"')
            print("}")
            
    except Exception as e:
        print(f"Error testing match widget update: {e}")


async def test_bulk_update():
    """Test bulk widget update"""
    print("\nTesting Bulk Widget Update")
    print("=" * 50)
    
    try:
        today = date.today().isoformat()
        result = await widget_service.bulk_update_widgets(today)
        
        print(f"Bulk update results for {today}:")
        print(f"  Success: {result['success']}")
        print(f"  Updated: {result['updated_count']}")
        print(f"  Failed: {result['failed_count']}")
        
        if result['errors']:
            print(f"  Errors:")
            for error in result['errors']:
                print(f"    - {error}")
                
    except Exception as e:
        print(f"Error testing bulk update: {e}")


async def test_configuration():
    """Test widget configuration"""
    print("\nTesting Widget Configuration")
    print("=" * 50)
    
    try:
        config = await db.get_widget_configuration('default')
        if config:
            print("Default widget configuration found:")
            print(f"  Provider priority: {config['provider_priority']}")
            print(f"  Default height: {config['default_height']}")
            print(f"  Compact height: {config['compact_height']}")
            print(f"  Mobile height: {config['mobile_height']}")
            print(f"  Settings: {config['settings']}")
        else:
            print("No default widget configuration found")
            
    except Exception as e:
        print(f"Error testing configuration: {e}")


async def main():
    """Run all tests"""
    print("Widget Integration Test Suite")
    print("=" * 60)
    
    try:
        await test_team_mappings()
        await test_widget_generation()
        await test_match_widget_update()
        await test_bulk_update()
        await test_configuration()
        
        print("\n" + "=" * 60)
        print("Test suite completed!")
        print("\nNext steps:")
        print("1. Run the database migration: 007_add_widget_support.sql")
        print("2. Start the backend server: python main.py")
        print("3. Navigate to a match channel to see the widget")
        print("4. Use the API endpoints to generate/update widgets")
        print("=" * 60)
        
    except Exception as e:
        print(f"\nTest suite failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())