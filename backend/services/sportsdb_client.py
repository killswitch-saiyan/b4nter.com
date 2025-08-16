import aiohttp
import logging
from typing import List, Dict, Optional
from datetime import date, datetime, time
import asyncio

logger = logging.getLogger(__name__)

class SportsDBClient:
    def __init__(self, api_key: str = "123"):
        self.api_key = api_key
        self.base_url = "https://www.thesportsdb.com/api/v1/json"
        self.session = None

    async def _get_session(self):
        """Get or create HTTP session"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session

    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
            self.session = None

    async def _make_request(self, endpoint: str) -> Optional[dict]:
        """Make HTTP request to SportsDB API"""
        try:
            session = await self._get_session()
            url = f"{self.base_url}/{self.api_key}/{endpoint}"
            
            logger.info(f"Making request to SportsDB API: {url}")
            
            async with session.get(url, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.info(f"SportsDB API response successful for {endpoint}")
                    return data
                else:
                    logger.error(f"SportsDB API error: {response.status} for {endpoint}")
                    return None
        except asyncio.TimeoutError:
            logger.error(f"SportsDB API timeout for {endpoint}")
            return None
        except Exception as e:
            logger.error(f"SportsDB API request failed for {endpoint}: {e}")
            return None

    async def get_league_fixtures(self, league_id: str, season: str = "2024-2025") -> List[Dict]:
        """Get all fixtures for a league in a season"""
        try:
            endpoint = f"eventsseason.php?id={league_id}&s={season}"
            data = await self._make_request(endpoint)
            
            if not data or 'events' not in data:
                logger.warning(f"No events found for league {league_id} season {season}")
                return []
            
            events = data['events'] or []
            logger.info(f"Retrieved {len(events)} fixtures for league {league_id}")
            return events
            
        except Exception as e:
            logger.error(f"Error getting league fixtures: {e}")
            return []

    async def get_todays_fixtures(self, league_id: str) -> List[Dict]:
        """Get today's fixtures for a specific league"""
        try:
            # Get all fixtures for the season
            all_fixtures = await self.get_league_fixtures(league_id)
            
            # Filter for today's matches
            today = date.today().strftime("%Y-%m-%d")
            todays_fixtures = []
            
            for fixture in all_fixtures:
                if fixture.get('dateEvent') == today:
                    todays_fixtures.append(fixture)
            
            logger.info(f"Found {len(todays_fixtures)} fixtures today for league {league_id}")
            return todays_fixtures
            
        except Exception as e:
            logger.error(f"Error getting today's fixtures: {e}")
            return []

    async def get_live_scores(self) -> List[Dict]:
        """Get all live scores"""
        try:
            endpoint = "livescore.php"
            data = await self._make_request(endpoint)
            
            if not data:
                return []
                
            # The API might return live scores in different formats
            # We need to handle both 'events' and direct array
            events = []
            if 'events' in data:
                events = data['events'] or []
            elif isinstance(data, list):
                events = data
            elif isinstance(data, dict):
                # Sometimes the response might be a dict with team data
                # We'll need to parse this based on actual API response
                events = []
            
            logger.info(f"Retrieved {len(events)} live scores")
            return events
            
        except Exception as e:
            logger.error(f"Error getting live scores: {e}")
            return []

    async def get_league_live_scores(self, league_id: str) -> List[Dict]:
        """Get live scores for a specific league"""
        try:
            # Try league-specific endpoint first
            endpoint = f"livescore.php?l={league_id}"
            data = await self._make_request(endpoint)
            
            if data and 'events' in data and data['events']:
                events = data['events']
                logger.info(f"Retrieved {len(events)} live scores for league {league_id}")
                return events
            
            # Fallback: get all live scores and filter
            all_live = await self.get_live_scores()
            league_live = []
            
            for match in all_live:
                # Check if match belongs to this league
                if (match.get('idLeague') == league_id or 
                    match.get('strLeague') == league_id):
                    league_live.append(match)
            
            logger.info(f"Found {len(league_live)} live matches for league {league_id}")
            return league_live
            
        except Exception as e:
            logger.error(f"Error getting league live scores: {e}")
            return []

    def parse_match_data(self, event: Dict) -> Dict:
        """Parse SportsDB event data into our format"""
        try:
            # Parse match time
            match_time = None
            if event.get('strTime'):
                try:
                    # Handle different time formats
                    time_str = event['strTime']
                    if ':' in time_str:
                        match_time = datetime.strptime(time_str, "%H:%M:%S").time()
                    else:
                        # Sometimes it's just "HH:MM"
                        match_time = datetime.strptime(time_str, "%H:%M").time()
                except (ValueError, TypeError):
                    logger.warning(f"Could not parse time: {event.get('strTime')}")
                    match_time = None

            # Parse scores
            home_score = 0
            away_score = 0
            try:
                if event.get('intHomeScore') is not None:
                    home_score = int(event['intHomeScore'])
                if event.get('intAwayScore') is not None:
                    away_score = int(event['intAwayScore'])
            except (ValueError, TypeError):
                logger.warning(f"Could not parse scores for event {event.get('idEvent')}")

            # Determine match status
            match_status = "scheduled"
            status = event.get('strStatus', '').lower()
            if status in ['match finished', 'finished', 'ft']:
                match_status = "finished"
            elif status in ['1st half', '2nd half', 'halftime', 'live']:
                match_status = "live"

            return {
                'sportsdb_event_id': event.get('idEvent'),
                'home_team': event.get('strHomeTeam', 'Unknown Home Team'),
                'away_team': event.get('strAwayTeam', 'Unknown Away Team'),
                'match_date': event.get('dateEvent'),
                'match_time': match_time.strftime("%H:%M:%S") if match_time else None,
                'home_score': home_score,
                'away_score': away_score,
                'match_status': match_status,
                'match_minute': event.get('strProgress'),  # Current minute if live
                'venue': event.get('strVenue'),
                'league': event.get('strLeague'),
                'season': event.get('strSeason')
            }
        except Exception as e:
            logger.error(f"Error parsing match data: {e}")
            return {}

    async def get_league_info(self, league_id: str) -> Optional[Dict]:
        """Get league information by ID"""
        try:
            endpoint = f"lookupleague.php?id={league_id}"
            data = await self._make_request(endpoint)
            
            if data and 'leagues' in data and data['leagues']:
                league = data['leagues'][0]
                return {
                    'id': league.get('idLeague'),
                    'name': league.get('strLeague'),
                    'sport': league.get('strSport'),
                    'country': league.get('strCountry'),
                    'description': league.get('strDescriptionEN'),
                    'logo': league.get('strLogo'),
                    'badge': league.get('strBadge')
                }
            
            return None
        except Exception as e:
            logger.error(f"Error getting league info: {e}")
            return None

    async def get_team_info(self, team_name: str) -> Optional[Dict]:
        """Get team information by name"""
        try:
            endpoint = f"searchteams.php?t={team_name.replace(' ', '%20')}"
            data = await self._make_request(endpoint)
            
            if data and 'teams' in data and data['teams']:
                team = data['teams'][0]  # Get first match
                return {
                    'id': team.get('idTeam'),
                    'name': team.get('strTeam'),
                    'alternate_name': team.get('strAlternate'),
                    'country': team.get('strCountry'),
                    'sport': team.get('strSport'),
                    'league': team.get('strLeague'),
                    'logo': team.get('strTeamLogo'),
                    'badge': team.get('strTeamBadge'),
                    'jersey': team.get('strTeamJersey'),
                    'website': team.get('strWebsite'),
                    'facebook': team.get('strFacebook'),
                    'twitter': team.get('strTwitter'),
                    'instagram': team.get('strInstagram'),
                    'description': team.get('strDescriptionEN'),
                    'stadium': team.get('strStadium'),
                    'stadium_thumb': team.get('strStadiumThumb'),
                    'stadium_description': team.get('strStadiumDescription'),
                    'stadium_location': team.get('strStadiumLocation'),
                    'stadium_capacity': team.get('intStadiumCapacity')
                }
            
            return None
        except Exception as e:
            logger.error(f"Error getting team info for {team_name}: {e}")
            return None

    async def search_events_by_teams(self, home_team: str, away_team: str, date_range_days: int = 7) -> List[Dict]:
        """Search for events/matches by team names within a date range"""
        try:
            events = []
            
            # Search for home team's next events
            home_endpoint = f"eventsnext.php?id={await self._get_team_id(home_team) or ''}"
            home_data = await self._make_request(home_endpoint)
            
            if home_data and 'events' in home_data:
                for event in home_data['events'][:10]:  # Limit to 10 recent events
                    # Check if this is a match between our two teams
                    event_home = event.get('strHomeTeam', '').lower()
                    event_away = event.get('strAwayTeam', '').lower()
                    
                    if ((home_team.lower() in event_home or event_home in home_team.lower()) and 
                        (away_team.lower() in event_away or event_away in away_team.lower())) or \
                       ((away_team.lower() in event_home or event_home in away_team.lower()) and 
                        (home_team.lower() in event_away or event_away in home_team.lower())):
                        
                        parsed_event = self.parse_match_data(event)
                        if parsed_event:
                            events.append(parsed_event)
            
            return events
        except Exception as e:
            logger.error(f"Error searching events for {home_team} vs {away_team}: {e}")
            return []

    async def _get_team_id(self, team_name: str) -> Optional[str]:
        """Helper to get team ID by name"""
        try:
            team_info = await self.get_team_info(team_name)
            return team_info.get('id') if team_info else None
        except Exception as e:
            logger.error(f"Error getting team ID for {team_name}: {e}")
            return None

    async def get_friendly_fixtures_by_date(self, target_date: str) -> List[Dict]:
        """Get friendly fixtures for a specific date (YYYY-MM-DD)"""
        try:
            # SportsDB doesn't have a direct friendly endpoint, so we'll search for common friendly scenarios
            # This is a workaround - in production you might want to use additional APIs or data sources
            
            fixtures = []
            
            # Search for international friendlies
            international_endpoint = f"eventsday.php?d={target_date}&s=Soccer"
            data = await self._make_request(international_endpoint)
            
            if data and 'events' in data:
                for event in data['events']:
                    # Filter for friendlies (look for keywords in event name/description)
                    event_name = event.get('strEvent', '').lower()
                    league_name = event.get('strLeague', '').lower()
                    
                    # Common indicators of friendlies
                    friendly_indicators = [
                        'friendly', 'international friendly', 'club friendly',
                        'pre-season', 'testimonial', 'charity match'
                    ]
                    
                    is_friendly = any(indicator in event_name or indicator in league_name 
                                    for indicator in friendly_indicators)
                    
                    if is_friendly:
                        parsed_event = self.parse_match_data(event)
                        if parsed_event:
                            parsed_event['match_type'] = 'friendly'
                            fixtures.append(parsed_event)
            
            return fixtures
        except Exception as e:
            logger.error(f"Error getting friendly fixtures for {target_date}: {e}")
            return []

    async def search_specific_match(self, home_team: str, away_team: str, match_date: str) -> Optional[Dict]:
        """Search for a specific match by teams and date"""
        try:
            # First try to find by team search
            events = await self.search_events_by_teams(home_team, away_team)
            
            # Filter by date
            for event in events:
                if event.get('match_date') == match_date:
                    return event
            
            # If not found, try date-based search
            date_events = await self.get_friendly_fixtures_by_date(match_date)
            
            for event in date_events:
                event_home = event.get('home_team', '').lower()
                event_away = event.get('away_team', '').lower()
                
                # Fuzzy match team names
                if ((home_team.lower() in event_home or any(word in event_home for word in home_team.lower().split())) and
                    (away_team.lower() in event_away or any(word in event_away for word in away_team.lower().split()))):
                    return event
            
            return None
        except Exception as e:
            logger.error(f"Error searching specific match {home_team} vs {away_team} on {match_date}: {e}")
            return None


# Global client instance
sportsdb_client = SportsDBClient()