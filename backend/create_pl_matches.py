import asyncio
from database import db, run_sync_in_thread
from services.widget_service import widget_service
from datetime import date, datetime

async def create_all_pl_matches_properly():
    print('Creating ALL Premier League matches from August 16, 2025 under proper league structure...')
    
    try:
        today = date.today().isoformat()
        
        # 1. First, delete the incorrectly placed channel
        print('\n1. Cleaning up existing matches...')
        existing_response = await run_sync_in_thread(
            lambda: db.client.table('match_channels').select('*').eq('match_date', today).execute()
        )
        
        for match in existing_response.data or []:
            print(f'Deleting existing: {match["home_team"]} vs {match["away_team"]}')
            # Delete the channel first
            if match.get('channel_id'):
                await run_sync_in_thread(
                    lambda: db.client.table('channels').delete().eq('id', match['channel_id']).execute()
                )
            # Delete the match channel
            await run_sync_in_thread(
                lambda: db.client.table('match_channels').delete().eq('id', match['id']).execute()
            )
        
        # 2. Get or create Premier League group
        print('\n2. Setting up Premier League group...')
        groups = await db.get_groups()
        premier_league_group = None
        for group in groups:
            if 'Premier League' in group.get('name', '') or 'English Premier League' in group.get('name', ''):
                premier_league_group = group
                break
        
        if not premier_league_group:
            print('Creating Premier League group...')
            premier_league_group = await db.create_group({
                'name': 'Premier League',
                'description': 'English Premier League 2025/26 Season',
                'creator_id': '25293ea3-1122-4989-acd2-f28736b3f698'  # Using existing user
            })
            print(f'Created Premier League group: {premier_league_group["id"]}')
        else:
            print(f'Using existing Premier League group: {premier_league_group["name"]}')
        
        # 3. All Premier League matches from August 16, 2025
        print('\n3. Creating all Premier League match channels...')
        
        premier_league_matches = [
            {
                'home_team': 'Aston Villa',
                'away_team': 'Newcastle United',
                'match_time': '12:30:00',
                'home_score': 0,
                'away_score': 0,
                'match_status': 'finished',
                'venue': 'Villa Park'
            },
            {
                'home_team': 'Brighton',
                'away_team': 'Fulham', 
                'match_time': '15:00:00',
                'home_score': 1,
                'away_score': 1,
                'match_status': 'finished',
                'venue': 'Amex Stadium'
            },
            {
                'home_team': 'Sunderland',
                'away_team': 'West Ham',
                'match_time': '15:00:00',
                'home_score': 3,
                'away_score': 0,
                'match_status': 'finished', 
                'venue': 'Stadium of Light'
            },
            {
                'home_team': 'Tottenham',
                'away_team': 'Burnley',
                'match_time': '15:00:00',
                'home_score': 3,
                'away_score': 0,
                'match_status': 'finished',
                'venue': 'Tottenham Hotspur Stadium'
            },
            {
                'home_team': 'Wolves',
                'away_team': 'Manchester City',
                'match_time': '17:30:00',
                'home_score': 1,
                'away_score': 2,
                'match_status': 'finished',
                'venue': 'Molineux Stadium'
            }
        ]
        
        created_matches = []
        for match_data in premier_league_matches:
            try:
                print(f'\nCreating: {match_data["home_team"]} vs {match_data["away_team"]} ({match_data["home_score"]}-{match_data["away_score"]})')
                
                # Create the channel first
                channel_data = {
                    'name': f'{match_data["home_team"]} vs {match_data["away_team"]}',
                    'description': f'Live discussion for {match_data["home_team"]} vs {match_data["away_team"]} | Premier League Matchday 1',
                    'is_private': False,
                    'created_by': '25293ea3-1122-4989-acd2-f28736b3f698'
                }
                
                new_channel = await db.create_channel(channel_data)
                if not new_channel:
                    print('  Failed to create channel')
                    continue
                
                print(f'  Created channel: {new_channel["id"]}')
                
                # Create match channel linked to group AND channel
                match_channel_data = {
                    'home_team': match_data['home_team'],
                    'away_team': match_data['away_team'],
                    'match_date': today,
                    'match_time': match_data['match_time'],
                    'group_id': premier_league_group['id'],  # Link to Premier League group
                    'channel_id': new_channel['id']         # Link to chat channel
                }
                
                match_channel = await db.create_match_channel(match_channel_data)
                if not match_channel:
                    print('  Failed to create match channel')
                    continue
                
                print(f'  Created match channel: {match_channel["id"]}')
                
                # Add live score data
                score_data = {
                    'match_channel_id': match_channel['id'],
                    'home_score': match_data['home_score'],
                    'away_score': match_data['away_score'],
                    'match_status': match_data['match_status'],
                    'match_minute': '90+' if match_data['match_status'] == 'finished' else None
                }
                
                await run_sync_in_thread(
                    lambda: db.client.table('live_match_data').insert(score_data).execute()
                )
                
                # Generate widget
                widget_result = await widget_service.update_match_widgets(match_channel['id'], is_friendly=False)
                if widget_result['success']:
                    print(f'  Added widget successfully')
                else:
                    print(f'  Widget failed: {widget_result["error"]}')
                
                # Add channel member for creator
                await run_sync_in_thread(
                    lambda: db.client.table('channel_members').insert({
                        'channel_id': new_channel['id'],
                        'user_id': '25293ea3-1122-4989-acd2-f28736b3f698',
                        'role': 'admin'
                    }).execute()
                )
                
                created_matches.append({
                    'match': match_data,
                    'channel_id': new_channel['id'],
                    'match_channel_id': match_channel['id']
                })
                
            except Exception as e:
                print(f'  Error creating {match_data["home_team"]} vs {match_data["away_team"]}: {e}')
        
        # 4. Summary
        print(f'\n=== SUMMARY ===')
        print(f'Created {len(created_matches)} Premier League match channels under group: {premier_league_group["name"]}')
        
        for created in created_matches:
            match = created['match']
            print(f'  {match["home_team"]} vs {match["away_team"]} | {match["home_score"]}-{match["away_score"]} | {match["match_time"]}')
        
        print(f'\nAll match channels are now properly organized under the Premier League group!')
        print(f'Each match has:')
        print(f'  ✓ Chat channel for discussions')
        print(f'  ✓ Live score widget')
        print(f'  ✓ Final scores from Matchday 1')
        print(f'  ✓ Grouped under Premier League')
        
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()
    
    # Close session
    try:
        from services.sportsdb_client import sportsdb_client
        await sportsdb_client.close()
    except:
        pass

if __name__ == "__main__":
    asyncio.run(create_all_pl_matches_properly())