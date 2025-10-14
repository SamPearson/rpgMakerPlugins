/// <reference path="./rpg-maker-mv-docs.d.ts" />
/*:
 * @plugindesc v1.0.0 Growth Type Strategies for HDB Gardening System
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @help 
 * This plugin provides growth strategy implementations for the gardening system.
 * It should be placed AFTER HDB_Gardening_Core.js but BEFORE HDB_Gardening_PlantList.js
 */

(function() {
    'use strict';

    // Initialize logger
    const logger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_Gardening_GrowthTypes') : { log: () => {} };

    // Base Growth Strategy class
    class PlantGrowthStrategy {
        constructor(plantData) {
            this.plantData = plantData;
        }
        
        updateGrowth(currentTime) {
            throw new Error('updateGrowth must be implemented by subclass');
        }
        
        isHarvestable() {
            return this.plantData.isFullyGrown();
        }
        
        onHarvest() {
            return false; // Return false to remove plant, true to keep it
        }
    }

    // Standard Growth Strategy (default behavior)
    class StandardGrowthStrategy extends PlantGrowthStrategy {
        updateGrowth(currentTime) {
            const daysSincePlanting = this.plantData.getDaysSincePlanting(currentTime);
            const newStage = Math.min(
                Math.floor(daysSincePlanting / this.plantData.plantTemplate.daysPerStage),
                this.plantData.plantTemplate.growthStages - 1
            );
            
            if (newStage !== this.plantData.growthStage) {
                this.plantData.growthStage = newStage;
                this.plantData.onGrowthStageChange();
            }
        }
        
        onHarvest() {
            return false; // Remove plant after harvest
        }
    }

    // Bulb Flower Strategy
    class BulbGrowthStrategy extends PlantGrowthStrategy {
        updateGrowth(currentTime) {
            const template = this.plantData.plantTemplate;
            const activeSeasons = template.activeSeasons || [];
            const currentSeason = currentTime.season;
            
            const isActiveGrowingSeason = activeSeasons.includes(currentSeason);
            
            if (isActiveGrowingSeason) {
                const daysSinceSeason = (currentTime.day - 1);
                const seasonProgress = Math.min(daysSinceSeason / 28, 1);
                
                const newStage = Math.min(
                    Math.floor(seasonProgress * template.growthStages),
                    template.growthStages - 1
                );
                
                if (newStage !== this.plantData.growthStage) {
                    this.plantData.growthStage = newStage;
                    this.plantData.onGrowthStageChange();
                }
            } else {
                if (this.plantData.growthStage !== 0) {
                    this.plantData.growthStage = 0;
                    this.plantData.onGrowthStageChange();
                }
            }
        }
        
        isHarvestable() {
            const template = this.plantData.plantTemplate;
            const currentTime = window.HDB_TimeSystem.getInstance().getCurrentTime();
            return this.plantData.growthStage === template.growthStages - 1 && 
                   template.activeSeasons.includes(currentTime.season);
        }
        
        onHarvest() {
            return true; // Bulb remains for next season
        }
    }

    // Vine Plant Strategy
    class VineGrowthStrategy extends PlantGrowthStrategy {
        updateGrowth(currentTime) {
            const template = this.plantData.plantTemplate;
            const daysSincePlanting = this.plantData.getDaysSincePlanting(currentTime);
            
            if (daysSincePlanting > template.maxAge) {
                this.plantData.isDead = true;
                return;
            }
            
            const newStage = Math.min(
                Math.floor(daysSincePlanting / template.daysPerStage),
                template.growthStages - 1
            );
            
            if (newStage !== this.plantData.growthStage) {
                this.plantData.growthStage = newStage;
                this.plantData.onGrowthStageChange();
            }
        }
        
        isHarvestable() {
            return this.plantData.growthStage === this.plantData.plantTemplate.growthStages - 1 &&
                   !this.plantData.isDead;
        }
        
        onHarvest() {
            this.plantData.growthStage = this.plantData.plantTemplate.regrowthStage || 
                                        Math.floor(this.plantData.plantTemplate.growthStages / 2);
            this.plantData.onGrowthStageChange();
            this.plantData.harvestCount++;
            return true; // Keep the plant
        }
    }

    // Make strategies globally available
    window.HDB_GardeningStrategies = {
        PlantGrowthStrategy,
        StandardGrowthStrategy,
        BulbGrowthStrategy,
        VineGrowthStrategy
    };

})(); 