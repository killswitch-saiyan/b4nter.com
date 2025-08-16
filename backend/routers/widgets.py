from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from datetime import date
import logging

from models import UserResponse
from database import db
from auth import get_current_user
from services.widget_service import widget_service

logger = logging.getLogger(__name__)
router = APIRouter()


# Pydantic models for widget operations
from pydantic import BaseModel

class WidgetUpdateRequest(BaseModel):
    widget_url: Optional[str] = None
    widget_provider: Optional[str] = 'sofascore'
    widget_enabled: Optional[bool] = True
    sofascore_match_id: Optional[str] = None
    external_match_ids: Optional[Dict[str, Any]] = {}

class TeamMappingRequest(BaseModel):
    canonical_name: str
    provider: str
    provider_name: str
    provider_id: Optional[str] = None
    confidence_score: Optional[float] = 1.0

class WidgetResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


@router.get("/matches/today", response_model=List[dict])
async def get_todays_matches_with_widgets(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get today's match channels with widget information"""
    try:
        today = date.today().isoformat()
        matches = await db.get_matches_with_widgets(today)
        return matches
    except Exception as e:
        logger.error(f"Error getting today's matches with widgets: {e}")
        raise HTTPException(status_code=500, detail="Failed to get matches with widgets")


@router.get("/friendlies/today", response_model=List[dict])
async def get_todays_friendlies_with_widgets(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get today's friendly matches with widget information"""
    try:
        today = date.today().isoformat()
        friendlies = await db.get_friendlies_with_widgets(today)
        return friendlies
    except Exception as e:
        logger.error(f"Error getting today's friendlies with widgets: {e}")
        raise HTTPException(status_code=500, detail="Failed to get friendlies with widgets")


@router.get("/matches/{date}", response_model=List[dict])
async def get_matches_by_date_with_widgets(
    date: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get match channels for a specific date with widget information"""
    try:
        matches = await db.get_matches_with_widgets(date)
        return matches
    except Exception as e:
        logger.error(f"Error getting matches for {date} with widgets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get matches for {date} with widgets")


@router.patch("/match/{match_channel_id}/widget", response_model=WidgetResponse)
async def update_match_widget(
    match_channel_id: str,
    widget_data: WidgetUpdateRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update widget settings for a match channel"""
    try:
        updated = await db.update_match_widget(match_channel_id, widget_data.dict(exclude_none=True))
        
        if not updated:
            raise HTTPException(status_code=404, detail="Match channel not found")
        
        return WidgetResponse(
            success=True,
            message="Match widget updated successfully",
            data=updated
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating match widget: {e}")
        raise HTTPException(status_code=500, detail="Failed to update match widget")


@router.patch("/friendly/{friendly_id}/widget", response_model=WidgetResponse)
async def update_friendly_widget(
    friendly_id: str,
    widget_data: WidgetUpdateRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update widget settings for a friendly match"""
    try:
        updated = await db.update_friendly_widget(friendly_id, widget_data.dict(exclude_none=True))
        
        if not updated:
            raise HTTPException(status_code=404, detail="Friendly match not found")
        
        return WidgetResponse(
            success=True,
            message="Friendly widget updated successfully",
            data=updated
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating friendly widget: {e}")
        raise HTTPException(status_code=500, detail="Failed to update friendly widget")


@router.get("/team-mappings/search/{team_name}", response_model=List[dict])
async def search_team_mappings(
    team_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Search for team mappings by team name"""
    try:
        mappings = await db.search_team_mappings(team_name)
        return mappings
    except Exception as e:
        logger.error(f"Error searching team mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to search team mappings")


@router.get("/team-mappings/{team_name}/{provider}", response_model=dict)
async def get_team_mapping(
    team_name: str,
    provider: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get team mapping for a specific provider"""
    try:
        mapping = await db.get_team_mapping(team_name, provider)
        
        if not mapping:
            raise HTTPException(status_code=404, detail="Team mapping not found")
        
        return mapping
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting team mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to get team mapping")


@router.post("/team-mappings", response_model=WidgetResponse)
async def create_team_mapping(
    mapping_data: TeamMappingRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new team mapping"""
    try:
        mapping = await db.create_team_mapping(
            canonical_name=mapping_data.canonical_name,
            provider=mapping_data.provider,
            provider_name=mapping_data.provider_name,
            provider_id=mapping_data.provider_id,
            confidence_score=mapping_data.confidence_score
        )
        
        if not mapping:
            raise HTTPException(status_code=400, detail="Failed to create team mapping")
        
        return WidgetResponse(
            success=True,
            message="Team mapping created successfully",
            data=mapping
        )
    except Exception as e:
        logger.error(f"Error creating team mapping: {e}")
        raise HTTPException(status_code=500, detail="Failed to create team mapping")


@router.get("/configuration/{name}", response_model=dict)
async def get_widget_configuration(
    name: str = 'default',
    current_user: UserResponse = Depends(get_current_user)
):
    """Get widget configuration by name"""
    try:
        config = await db.get_widget_configuration(name)
        
        if not config:
            raise HTTPException(status_code=404, detail="Widget configuration not found")
        
        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting widget configuration: {e}")
        raise HTTPException(status_code=500, detail="Failed to get widget configuration")


@router.post("/generate-url", response_model=WidgetResponse)
async def generate_widget_url(
    home_team: str,
    away_team: str,
    match_date: str,
    provider: str = 'sofascore',
    league: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Generate widget URL for a match using team mappings"""
    try:
        # Get team mappings for the specified provider
        home_mapping = await db.get_team_mapping(home_team, provider)
        away_mapping = await db.get_team_mapping(away_team, provider)
        
        if not home_mapping or not away_mapping:
            # Try to create fallback mappings or return error
            missing_teams = []
            if not home_mapping:
                missing_teams.append(home_team)
            if not away_mapping:
                missing_teams.append(away_team)
                
            return WidgetResponse(
                success=False,
                message=f"Team mappings not found for: {', '.join(missing_teams)}",
                data={
                    "missing_teams": missing_teams,
                    "provider": provider,
                    "suggestion": f"Please create team mappings for {provider} provider"
                }
            )
        
        # Generate widget URL based on provider and mappings
        widget_url = generate_provider_widget_url(
            provider=provider,
            home_mapping=home_mapping,
            away_mapping=away_mapping,
            match_date=match_date,
            league=league
        )
        
        return WidgetResponse(
            success=True,
            message="Widget URL generated successfully",
            data={
                "widget_url": widget_url,
                "provider": provider,
                "home_team": home_team,
                "away_team": away_team,
                "match_date": match_date
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating widget URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate widget URL")


def generate_provider_widget_url(provider: str, home_mapping: dict, away_mapping: dict, match_date: str, league: str = None) -> str:
    """Generate widget URL based on provider and team mappings"""
    
    if provider == 'sofascore':
        # SofaScore widget URL structure (placeholder - needs actual research)
        # This would need to be updated based on actual SofaScore widget API
        home_id = home_mapping.get('provider_id', home_mapping['provider_name'].lower().replace(' ', '-'))
        away_id = away_mapping.get('provider_id', away_mapping['provider_name'].lower().replace(' ', '-'))
        return f"https://widgets.sofascore.com/match/{home_id}-vs-{away_id}/{match_date}"
    
    elif provider == 'footystats':
        # FootyStats widget URL structure
        home_id = home_mapping.get('provider_id', '0')
        away_id = away_mapping.get('provider_id', '0')
        return f"https://footystats.org/api/match?home_id={home_id}&away_id={away_id}&date={match_date}"
    
    elif provider == 'fctables':
        # FCTables widget URL structure
        league_param = f"&league={league}" if league else ""
        home_name = home_mapping['provider_name'].replace(' ', '+')
        away_name = away_mapping['provider_name'].replace(' ', '+')
        return f"https://www.fctables.com/widgets/livescore/?match={home_name}-{away_name}&date={match_date}{league_param}"
    
    elif provider == 'livescore':
        # Generic live score widget
        home_name = home_mapping['provider_name'].replace(' ', '+')
        away_name = away_mapping['provider_name'].replace(' ', '+')
        return f"https://www.live-score-app.com/widgets/match?home={home_name}&away={away_name}&date={match_date}"
    
    else:
        raise ValueError(f"Unsupported widget provider: {provider}")


@router.get("/providers", response_model=List[dict])
async def get_widget_providers(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get list of supported widget providers"""
    providers = [
        {
            "id": "sofascore",
            "name": "SofaScore",
            "description": "Professional sports data and live scores",
            "features": ["live_scores", "lineups", "stats", "real_time_updates"],
            "free": True,
            "reliability": "high"
        },
        {
            "id": "footystats",
            "name": "FootyStats",
            "description": "Football statistics and live data",
            "features": ["live_scores", "stats", "tables", "fixtures"],
            "free": True,
            "reliability": "medium"
        },
        {
            "id": "fctables",
            "name": "FCTables",
            "description": "Football league tables and live scores",
            "features": ["live_scores", "tables", "standings"],
            "free": True,
            "reliability": "medium"
        },
        {
            "id": "livescore",
            "name": "LiveScore",
            "description": "Basic live score widgets",
            "features": ["live_scores", "basic_stats"],
            "free": True,
            "reliability": "low"
        }
    ]
    
    return providers


@router.post("/auto-generate/{match_id}", response_model=WidgetResponse)
async def auto_generate_widget(
    match_id: str,
    is_friendly: bool = False,
    current_user: UserResponse = Depends(get_current_user)
):
    """Auto-generate widget URL for a match using team mappings"""
    try:
        result = await widget_service.update_match_widgets(match_id, is_friendly)
        
        if result['success']:
            return WidgetResponse(
                success=True,
                message="Widget generated successfully",
                data=result
            )
        else:
            return WidgetResponse(
                success=False,
                message=result['error'],
                data=result
            )
            
    except Exception as e:
        logger.error(f"Error auto-generating widget: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate widget")


@router.post("/bulk-update", response_model=WidgetResponse)
async def bulk_update_widgets(
    date_filter: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Bulk update widgets for matches on a specific date"""
    try:
        if not date_filter:
            date_filter = date.today().isoformat()
            
        result = await widget_service.bulk_update_widgets(date_filter)
        
        return WidgetResponse(
            success=result['success'],
            message=f"Bulk update completed: {result['updated_count']} updated, {result['failed_count']} failed",
            data=result
        )
        
    except Exception as e:
        logger.error(f"Error in bulk widget update: {e}")
        raise HTTPException(status_code=500, detail="Failed to bulk update widgets")