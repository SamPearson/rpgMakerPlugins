/// <reference path="./rpg-maker-mv-docs.d.ts" />
/*:
 * @plugindesc v1.0.0 Core Gardening System for RPG Maker MV
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @param Template Map ID
 * @type number
 * @min 1
 * @desc ID of the map containing plant template events
 * @default 1
 * 
 * @param Growth Stage Variable
 * @type number
 * @min 1
 * @desc Self variable ID used to track plant growth stages
 * @default 52
 * 
 * @param Logging
 * @text Logging Configuration
 * 
 * @param logLevel
 * @parent Logging
 * @type select
 * @option ERROR
 * @option WARN
 * @option INFO
 * @option DEBUG
 * @desc Minimum log level to display
 * @default INFO
 * 
 * @help 
 * =============================================================================
 * HDB Gardening Core
 * =============================================================================
 * 
 * This plugin provides the core gardening system functionality.
 * It handles plant growth, harvesting, and management.
 * 
 * Plugin Dependencies:
 * - HDB_TimeClock_Core.js
 * - HDB_SaveTackOns_Core.js
 * - HDB_Logger_Core.js
 * - YEP_EventSpawner.js
 * 
 * Load Order:
 * 1. HDB_Gardening_Core.js
 * 2. HDB_Gardening_GrowthTypes.js
 * 3. HDB_Gardening_PlantList.js
 * 
 * =============================================================================
 * Plugin Commands
 * =============================================================================
 * 
 * HDB_PLANT SPAWN <plantName>
 * - Creates a new plant of the specified type at the player's current location
 * 
 * HDB_PLANT WATER
 * - Waters the current plant
 * 
 * HDB_PLANT HARVEST
 * - Harvests the current plant if ready
 * 
 * HDB_PLANT STATUS
 * - Displays current plant status
 */

