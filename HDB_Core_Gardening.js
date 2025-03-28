/*:
 * @plugindesc v1.0.0_beta Gardening System for RPG Maker MV
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @param Plant Database
 * @text Plant Database
 * @type struct<PlantData>[]
 * @desc Define plant types and their properties
 * @default [{"id":"carrot","name":"Carrot","type":"standard","stages":3,"daysPerStage":3,"seasons":[0,1,2],"multiHarvest":false},{"id":"potato","name":"Potato","type":"bulb","stages":3,"daysPerStage":4,"seasons":[0,1],"multiHarvest":false},{"id":"morning_glory","name":"Morning Glory","type":"vine","stages":3,"daysPerStage":2,"seasons":[1],"multiHarvest":true,"harvestInterval":3}]
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
 * @help This plugin provides a gardening system that integrates with the HDB Time System.
 * It handles plant growth, harvesting, and quality management.
 * 
 * =============================================================================
 * Plugin Dependencies
 * =============================================================================
 * 
 * This plugin requires:
 * - HDB_Core_TimeClock.js
 * - HDB_Core_SaveTackOns.js
 * 
 * Make sure these plugins are loaded BEFORE this one in the plugin manager.
 * 
 * =============================================================================
 * Plant Systems
 * =============================================================================
 * 
 * The plugin provides several plant systems that can be combined:
 * 
 * 1. Growth Types
 *    - Standard: Single harvest, fixed stages
 *    - Vine: Multi-harvest, climbing growth
 *    - Bulb: Multi-harvest, underground growth
 * 
 * 2. Care Systems
 *    - Watering: Affects growth rate and quality
 *    - Fertilization: Affects yield and quality
 *    - Pollination: Affects seed production
 * 
 * 3. Harvest Systems
 *    - Single harvest: Plant is removed after harvest
 *    - Multi-harvest: Plant continues producing
 *    - Seed collection: Plants can produce seeds
 * 
 * =============================================================================
 * Plugin Commands
 * =============================================================================
 * 
 * HDB_PLANT INIT plantId
 * - Initializes a new plant with the specified plant ID
 * 
 * HDB_PLANT WATER
 * - Waters the current plant
 * 
 * HDB_PLANT FERTILIZE
 * - Fertilizes the current plant
 * 
 * HDB_PLANT HARVEST
 * - Harvests the current plant if ready
 * 
 * HDB_PLANT STATUS
 * - Displays current plant status
 * 
 * HDB_PLANT SPAWN plantType
 * - Spawns a new plant of the specified type at the player's current location
 */

/*~struct~PlantData:
 * @param id
 * @text Plant ID
 * @type string
 * @desc Unique identifier for this plant
 * 
 * @param name
 * @text Plant Name
 * @type string
 * @desc Display name for this plant
 * 
 * @param type
 * @text Growth Type
 * @type select
 * @option standard
 * @option vine
 * @option bulb
 * @desc Growth type (standard, vine, bulb)
 * 
 * @param stages
 * @text Growth Stages
 * @type number
 * @min 1
 * @max 5
 * @desc Number of growth stages
 * @default 3
 * 
 * @param daysPerStage
 * @text Days Per Stage
 * @type number
 * @min 1
 * @max 10
 * @desc Days required for each growth stage
 * @default 3
 * 
 * @param seasons
 * @text Growing Seasons
 * @type string
 * @desc Comma-separated list of seasons (0:Spring, 1:Summer, 2:Fall, 3:Winter)
 * @default 0,1,2
 * 
 * @param multiHarvest
 * @text Multi-Harvest
 * @type boolean
 * @desc Whether this plant type can be harvested multiple times
 * @default false
 * 
 * @param harvestInterval
 * @text Harvest Interval
 * @type number
 * @min 1
 * @max 10
 * @desc Days between harvests for multi-harvest plants
 * @default 3
 */

