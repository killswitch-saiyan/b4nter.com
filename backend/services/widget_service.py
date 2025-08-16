import logging
from typing import Dict, List, Optional, Tuple
from datetime import date
import re

from database import db
from services.sportsdb_client import sportsdb_client

logger = logging.getLogger(__name__)


class WidgetService:
    """Service for managing live score widgets and team mappings"""
    
    def __init__(self):
        self.provider_priorities = ['sofascore', 'footystats', 'fctables', 'livescore']
        self.team_name_cache = {}
        
    async def generate_match_widget_url(
        self, 
        home_team: str, 
        away_team: str, 
        match_date: str, 
        league: str = None,
        preferred_provider: str = 'sofascore'
    ) -> Dict:
        """Generate widget URL for a match"""
        result = {
            'success': False,
            'widget_url': None,
            'provider': None,
            'error': None,
            'fallback_used': False
        }
        
        try:
            # Try preferred provider first
            providers_to_try = [preferred_provider] + [p for p in self.provider_priorities if p != preferred_provider]
            
            for provider in providers_to_try:
                try:
                    widget_data = await self._generate_provider_widget(
                        provider, home_team, away_team, match_date, league
                    )
                    
                    if widget_data['success']:
                        result.update(widget_data)
                        if provider != preferred_provider:
                            result['fallback_used'] = True
                        break
                        
                except Exception as e:
                    logger.warning(f"Provider {provider} failed: {e}")
                    continue
            
            if not result['success']:
                result['error'] = 'No widget providers available for this match'
                
        except Exception as e:
            logger.error(f"Error generating widget URL: {e}")
            result['error'] = str(e)
        
        return result
    
    async def _generate_provider_widget(
        self, 
        provider: str, 
        home_team: str, 
        away_team: str, 
        match_date: str, 
        league: str = None
    ) -> Dict:
        """Generate widget for a specific provider"""
        
        # Get or create team mappings
        home_mapping = await self._get_or_create_team_mapping(home_team, provider)
        away_mapping = await self._get_or_create_team_mapping(away_team, provider)
        
        if not home_mapping or not away_mapping:
            return {
                'success': False,
                'error': f'Could not map teams for {provider}'
            }
        
        # Generate URL based on provider
        try:
            widget_url = self._build_provider_url(
                provider, home_mapping, away_mapping, match_date, league
            )
            
            return {
                'success': True,
                'widget_url': widget_url,
                'provider': provider,
                'home_mapping': home_mapping,
                'away_mapping': away_mapping
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to build {provider} URL: {e}'
            }
    
    async def _get_or_create_team_mapping(self, team_name: str, provider: str) -> Optional[Dict]:
        """Get existing team mapping or create a new one"""
        try:
            # First try exact match
            mapping = await db.get_team_mapping(team_name, provider)
            if mapping:
                return mapping
            
            # Try fuzzy search
            search_results = await db.search_team_mappings(team_name)
            for result in search_results:
                if result['provider'] == provider and result['confidence_score'] >= 0.7:
                    return result
            
            # Create new mapping based on team name normalization
            normalized_name = self._normalize_team_name(team_name, provider)
            provider_id = self._generate_provider_id(team_name, provider)
            
            mapping = await db.create_team_mapping(
                canonical_name=team_name,
                provider=provider,
                provider_name=normalized_name,
                provider_id=provider_id,
                confidence_score=0.8  # Auto-generated mappings have lower confidence
            )
            
            return mapping
            
        except Exception as e:
            logger.error(f"Error getting/creating team mapping for {team_name} ({provider}): {e}")
            return None
    
    def _normalize_team_name(self, team_name: str, provider: str) -> str:
        """Normalize team name for a specific provider"""
        
        # Common team name mappings
        name_mappings = {
            'sofascore': {
                'Manchester United': 'Manchester United',
                'Man United': 'Manchester United',
                'Man Utd': 'Manchester United',
                'Chelsea': 'Chelsea',
                'Arsenal': 'Arsenal',
                'Liverpool': 'Liverpool',
                'Manchester City': 'Manchester City',
                'Man City': 'Manchester City',
                'Tottenham': 'Tottenham',
                'Spurs': 'Tottenham',
                'Tottenham Hotspur': 'Tottenham',
                'Fiorentina': 'Fiorentina',
                'ACF Fiorentina': 'Fiorentina'
            },
            'footystats': {
                'Manchester United': 'Manchester United',
                'Chelsea': 'Chelsea FC',
                'Arsenal': 'Arsenal FC',
                'Liverpool': 'Liverpool FC',
                'Manchester City': 'Manchester City',
                'Tottenham': 'Tottenham Hotspur',
                'Fiorentina': 'ACF Fiorentina'
            },
            'fctables': {
                'Manchester United': 'Man United',
                'Manchester City': 'Man City',
                'Tottenham': 'Spurs'
            }
        }
        
        provider_mappings = name_mappings.get(provider, {})
        return provider_mappings.get(team_name, team_name)
    
    def _generate_provider_id(self, team_name: str, provider: str) -> str:
        """Generate provider-specific team ID"""
        
        # Known team IDs for different providers
        team_ids = {
            'sofascore': {
                'Manchester United': 'man-utd',
                'Chelsea': 'chelsea',
                'Arsenal': 'arsenal',
                'Liverpool': 'liverpool',
                'Manchester City': 'man-city',
                'Tottenham': 'tottenham',
                'Fiorentina': 'fiorentina'
            },
            'footystats': {
                'Manchester United': '35',
                'Chelsea': '38',
                'Arsenal': '42',
                'Liverpool': '40',
                'Manchester City': '43',
                'Tottenham': '47',
                'Fiorentina': '99'
            }
        }
        
        provider_ids = team_ids.get(provider, {})
        if team_name in provider_ids:
            return provider_ids[team_name]
        
        # Fallback: generate ID from team name
        return re.sub(r'[^a-z0-9]', '', team_name.lower().replace(' ', '-'))
    
    def _build_provider_url(
        self, 
        provider: str, 
        home_mapping: Dict, 
        away_mapping: Dict, 
        match_date: str, 
        league: str = None
    ) -> str:
        """Build widget URL for a specific provider"""
        
        if provider == 'sofascore':
            # SofaScore widget URL (hypothetical - would need actual research)
            home_id = home_mapping.get('provider_id', 'unknown')
            away_id = away_mapping.get('provider_id', 'unknown')
            return f"https://widgets.sofascore.com/match/{home_id}-{away_id}?date={match_date}"
        
        elif provider == 'footystats':
            # FootyStats API widget
            home_id = home_mapping.get('provider_id', '0')
            away_id = away_mapping.get('provider_id', '0')
            return f"https://footystats.org/api/match?home_id={home_id}&away_id={away_id}&date={match_date}&format=widget"
        
        elif provider == 'fctables':
            # FCTables widget
            home_name = home_mapping['provider_name'].replace(' ', '+')
            away_name = away_mapping['provider_name'].replace(' ', '+')
            league_param = f"&league={league}" if league else ""
            return f"https://www.fctables.com/widgets/livescore/?match={home_name}-vs-{away_name}&date={match_date}{league_param}"
        
        elif provider == 'livescore':
            # Generic live score widget
            home_name = home_mapping['provider_name'].replace(' ', '+')
            away_name = away_mapping['provider_name'].replace(' ', '+')
            return f"https://www.live-score-app.com/widgets/match?home={home_name}&away={away_name}&date={match_date}"
        
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    async def update_match_widgets(self, match_id: str, is_friendly: bool = False) -> Dict:
        """Update widget information for a match"""
        try:
            # Get match data directly
            if is_friendly:
                from database import run_sync_in_thread
                response = await run_sync_in_thread(
                    lambda: db.client.table('friendly_matches').select('*').eq('id', match_id).execute()
                )
            else:
                from database import run_sync_in_thread
                response = await run_sync_in_thread(
                    lambda: db.client.table('match_channels').select('*').eq('id', match_id).execute()
                )
            
            if not response.data:
                return {'success': False, 'error': 'Match not found'}
            
            match = response.data[0]
            
            # Generate widget URL
            widget_result = await self.generate_match_widget_url(
                home_team=match['home_team'],
                away_team=match['away_team'],
                match_date=match['match_date'],
                league='Premier League',  # Default for now
                preferred_provider=match.get('widget_provider', 'sofascore')
            )
            
            if widget_result['success']:
                # Update database with widget information
                widget_data = {
                    'widget_url': widget_result['widget_url'],
                    'widget_provider': widget_result['provider'],
                    'widget_enabled': True,
                    'external_match_ids': {
                        widget_result['provider']: {
                            'home_id': widget_result['home_mapping'].get('provider_id'),
                            'away_id': widget_result['away_mapping'].get('provider_id'),
                            'url': widget_result['widget_url']
                        }
                    }
                }
                
                if is_friendly:
                    updated = await db.update_friendly_widget(match_id, widget_data)
                else:
                    updated = await db.update_match_widget(match_id, widget_data)
                
                return {
                    'success': True,
                    'widget_data': widget_data,
                    'updated_match': updated,
                    'fallback_used': widget_result.get('fallback_used', False)
                }
            else:
                return {
                    'success': False,
                    'error': widget_result.get('error', 'Failed to generate widget')
                }
                
        except Exception as e:
            logger.error(f"Error updating match widgets: {e}")
            return {'success': False, 'error': str(e)}
    
    async def bulk_update_widgets(self, date_filter: str = None) -> Dict:
        """Update widgets for multiple matches"""
        result = {
            'success': True,
            'updated_count': 0,
            'failed_count': 0,
            'errors': []
        }
        
        try:
            # Get matches and friendlies
            matches = await db.get_matches_with_widgets(date_filter)
            friendlies = await db.get_friendlies_with_widgets(date_filter)
            
            # Update league matches
            for match in matches:
                if not match.get('widget_url'):  # Only update if no widget URL exists
                    update_result = await self.update_match_widgets(match['id'], is_friendly=False)
                    if update_result['success']:
                        result['updated_count'] += 1
                    else:
                        result['failed_count'] += 1
                        result['errors'].append(f"Match {match['home_team']} vs {match['away_team']}: {update_result['error']}")
            
            # Update friendly matches
            for friendly in friendlies:
                if not friendly.get('widget_url'):  # Only update if no widget URL exists
                    update_result = await self.update_match_widgets(friendly['id'], is_friendly=True)
                    if update_result['success']:
                        result['updated_count'] += 1
                    else:
                        result['failed_count'] += 1
                        result['errors'].append(f"Friendly {friendly['home_team']} vs {friendly['away_team']}: {update_result['error']}")
            
            if result['failed_count'] > 0:
                result['success'] = False
            
        except Exception as e:
            logger.error(f"Error in bulk widget update: {e}")
            result['success'] = False
            result['errors'].append(str(e))
        
        return result


# Global widget service instance
widget_service = WidgetService()