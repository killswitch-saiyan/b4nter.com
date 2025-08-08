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


# Global client instance
sportsdb_client = SportsDBClient()