(function() {
    // Initialize logger with safety check
    let logger;
    if (window.HDB_Logger) {
        logger = window.HDB_Logger.forPlugin('HDB_Core_Gardening');
        logger.info('Gardening system logger initialized');
    } else {
        // Fallback logger if HDB_Logger isn't available
        logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            group: () => {},
            groupEnd: () => {}
        };
        console.warn('HDB_Logger not available, using fallback logger');
    }

    // Plant templates for spawning
    const PLANT_TEMPLATES = {
        carrot: {
            templateName: "CarrotPlant",
            plantId: "carrot",
            initialData: {
                waterLevel: 50,
                quality: 1,
                wateredToday: false,
                fertilized: false,
                harvestCount: 0
            }
        }
        // Add more plant templates here as needed
    };

    // Plant class to manage individual plant instances
    class Plant {
        constructor(plantData, eventId) {
            this.plantData = plantData;
            this.eventId = eventId;
            this.plantDay = $gameHDB.time.getCurrentTime().day;
            this.plantSeason = $gameHDB.time.getCurrentTime().season;
            this.plantYear = $gameHDB.time.getCurrentTime().year;
            this.growthStage = 0;
            this.waterLevel = 50;
            this.quality = 1;
            this.yield = this.calculateYield();
            this.wateredToday = false;
            this.fertilized = false;
            this.pollinationStatus = 0;
            this.lastHarvestDay = null;
            this.harvestCount = 0;

            logger.info(`New plant created: ${plantData.name} (Event ${eventId})`);
        }

        calculateYield() {
            // Base yield calculation based on plant type
            const baseYield = this.plantData.multiHarvest ? 1 : 2;
            // Modify based on care
            const careBonus = (this.waterLevel / 100) + (this.fertilized ? 0.5 : 0);
            return Math.floor(baseYield * (1 + careBonus));
        }

        update() {
            const currentTime = $gameHDB.time.getCurrentTime();
            const daysSincePlanting = this.getDaysSincePlanting(currentTime);
            
            // Update growth stage based on days passed
            const daysPerStage = this.plantData.daysPerStage;
            const newStage = Math.min(
                Math.floor(daysSincePlanting / daysPerStage),
                this.plantData.stages - 1
            );

            logger.debug(`Plant ${this.plantData.name} (Event ${this.eventId}) update check:`, {
                currentTime,
                daysSincePlanting,
                daysPerStage,
                currentStage: this.growthStage,
                newStage,
                plantDay: this.plantDay,
                plantSeason: this.plantSeason,
                plantYear: this.plantYear,
                calculation: {
                    daysSincePlanting,
                    daysPerStage,
                    division: daysSincePlanting / daysPerStage,
                    floor: Math.floor(daysSincePlanting / daysPerStage),
                    min: Math.min(Math.floor(daysSincePlanting / daysPerStage), this.plantData.stages - 1)
                }
            });

            // Only log significant stage changes
            if (newStage !== this.growthStage) {
                logger.info(`Plant ${this.plantData.name} (Event ${this.eventId}) growth stage changed:`, {
                    oldStage: this.growthStage,
                    newStage,
                    daysSincePlanting,
                    daysPerStage,
                    calculation: {
                        daysSincePlanting,
                        daysPerStage,
                        division: daysSincePlanting / daysPerStage,
                        floor: Math.floor(daysSincePlanting / daysPerStage),
                        min: Math.min(Math.floor(daysSincePlanting / daysPerStage), this.plantData.stages - 1)
                    }
                });
                this.growthStage = newStage;
                this.onGrowthStageChange();
            }

            // Update water level
            if (!this.wateredToday) {
                this.waterLevel = Math.max(0, this.waterLevel - 10);
            }
            this.wateredToday = false;

            // Check if plant is ready to harvest
            if (this.isReadyToHarvest(currentTime)) {
                this.readyToHarvest = true;
                logger.info(`Plant ${this.plantData.name} (Event ${this.eventId}) is ready to harvest`);
            }
        }

        isReadyToHarvest(currentTime) {
            if (this.growthStage < this.plantData.stages - 1) return false;
            
            if (this.plantData.multiHarvest) {
                if (!this.lastHarvestDay) return true;
                const daysSinceLastHarvest = this.getDaysSinceLastHarvest(currentTime);
                return daysSinceLastHarvest >= this.plantData.harvestInterval;
            }
            
            return true;
        }

        getDaysSinceLastHarvest(currentTime) {
            if (!this.lastHarvestDay) return 0;
            return this.getDaysSincePlanting(currentTime) - this.lastHarvestDay;
        }

        getDaysSincePlanting(currentTime) {
            let days = 0;
            let currentDay = currentTime.day;
            let currentSeason = currentTime.season;
            let currentYear = currentTime.year;

            // Calculate total days since planting
            days = (currentYear - this.plantYear) * 28 * 4 +  // Years
                  (currentSeason - this.plantSeason) * 28 +  // Seasons
                  (currentDay - this.plantDay);              // Days

            logger.debug(`Days since planting calculation for ${this.plantData.name} (Event ${this.eventId}):`, {
                currentTime,
                plantTime: {
                    day: this.plantDay,
                    season: this.plantSeason,
                    year: this.plantYear
                },
                calculatedDays: days
            });

            return days;
        }

        onGrowthStageChange() {
            logger.info(`Plant ${this.plantData.name} (Event ${this.eventId}) grew to stage ${this.growthStage}`);
            const event = $gameMap.event(this.eventId);
            if (event) {
                event.requestAnimation([1]);
            }
        }

        water() {
            if (!this.wateredToday) {
                this.waterLevel = Math.min(100, this.waterLevel + 30);
                this.wateredToday = true;
                this.quality = Math.min(3, this.quality + 0.5);
                logger.info(`Watered plant ${this.plantData.name} (Event ${this.eventId})`);
                return true;
            }
            return false;
        }

        fertilize() {
            if (!this.fertilized) {
                this.fertilized = true;
                this.quality = Math.min(3, this.quality + 0.5);
                this.yield = this.calculateYield();
                logger.info(`Fertilized plant ${this.plantData.name} (Event ${this.eventId})`);
                return true;
            }
            return false;
        }

        harvest() {
            if (!this.isReadyToHarvest($gameHDB.time.getCurrentTime())) return false;
            
            const harvestData = {
                type: this.plantData.id,
                yield: this.yield,
                quality: this.quality,
                daysGrown: this.getDaysSincePlanting($gameHDB.time.getCurrentTime())
            };

            this.lastHarvestDay = this.getDaysSincePlanting($gameHDB.time.getCurrentTime());
            this.harvestCount++;
            
            // Reset for next harvest if multi-harvest
            if (this.plantData.multiHarvest) {
                this.readyToHarvest = false;
                this.fertilized = false;
            }

            logger.info(`Harvested plant ${this.plantData.name} (Event ${this.eventId})`, harvestData);
            return harvestData;
        }
    }

    // Gardening system class
    class GardeningSystem {
        constructor() {
            this.plantDatabase = this.loadPlantDatabase();
            this.plantTemplates = PLANT_TEMPLATES;
            this.plants = new Map(); // Store plant instances
            logger.info('Gardening system initialized', {
                plantDatabase: this.plantDatabase,
                plantTemplates: this.plantTemplates
            });
        }

        loadPlantDatabase() {
            const params = PluginManager.parameters('HDB_Core_Gardening');
            const plantDatabase = JSON.parse(params['Plant Database'] || '[]');
            logger.info('Loaded plant database', {
                params,
                plantDatabase,
                pluginName: 'HDB_Core_Gardening'
            });
            return plantDatabase;
        }

        getPlantData(id) {
            return this.plantDatabase.find(plant => plant.id === id);
        }

        getPlant(eventId) {
            // First check if we already have this plant instance
            if (this.plants.has(eventId)) {
                return this.plants.get(eventId);
            }
            return null;
        }

        updatePlants() {
            // Update all plants in our Map
            this.plants.forEach((plant, eventId) => {
                plant.update();
            });
        }

        spawnPlant(templateId, x, y) {
            if (!this.plantTemplates[templateId]) {
                console.error(`Invalid plant template ID: ${templateId}`);
                return null;
            }

            const template = this.plantTemplates[templateId];
            
            // Log all available common events
            const availableEvents = $dataCommonEvents
                .filter(event => event && event.name) // Filter out null events
                .map((event, index) => ({
                    id: index,
                    name: event.name
                }));
            
            console.log('Available common events:', availableEvents);
            console.log(`Attempting to spawn plant template: ${template.templateName}`, {
                template,
                x,
                y,
                availableEvents
            });

            // Check if Yanfly.SpawnEventTemplateAt exists
            if (typeof Yanfly === 'undefined' || typeof Yanfly.SpawnEventTemplateAt !== 'function') {
                console.error('Yanfly.SpawnEventTemplateAt is not available');
                return null;
            }

            try {
                console.log(`Attempting to spawn event with template: ${template.templateName}`);
                const eventId = Yanfly.SpawnEventTemplateAt(template.templateName, x, y, true);
                
                // Check if the event exists on the map even if SpawnEventTemplateAt returned null
                const foundEvent = $gameMap.events().find(event => 
                    event && event.x === x && event.y === y
                );
                const spawnedEvent = $gameMap.event(eventId || (foundEvent ? foundEvent.eventId() : null));
                
                if (!spawnedEvent) {
                    console.error(`Failed to spawn plant template: ${template.templateName}`);
                    return null;
                }

                const actualEventId = spawnedEvent.eventId();
                console.log(`Event spawned with ID: ${actualEventId}`);

                // Get the plant data from our database
                const plantData = this.getPlantData(template.plantId);
                if (!plantData) {
                    console.error(`Failed to get plant data for ${template.plantId}`, {
                        plantDatabase: this.plantDatabase,
                        templateId,
                        template
                    });
                    return null;
                }

                // Create and store the plant instance
                const plant = new Plant(plantData, actualEventId);
                this.plants.set(actualEventId, plant);

                console.log(`Successfully created plant for event ${actualEventId}`, {
                    eventId: actualEventId,
                    plantId: template.plantId,
                    plant: plant,
                    currentPlants: Array.from(this.plants.entries()).map(([id, plant]) => ({
                        id,
                        name: plant.plantData.name
                    }))
                });

                return actualEventId;
            } catch (error) {
                console.error(`Error spawning plant: ${error.message}`);
                return null;
            }
        }
    }

    // Create global instance
    if (typeof $gameHDB === 'undefined') {
        $gameHDB = {};
    }

    // Initialize gardening system when the game starts
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        $gameHDB.gardening = new GardeningSystem();
    };

    // Ensure gardening system is initialized after time system
    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        
        // Only initialize time system if it exists and is ready
        if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
            console.log('Time system is ready, gardening system initialized');
        } else {
            console.log('Waiting for time system to be ready...', {
                hasGameHDB: !!$gameHDB,
                hasTimeSystem: !!($gameHDB && $gameHDB.time),
                isTimeSystemReady: !!($gameHDB && $gameHDB.time && $gameHDB.time.isReady)
            });
        }
    };

    // Scene update handling
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        // Update time system first if it exists and is ready
        if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
            $gameHDB.time.update();
        }
        
        // Then update gardening system if it exists
        if ($gameHDB && $gameHDB.gardening) {
            $gameHDB.gardening.updatePlants();
        }
        
        _Scene_Map_update.call(this);
    };

    // Add map change handling
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        if ($gameHDB && $gameHDB.gardening) {
            // Load plant data first
            $gameHDB.gardening.updatePlants();
            
            // Then update all plants to their current state
            $gameHDB.gardening.updatePlants();
            
            // Log the current state of all plants
            console.log('Map setup complete, current plants:', 
                Array.from($gameHDB.gardening.plants.entries()).map(([eventId, plant]) => ({
                    eventId,
                    name: plant.plantData.name,
                    stage: plant.growthStage,
                    waterLevel: plant.waterLevel
                }))
            );
        }
    };

    // Plugin command handling
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        if (command === 'HDB_PLANT') {
            // Ensure gardening system exists
            if (!$gameHDB.gardening) {
                console.log('Initializing gardening system');
                $gameHDB.gardening = new GardeningSystem();
            }

            console.log('Plant plugin command received', { 
                command, 
                args, 
                eventId: this.eventId(),
                hasGameHDB: !!$gameHDB,
                hasTimeSystem: !!($gameHDB && $gameHDB.time),
                isTimeSystemReady: !!($gameHDB && $gameHDB.time && $gameHDB.time.isReady),
                hasGardeningSystem: !!($gameHDB && $gameHDB.gardening),
                plantDatabase: $gameHDB.gardening ? $gameHDB.gardening.plantDatabase : null,
                plantTemplates: $gameHDB.gardening ? $gameHDB.gardening.plantTemplates : null
            });
            
            // Ensure time system is ready
            if (!$gameHDB || !$gameHDB.time || !$gameHDB.time.isReady) {
                console.error('Time system not ready for plant command');
                logger.error('Time system not ready for plant command');
                $gameMessage.add('Time system not ready. Please try again.');
                return;
            }

            const eventId = this.eventId();
            const plant = $gameHDB.gardening.getPlant(eventId);
            
            console.log('Processing plant command', {
                command: args[0],
                eventId,
                hasPlant: !!plant,
                plantData: plant ? {
                    name: plant.plantData.name,
                    stage: plant.growthStage,
                    waterLevel: plant.waterLevel
                } : null
            });
            
            switch (args[0]) {
                case 'STATUS':
                    // Get the event ID from the variable if it's a spawned plant
                    const statusEventId = $gameVariables.value(1) || this.eventId();
                    logger.info('Checking plant status', {
                        statusEventId,
                        event: $gameMap.event(statusEventId),
                        plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, plant]) => ({
                            id,
                            name: plant.plantData.name
                        }))
                    });
                    
                    const statusPlant = $gameHDB.gardening.getPlant(statusEventId);
                    
                    if (statusPlant) {
                        const status = `Plant: ${statusPlant.plantData.name}\nStage: ${statusPlant.growthStage + 1}/${statusPlant.plantData.stages}\nWater: ${statusPlant.waterLevel}%\nQuality: ${statusPlant.quality}\nYield: ${statusPlant.yield}\nHarvests: ${statusPlant.harvestCount}`;
                        $gameMessage.add(status);
                    } else {
                        console.log('No plant found for status display', { 
                            statusEventId,
                            event: $gameMap.event(statusEventId),
                            plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, plant]) => ({
                                id,
                                name: plant.plantData.name
                            }))
                        });
                        $gameMessage.add('No plant found at this location.');
                    }
                    break;
                    
                case 'WATER':
                    if (plant) {
                        if (!plant.wateredToday) {
                            plant.waterLevel = Math.min(100, plant.waterLevel + 30);
                            plant.wateredToday = true;
                            plant.quality = Math.min(3, plant.quality + 0.5);
                            
                            $gameMap.event(eventId).requestAnimation([2]);
                            $gameMessage.add(`Watered ${plant.plantData.name}`);
                        } else {
                            $gameMessage.add(`${plant.plantData.name} has already been watered today.`);
                        }
                    } else {
                        $gameMessage.add('No plant to water here.');
                    }
                    break;
                    
                case 'FERTILIZE':
                    if (plant) {
                        if (!plant.fertilized) {
                            plant.fertilized = true;
                            plant.quality = Math.min(3, plant.quality + 0.5);
                            plant.yield = this.calculateYield(plant);
                            
                            $gameMap.event(eventId).requestAnimation([3]);
                            $gameMessage.add(`Fertilized ${plant.plantData.name}`);
                        } else {
                            $gameMessage.add(`${plant.plantData.name} has already been fertilized.`);
                        }
                    } else {
                        $gameMessage.add('No plant to fertilize here.');
                    }
                    break;
                    
                case 'HARVEST':
                    if (plant) {
                        if (this.isReadyToHarvest(plant)) {
                            const harvestData = this.harvest(plant);
                            $gameMap.event(eventId).requestAnimation([4]);
                            // Give harvest items
                            $gameParty.gainItem($dataItems[102], harvestData.yield);
                            $gameMessage.add(`Harvested ${harvestData.yield} ${plant.plantData.name}(s)!`);
                            
                            if (!plant.plantData.multiHarvest) {
                                $gameMap.event(eventId).erase();
                            }
                        } else {
                            $gameMessage.add(`${plant.plantData.name} is not ready to harvest.`);
                        }
                    } else {
                        $gameMessage.add('No plant to harvest here.');
                    }
                    break;
                    
                case 'SPAWN':
                    if (args[1]) {
                        const x = $gamePlayer.x - 1; // Plant one tile in front
                        const y = $gamePlayer.y;
                        console.log(`Attempting to spawn plant at (${x}, ${y})`, {
                            templateId: args[1],
                            playerX: $gamePlayer.x,
                            playerY: $gamePlayer.y,
                            plantTemplates: $gameHDB.gardening.plantTemplates
                        });
                        
                        const spawnedEventId = $gameHDB.gardening.spawnPlant(args[1], x, y);
                        
                        if (spawnedEventId) {
                            $gameMessage.add(`Planted ${args[1]}`);
                            console.log(`Successfully spawned plant ${args[1]}`, { 
                                spawnedEventId,
                                event: $gameMap.event(spawnedEventId),
                                plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, plant]) => ({
                                    id,
                                    name: plant.plantData.name
                                }))
                            });
                            // Store the spawned event ID for future reference
                            $gameVariables.setValue(1, spawnedEventId); // Using variable 1 to store the last planted event ID
                        } else {
                            $gameMessage.add('Failed to plant.');
                            console.error(`Failed to spawn plant ${args[1]}`);
                        }
                    } else {
                        $gameMessage.add('Invalid plant type.');
                        console.error('No plant type specified for spawn command');
                    }
                    break;
            }
        }
    };
})(); 