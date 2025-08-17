import asyncio
import logging
from datetime import datetime, time
from services.match_channel_lifecycle import match_lifecycle_manager

logger = logging.getLogger(__name__)

class MatchChannelScheduler:
    """Handles automatic scheduling of match channel creation and archival"""
    
    def __init__(self):
        self.running = False
        self.tasks = []
    
    async def start(self):
        """Start the scheduler"""
        if self.running:
            return
        
        self.running = True
        logger.info("Starting match channel scheduler...")
        
        # Schedule daily tasks
        daily_task = asyncio.create_task(self._daily_scheduler())
        self.tasks.append(daily_task)
        
        logger.info("Match channel scheduler started")
    
    async def stop(self):
        """Stop the scheduler"""
        if not self.running:
            return
        
        self.running = False
        logger.info("Stopping match channel scheduler...")
        
        # Cancel all tasks
        for task in self.tasks:
            task.cancel()
        
        # Wait for tasks to complete
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()
        
        logger.info("Match channel scheduler stopped")
    
    async def _daily_scheduler(self):
        """Run daily scheduling loop"""
        while self.running:
            try:
                current_time = datetime.now().time()
                
                # Check if it's time to create daily channels (12:00 AM - 12:05 AM)
                if time(0, 0) <= current_time <= time(0, 5):
                    if not hasattr(self, '_created_today'):
                        await self._create_daily_channels()
                        self._created_today = True
                
                # Check if it's time to archive daily channels (11:55 PM - 11:59 PM)
                elif time(23, 55) <= current_time <= time(23, 59):
                    if not hasattr(self, '_archived_today'):
                        await self._archive_daily_channels()
                        self._archived_today = True
                
                # Reset flags at midnight
                elif current_time < time(0, 5):
                    if hasattr(self, '_created_today'):
                        delattr(self, '_created_today')
                    if hasattr(self, '_archived_today'):
                        delattr(self, '_archived_today')
                
                # Sleep for 1 minute before checking again
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in daily scheduler: {e}")
                await asyncio.sleep(60)  # Wait before retrying
    
    async def _create_daily_channels(self):
        """Create match channels for today"""
        try:
            logger.info("Creating daily match channels...")
            result = await match_lifecycle_manager.create_daily_match_channels()
            
            if result['success']:
                logger.info(f"Successfully created {result['total_created']} match channels")
            else:
                logger.error(f"Failed to create some match channels: {result['errors']}")
                
        except Exception as e:
            logger.error(f"Error creating daily channels: {e}")
    
    async def _archive_daily_channels(self):
        """Archive match channels for today"""
        try:
            logger.info("Archiving daily match channels...")
            result = await match_lifecycle_manager.archive_daily_match_channels()
            
            if result['success']:
                logger.info(f"Successfully archived {result['total_archived']} match channels")
            else:
                logger.error(f"Failed to archive some match channels: {result['errors']}")
                
        except Exception as e:
            logger.error(f"Error archiving daily channels: {e}")

# Global scheduler instance
match_scheduler = MatchChannelScheduler()