(function() {
    'use strict';

    // Initialize logger
    const logger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_Gardening_Core') : { log: () => {} };

    // Get plugin parameters
    const params = PluginManager.parameters('HDB_Gardening_Core');
    const TEMPLATE_MAP_ID = Number(params['Template Map ID']) || 1;
    const GROWTH_STAGE_VARIABLE = Number(params['Growth Stage Variable']) || 52;

    // Add logging for template map ID
    logger.log('INFO', `Template Map ID set to: ${TEMPLATE_MAP_ID}`);

    // Command pattern
    class GardenCommand {
        constructor(receiver) {
            this.receiver = receiver;
        }
        
        execute() {
            throw new Error('execute() must be implemented by subclass');
        }

    }



    // Plant data structure
    class PlantData {
        constructor(plantTemplate, eventId, mapId) {
            this.plantTemplate = plantTemplate;
            this.eventId = eventId;
            this.mapId = mapId;
            this.plantedTime = window.HDB_TimeSystem.getInstance().getCurrentTime();
            this.growthStage = 0;
            this.quality = 1.0;
            this.harvestCount = 0;
            this.isDead = false;

            // Initialize growth strategy
            this.initializeGrowthStrategy();

            logger.log('DEBUG', `Created new plant data: ${JSON.stringify({
                template: plantTemplate.id,
                eventId: eventId,
                mapId: mapId,
                plantedTime: this.plantedTime,
                growthType: plantTemplate.growthType || 'standard'
            })}`);
        }

        initializeGrowthStrategy() {
            const strategies = window.HDB_GardeningStrategies;
            if (!strategies) {
                logger.log('ERROR', 'Growth strategies not found. Defaulting to basic growth behavior.');
                return;
            }

            const growthType = this.plantTemplate.growthType || 'standard';
            
            switch(growthType) {
                case 'bulb':
                    this.growthStrategy = new strategies.BulbGrowthStrategy(this);
                    break;
                case 'vine':
                    this.growthStrategy = new strategies.VineGrowthStrategy(this);
                    break;
                default:
                    this.growthStrategy = new strategies.StandardGrowthStrategy(this);
            }
        }

        updateGrowth() {
            const currentTime = window.HDB_TimeSystem.getInstance().getCurrentTime();
            if (this.growthStrategy) {
                this.growthStrategy.updateGrowth(currentTime);
            } else {
                // Fallback to basic growth if no strategy is available
                const daysSincePlanting = this.getDaysSincePlanting(currentTime);
            const newStage = Math.min(
                    Math.floor(daysSincePlanting / this.plantTemplate.daysPerStage),
                    this.plantTemplate.growthStages - 1
                );
                
            if (newStage !== this.growthStage) {
                this.growthStage = newStage;
                this.onGrowthStageChange();
            }
            }
        }

        isHarvestable() {
            if (this.growthStrategy) {
                return this.growthStrategy.isHarvestable();
            }
            return this.isFullyGrown();
        }

        isFullyGrown() {
            return this.growthStage >= this.plantTemplate.growthStages - 1;
        }

        onHarvest() {
            if (this.growthStrategy) {
                return this.growthStrategy.onHarvest();
            }
            return false; // Default behavior: remove plant after harvest
        }

        getDaysSincePlanting(currentTime) {
            if (!currentTime) {
                currentTime = window.HDB_TimeSystem.getInstance().getCurrentTime();
            }

            const daysInYear = (currentTime.year - this.plantedTime.year) * 112;
            const daysInSeason = (currentTime.season - this.plantedTime.season) * 28;
            const days = currentTime.day - this.plantedTime.day;
            
            return daysInYear + daysInSeason + days;
        }

        onGrowthStageChange() {
            if (!this.mapId || !this.eventId) return;

            const key = [this.mapId, this.eventId, `SELF VARIABLE ${GROWTH_STAGE_VARIABLE}`];
            $gameSelfSwitches.setValue(key, this.growthStage);
            
            logger.log('INFO', `Plant ${this.plantTemplate.id} (Event ${this.eventId}) grew to stage ${this.growthStage}`);
        }

        modifyQuality(amount) {
            this.quality = Math.max(0, Math.min(3, this.quality + amount));
            logger.log('DEBUG', `Plant ${this.plantTemplate.id} quality modified by ${amount}, new quality: ${this.quality}`);
        }
    }

    // Specific commands
    class SpawnPlantCommand extends GardenCommand {
        constructor(receiver, plantName, x, y) {
            super(receiver);
            this.plantName = plantName;
            this.x = x;
            this.y = y;
        }

        execute() {
            logger.log('DEBUG', `Plant types available: ${Array.from(this.receiver.plantTypes.keys()).join(', ')}`);
            const template = Array.from(this.receiver.plantTypes.values())
                .find(t => t.name.toLowerCase() === this.plantName.toLowerCase());
            
            if (!template) {
                logger.log('ERROR', `Unknown plant type: ${this.plantName}. Available plants: ${Array.from(this.receiver.plantTypes.values()).map(t => t.name).join(', ')}`);
                $gameMessage.add(`Unknown plant type: ${this.plantName}`);
                return false;
            }

            logger.log('DEBUG', `Found template: ${JSON.stringify(template)}`);

            // Calculate spawn position based on player's direction
            let x = $gamePlayer.x;
            let y = $gamePlayer.y;
            logger.log('INFO', `attempting to plant at xy of ${x}, ${y}`)

            switch ($gamePlayer.direction()) {
                case 2: // Down
                    y += 1;
                    logger.log('INFO', `player facing down, moved y value to ${y}`)
                    break;
                case 4: // Left
                    x -= 1;
                    logger.log('INFO', `player facing left, moved y value to ${x}`)
                    break;
                case 6: // Right
                    x += 1;
                    logger.log('INFO', `player facing right, moved y value to ${x}`)
                    break;
                case 8: // Up
                    y -= 1;
                    logger.log('INFO', `player facing up, moved y value to ${y}`)
                    break;
            }

            if (!template.templateName) {
                logger.log('ERROR', `Template ${template.name} is missing templateName property`);
                return false;
            }

            if (typeof Yanfly === 'undefined' || typeof Yanfly.SpawnEventTemplateAt !== 'function') {
                logger.log('ERROR', 'Yanfly.SpawnEventTemplateAt is not available');
            return false;
        }

            logger.log('DEBUG', `Using template map ID: ${TEMPLATE_MAP_ID}`);
            
            if (!$dataMapInfos[TEMPLATE_MAP_ID]) {
                logger.log('ERROR', `Template map ID ${TEMPLATE_MAP_ID} not found in $dataMapInfos`);
                return false;
            }
            
            const templateEvent = Yanfly.PreloadedMaps[TEMPLATE_MAP_ID] ? 
                Yanfly.PreloadedMaps[TEMPLATE_MAP_ID].events.find(e => e && e.name === template.templateName) : null;
            
            if (!templateEvent) {
                logger.log('ERROR', `Template event '${template.templateName}' not found in map ${TEMPLATE_MAP_ID}`);
                logger.log('DEBUG', `Available events in template map: ${
                    Yanfly.PreloadedMaps[TEMPLATE_MAP_ID] ? 
                    Yanfly.PreloadedMaps[TEMPLATE_MAP_ID].events
                        .filter(e => e)
                        .map(e => e.name)
                        .join(', ') : 
                    'Map not loaded'
                }`);
                return false;
            }

            logger.log('DEBUG', `Found template event: ${template.templateName} (ID: ${templateEvent.id})`);

            const spawnedEventId = Yanfly.SpawnEventTemplateAt(template.templateName, this.x, this.y, true);
            logger.log('DEBUG', `Yanfly spawn result: ${spawnedEventId}`);
            
            const events = $gameMap.eventsXy(this.x, this.y);
            const spawnedEvent = events[events.length - 1];
            
            if (!spawnedEvent) {
                logger.log('ERROR', `No event found at position (${this.x}, ${this.y}) after spawn attempt`);
                return false;
            }

            const actualEventId = spawnedEvent.eventId();
            logger.log('DEBUG', `Found spawned event with ID: ${actualEventId}`);

            try {
                const plant = this.receiver.createPlant(template.id, actualEventId, $gameMap.mapId());
                if (!plant) {
                    logger.log('ERROR', `Failed to create plant data for ${template.name}`);
                    return false;
                }

                logger.log('DEBUG', `Successfully registered plant with event ID: ${actualEventId}`);
                $gameMessage.add(`Planted ${template.name}`);
                return true;
            } catch (e) {
                logger.log('ERROR', `Error creating plant: ${e.message}`);
                return false;
            }
        }
    }

    class HarvestPlantCommand extends GardenCommand {
        constructor(receiver, eventId) {
            super(receiver);
            this.eventId = eventId;
        }

        execute() {
            const plant = this.receiver.activePlants.get(this.eventId);
            if (!plant) {
                $gameMessage.add('No plant to harvest here.');
                return false;
            }

            if (!plant.isHarvestable()) {
                $gameMessage.add(`${plant.plantTemplate.name} is not ready to harvest.`);
                return false;
            }

            // Calculate harvest yield based on quality
            const baseYield = plant.plantTemplate.baseYield || 1;
            const qualityBonus = Math.floor(plant.quality);
            const totalYield = plant.plantTemplate.qualityYieldMultiplier ? 
                baseYield * (qualityBonus || 1) : baseYield + qualityBonus;

            // Give items to player
            const itemId = plant.plantTemplate.harvestItemId || 1;
            $gameParty.gainItem($dataItems[itemId], totalYield);

            $gameMessage.add(`Harvested ${totalYield} ${plant.plantTemplate.name}(s)!`);

            // Use strategy to determine post-harvest behavior
            const keepPlant = plant.onHarvest();
            
            if (!keepPlant) {
                this.receiver.activePlants.delete(this.eventId);
                $gameMap.event(this.eventId).erase();
            }

            return true;
        }
    }

    class WaterPlantCommand extends GardenCommand {
        constructor(receiver, eventId) {
            super(receiver);
            this.eventId = eventId;
        }

        execute() {
            const plant = this.receiver.activePlants.get(this.eventId);
            if (!plant) {
                $gameMessage.add('No plant to water here.');
                return false;
            }

            plant.modifyQuality(0.5);
            $gameMessage.add(`Watered ${plant.plantTemplate.name}`);
            return true;
        }
    }

    class StatusPlantCommand extends GardenCommand {
        constructor(receiver, eventId) {
            super(receiver);
            this.eventId = eventId;
        }

        execute() {
            const plant = this.receiver.activePlants.get(this.eventId);
            if (!plant) {
                $gameMessage.add('No plant here.');
                return false;
            }

            const currentTime = window.HDB_TimeSystem.getInstance().getCurrentTime();
            const daysSincePlanting = plant.getDaysSincePlanting(currentTime);
            
            const status = [
                `${plant.plantTemplate.name}`,
                `Growth: Stage ${plant.growthStage + 1}/${plant.plantTemplate.growthStages}`,
                `Age: ${daysSincePlanting} days`,
                `Quality: ${plant.quality.toFixed(1)}`
            ].join('\n');

            $gameMessage.add(status);
            return true;
        }
    }

    // Gardening system manager
    class GardeningManager {
        constructor() {
            this.plantTypes = new Map();
            this.activePlants = new Map();
            this.initialize();
        }

        initialize() {
            logger.log('INFO', 'Initializing gardening system');
            this.setupSaveSystem();
        }

        setupSaveSystem() {
            if ($gameHDB && $gameHDB.save) {
                $gameHDB.save.initializePlugin('gardening', {
                    plantTypes: {},
                    activePlants: {}
                });
            }
        }

        registerPlantType(template) {
            if (!template.id || !template.name) {
                logger.log('ERROR', 'Invalid plant template:', template);
                return false;
            }

            const requiredProps = ['growthStages', 'daysPerStage'];
            for (const prop of requiredProps) {
                if (template[prop] === undefined) {
                    logger.log('ERROR', `Missing required property ${prop} in plant template:`, template);
                    return false;
                }
            }

            this.plantTypes.set(template.id, template);
            logger.log('INFO', `Registered plant type: ${template.id}`);
            return true;
        }

        getPlantType(id) {
            return this.plantTypes.get(id);
        }

        createPlant(templateId, eventId, mapId) {
            const template = this.getPlantType(templateId);
            if (!template) {
                logger.log('ERROR', `Unknown plant type: ${templateId}`);
                return null;
            }

            const plant = new PlantData(template, eventId, mapId);
            this.activePlants.set(eventId, plant);
            
            logger.log('INFO', `Created new plant: ${templateId} (Event ${eventId})`);
            return plant;
        }

        updatePlants() {
            for (const plant of this.activePlants.values()) {
                plant.updateGrowth();
            }
        }

        saveData() {
            if ($gameHDB && $gameHDB.save) {
                const saveData = {
                    plantTypes: Object.fromEntries(this.plantTypes),
                    activePlants: Object.fromEntries(this.activePlants)
                };
                $gameHDB.save.setPluginData('gardening', saveData);
            }
        }

        loadData() {
            if ($gameHDB && $gameHDB.save) {
                const data = $gameHDB.save.getPluginData('gardening');
                if (data) {
                    this.plantTypes = new Map(Object.entries(data.plantTypes));
                    this.activePlants = new Map(Object.entries(data.activePlants));
                }
            }
        }

        executeCommand(command, args, eventId) {
            logger.log('DEBUG', `Executing garden command: ${command} with args: ${JSON.stringify(args)}`);
            
            switch (command.toUpperCase()) {
                case 'SPAWN': {
                    const plantName = args[0];
                    logger.log('DEBUG', `Searching for plant template with name: ${plantName}`);
                    
                    // Calculate spawn position based on player's direction
                    let x = $gamePlayer.x;
                    let y = $gamePlayer.y;
                    
                    switch ($gamePlayer.direction()) {
                        case 2: // Down
                            y += 1;
                            break;
                        case 4: // Left
                            x -= 1;
                            break;
                        case 6: // Right
                            x += 1;
                            break;
                        case 8: // Up
                            y -= 1;
                            break;
                    }
                    
                    logger.log('INFO', `attempting to plant at xy of ${x}, ${y}`);
                    return new SpawnPlantCommand(this, plantName, x, y).execute();
                }
                
                case 'WATER':
                    return new WaterPlantCommand(this, eventId).execute();
                
                case 'HARVEST':
                    return new HarvestPlantCommand(this, eventId).execute();
                
                case 'STATUS':
                    return new StatusPlantCommand(this, eventId).execute();
                
                default:
                    logger.log('WARN', `Unknown garden command: ${command}`);
                    return false;
            }
        }
    }

    // Singleton pattern implementation
    const GardeningSystemSingleton = {
        _instance: null,
        
        getInstance() {
            if (!this._instance) {
                this._instance = new GardeningManager();
            }
            return this._instance;
        }
    };

    // Make singleton globally available
    window.HDB_GardeningSystem = GardeningSystemSingleton;

    // Create global instance
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        if (!$gameHDB) $gameHDB = {};
        $gameHDB.gardening = window.HDB_GardeningSystem.getInstance();
    };

    // Update hook
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if ($gameHDB && $gameHDB.gardening) {
            $gameHDB.gardening.updatePlants();
        }
    };

    // Save/Load hooks
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        if ($gameHDB && $gameHDB.gardening) {
            $gameHDB.gardening.saveData();
        }
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if ($gameHDB && $gameHDB.gardening) {
            $gameHDB.gardening.loadData();
        }
    };

    // Update plugin command handling
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        if (command === 'HDB_PLANT') {
            const gardening = window.HDB_GardeningSystem.getInstance();
            if (!gardening) {
                logger.log('ERROR', 'Gardening system not initialized');
                return;
            }

            const subCommand = args[0];
            const subArgs = args.slice(1);
            const eventId = this.eventId();
            
            logger.log('DEBUG', `Processing plant command from event ID: ${eventId}`);
            
            if (!eventId && ['STATUS', 'WATER', 'HARVEST'].includes(subCommand.toUpperCase())) {
                const x = $gamePlayer.x;
                const y = $gamePlayer.y;
                const events = $gameMap.eventsXy(x, y);
                if (events.length > 0) {
                    const plantEvent = events[0];
                    logger.log('DEBUG', `Found plant event at player position: ${plantEvent.eventId()}`);
                    gardening.executeCommand(subCommand, subArgs, plantEvent.eventId());
                    return;
                }
            }

            gardening.executeCommand(subCommand, subArgs, eventId);
        }
    };
})(); 