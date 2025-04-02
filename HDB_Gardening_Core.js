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
 * @default [{"id":"carrot","name":"Carrot","type":"standard","stages":3,"daysPerStage":1,"seasons":[0,1,2],"multiHarvest":false},{"id":"potato","name":"Potato","type":"bulb","stages":3,"daysPerStage":1,"seasons":[0,1],"multiHarvest":false},{"id":"morning_glory","name":"Morning Glory","type":"vine","stages":3,"daysPerStage":2,"seasons":[1],"multiHarvest":true,"harvestInterval":3}]
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
 * - HDB_TimeClock_Core.js
 * - HDB_SaveTackOns_Core.js
 * - YEP_EventSpawner.js
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
    let logger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_Gardening_Core') : { log: () => {} };

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
        },
        cabbage: {
            templateName: "CabbagePlant",
            plantId: "cabbage",
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
        constructor(plantData, eventId, isRestored = false) {
            // If plantData is a template, extract the actual plant data
            if (!isRestored && plantData && plantData.templateName) {
                this.plantData = {
                    id: plantData.plantId,
                    name: plantData.plantId.charAt(0).toUpperCase() + plantData.plantId.slice(1), // Capitalize first letter
                    type: "standard",
                    stages: 3,
                    daysPerStage: 1,
                    seasons: [0, 1, 2],
                    multiHarvest: false
                };
            } else {
                // For restored plants, ensure we have all required properties
                this.plantData = {
                    id: plantData.id || 'unknown',
                    name: plantData.name || 'Unknown Plant',
                    type: plantData.type || 'standard',
                    stages: plantData.stages || 3,
                    daysPerStage: plantData.daysPerStage || 1,
                    seasons: plantData.seasons || [0, 1, 2],
                    multiHarvest: plantData.multiHarvest || false,
                    harvestInterval: plantData.harvestInterval || 3
                };
            }
            
            this.eventId = eventId;
            this.mapId = $gameMap.mapId(); // Store the map ID where the plant was spawned
            
            // Only set planting time for new plants
            if (!isRestored) {
                const currentTime = $gameHDB.time.getCurrentTime();
                console.log('Creating new plant with current time:', {
                    currentTime,
                    timeSystem: {
                        exists: !!$gameHDB.time,
                        isReady: $gameHDB.time ? $gameHDB.time.isReady : false,
                        currentTime: $gameHDB.time ? $gameHDB.time.currentTime : null,
                        currentDay: $gameHDB.time ? $gameHDB.time.currentDay : null,
                        currentSeason: $gameHDB.time ? $gameHDB.time.currentSeason : null,
                        currentYear: $gameHDB.time ? $gameHDB.time.currentYear : null
                    }
                });
                
                // Create a new time object to avoid reference issues
                this.plantDay = currentTime.day;
                this.plantSeason = currentTime.season;
                this.plantYear = currentTime.year;
            }
            
            this.growthStage = 0;
            this.waterLevel = 50;
            this.quality = 1;
            this.yield = this.calculateYield();
            this.wateredToday = false;
            this.fertilized = false;
            this.pollinationStatus = 0;
            this.lastHarvestDay = null;
            this.harvestCount = 0;

            logger.log('INFO', `New plant created: ${this.plantData.name} (Event ${eventId}): ` + JSON.stringify({
                isRestored,
                plantTime: {
                    day: this.plantDay,
                    season: this.plantSeason,
                    year: this.plantYear
                },
                currentTime: $gameHDB.time ? $gameHDB.time.getCurrentTime() : null,
                plantData: this.plantData
            }));
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

            // Log every update to track what's happening
            logger.log('INFO', `Plant ${this.plantData.name} (Event ${this.eventId}) update: ` + JSON.stringify({
                currentTime,
                daysSincePlanting,
                daysPerStage,
                currentStage: this.growthStage,
                newStage,
                plantTime: {
                    day: this.plantDay,
                    season: this.plantSeason,
                    year: this.plantYear
                },
                calculation: {
                    daysSincePlanting,
                    daysPerStage,
                    division: daysSincePlanting / daysPerStage,
                    floor: Math.floor(daysSincePlanting / daysPerStage),
                    min: Math.min(Math.floor(daysSincePlanting / daysPerStage), this.plantData.stages - 1)
                }
            }));

            // Only update if the stage has changed
            if (newStage !== this.growthStage) {
                this.growthStage = newStage;
                this.onGrowthStageChange();
            }

            // Update water level
            if (!this.wateredToday) {
                this.waterLevel = Math.max(0, this.waterLevel - 10);
            }
            this.wateredToday = false;

            // Update harvest status
            this.updateHarvestStatus();
        }

        isReadyToHarvest(currentTime) {
            // First check if plant is fully grown
            if (this.growthStage < this.plantData.stages - 1) return false;
            
            // For carrots and cabbages, require one day in final stage
            if (this.plantData.id === 'carrot' || this.plantData.id === 'cabbage') {
                const daysSincePlanting = this.getDaysSincePlanting(currentTime);
                const daysInFinalStage = daysSincePlanting - (this.plantData.stages - 1) * this.plantData.daysPerStage;
                return daysInFinalStage >= 1;
            }
            
            // For multi-harvest plants
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
            // Calculate total days since planting
            const days = (currentTime.year - this.plantYear) * 28 * 4 +  // Years
                        (currentTime.season - this.plantSeason) * 28 +  // Seasons
                        (currentTime.day - this.plantDay);              // Days

            logger.log('INFO', `Days since planting calculation for ${this.plantData.name} (Event ${this.eventId}): ` + JSON.stringify({
                currentTime,
                plantTime: {
                    day: this.plantDay,
                    season: this.plantSeason,
                    year: this.plantYear
                },
                calculatedDays: days,
                components: {
                    years: (currentTime.year - this.plantYear) * 28 * 4,
                    seasons: (currentTime.season - this.plantSeason) * 28,
                    days: currentTime.day - this.plantDay
                }
            }));

            return days;
        }

        onGrowthStageChange() {
            console.log(`Plant ${this.plantData.name} (Event ${this.eventId}) grew to stage ${this.growthStage}`);
            
            // Log all events on the map
            const allEvents = $gameMap.events();
            console.log('All events on map:', {
                mapId: $gameMap.mapId(),
                eventCount: allEvents.length,
                events: allEvents.map(e => ({
                    id: e.eventId(),
                    name: e.event().name,
                    x: e.x,
                    y: e.y,
                    isSpawned: e._spawned,
                    spawnData: e._spawnData
                }))
            });
            
            // Use the stored map ID to find the event
            const event = $gameMap.event(this.eventId);
            
            // Add detailed logging about event finding
            console.log(`Attempting to find event ${this.eventId} for growth stage update:`, {
                mapId: this.mapId,
                currentMapId: $gameMap.mapId(),
                eventExists: !!event,
                event: event ? {
                    id: event.eventId(),
                    name: event.event().name,
                    page: event.page(),
                    isSpawned: event._spawned,
                    spawnData: event._spawnData
                } : null,
                allEvents: allEvents.map(e => ({
                    id: e.eventId(),
                    name: e.event().name,
                    x: e.x,
                    y: e.y,
                    isSpawned: e._spawned,
                    spawnData: e._spawnData
                }))
            });

            if (event) {
                event.requestAnimation([1]);
                // Update self variable 52 for growth stage using Yanfly's plugin format
                const key = [this.mapId, this.eventId, 'SELF VARIABLE 52'];
                console.log(`Attempting to update growth stage self variable:`, {
                    key,
                    currentValue: $gameSelfSwitches.value(key),
                    newValue: this.growthStage,
                    event: {
                        id: this.eventId,
                        name: event.event().name,
                        mapId: this.mapId
                    }
                });
                
                $gameSelfSwitches.setValue(key, this.growthStage);
                
                // Verify the update
                const updatedValue = $gameSelfSwitches.value(key);
                console.log(`Growth stage self variable update result:`, {
                    key,
                    expectedValue: this.growthStage,
                    actualValue: updatedValue,
                    success: updatedValue === this.growthStage
                });
            } else {
                console.warn(`Could not find event ${this.eventId} for growth stage update on map ${this.mapId}`);
            }
        }

        updateHarvestStatus() {
            const currentTime = $gameHDB.time.getCurrentTime();
            const isFullyGrown = this.growthStage === this.plantData.stages - 1;
            const isReadyToHarvest = this.isReadyToHarvest(currentTime);
            
            logger.log('INFO', `Plant ${this.plantData.name} (Event ${this.eventId}) harvest status update: ` + JSON.stringify({
                isFullyGrown,
                isReadyToHarvest,
                growthStage: this.growthStage,
                maxStage: this.plantData.stages - 1,
                daysSincePlanting: this.getDaysSincePlanting(currentTime),
                daysPerStage: this.plantData.daysPerStage,
                multiHarvest: this.plantData.multiHarvest,
                lastHarvestDay: this.lastHarvestDay,
                harvestInterval: this.plantData.harvestInterval
            }));
            
            // Update self switch for harvest ready status using Yanfly's plugin
            const event = $gameMap.event(this.eventId);
            if (event) {
                const key = [this.mapId, this.eventId, 'SELF SWITCH 22'];
                $gameSelfSwitches.setValue(key, isReadyToHarvest);
                
                // Log the self switch update
                logger.log('INFO', `Updated harvest ready self switch: ` + JSON.stringify({
                    key,
                    value: isReadyToHarvest,
                    event: {
                        id: this.eventId,
                        name: event.event().name,
                        mapId: this.mapId
                    }
                }));
            }
        }

        water() {
            if (!this.wateredToday) {
                this.waterLevel = Math.min(100, this.waterLevel + 30);
                this.wateredToday = true;
                this.quality = Math.min(3, this.quality + 0.5);
                logger.log('INFO', `Watered plant ${this.plantData.name} (Event ${this.eventId})`);
                return true;
            }
            return false;
        }

        fertilize() {
            if (!this.fertilized) {
                this.fertilized = true;
                this.quality = Math.min(3, this.quality + 0.5);
                this.yield = this.calculateYield();
                logger.log('INFO', `Fertilized plant ${this.plantData.name} (Event ${this.eventId})`);
                return true;
            }
            return false;
        }

        harvest() {
            const currentTime = $gameHDB.time.getCurrentTime();
            if (!this.isReadyToHarvest(currentTime)) {
                logger.log('WARN', `Plant ${this.plantData.name} (Event ${this.eventId}) not ready to harvest: ` + JSON.stringify({
                    growthStage: this.growthStage,
                    maxStage: this.plantData.stages - 1,
                    daysSincePlanting: this.getDaysSincePlanting(currentTime),
                    daysPerStage: this.plantData.daysPerStage,
                    multiHarvest: this.plantData.multiHarvest,
                    lastHarvestDay: this.lastHarvestDay,
                    harvestInterval: this.plantData.harvestInterval
                }));
                return false;
            }
            
            const harvestData = {
                type: this.plantData.id,
                yield: this.yield,
                quality: this.quality,
                daysGrown: this.getDaysSincePlanting(currentTime)
            };

            this.lastHarvestDay = this.getDaysSincePlanting(currentTime);
            this.harvestCount++;
            
            // Reset for next harvest if multi-harvest
            if (this.plantData.multiHarvest) {
                this.readyToHarvest = false;
                this.fertilized = false;
            }

            logger.log('INFO', `Harvested plant ${this.plantData.name} (Event ${this.eventId}): ` + JSON.stringify(harvestData));
            return harvestData;
        }
    }

    // Gardening system class
    class GardeningSystem {
        constructor() {
            this.plants = new Map();
            this.plantTemplates = {};
            this.initializePlantTemplates();
            console.log('Time system is ready, gardening system initialized');
        }

        initializePlantTemplates() {
            this.plantTemplates = PLANT_TEMPLATES;
        }

        getPlantData(id) {
            return this.plantTemplates[id];
        }

        getPlant(eventId) {
            // First check if we already have this plant instance
            if (this.plants.has(eventId)) {
                const plantData = this.plants.get(eventId);
                logger.log('INFO', 'Retrieved plant from storage: ' + JSON.stringify({
                    eventId,
                    plant: {
                        id: plantData.plant.eventId,
                        name: plantData.plant.plantData.name,
                        plantDay: plantData.plant.plantDay,
                        plantSeason: plantData.plant.plantSeason,
                        plantYear: plantData.plant.plantYear
                    }
                }));
                return plantData.plant;
            }
            logger.log('WARN', 'No plant found for event ID: ' + JSON.stringify({ eventId }));
            return null;
        }

        updatePlantsForCurrentMap() {
            const currentMapId = $gameMap.mapId();
            logger.log('INFO', `Updating plants for map ${currentMapId}`);
            
            // Only process plants that are on the current map
            for (const [eventId, plantData] of this.plants) {
                if (plantData.mapId === currentMapId) {
                    logger.log('INFO', `Processing plant ${plantData.plant.plantData.name} (Event ${eventId}) on map ${currentMapId}`);
                    plantData.plant.update();
                }
            }
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
                availableEvents,
                timeSystem: {
                    exists: !!$gameHDB.time,
                    isReady: $gameHDB.time ? $gameHDB.time.isReady : false,
                    currentTime: $gameHDB.time ? $gameHDB.time.currentTime : null,
                    currentDay: $gameHDB.time ? $gameHDB.time.currentDay : null,
                    currentSeason: $gameHDB.time ? $gameHDB.time.currentSeason : null,
                    currentYear: $gameHDB.time ? $gameHDB.time.currentYear : null
                }
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

                // Create and store the plant instance
                const plant = new Plant(template, actualEventId);
                this.plants.set(actualEventId, {
                    plant,
                    mapId: $gameMap.mapId()
                });

                // Log the current state of all plants
                const plantLogs = Array.from(this.plants.entries()).map(([id, data]) => ({
                    id,
                    name: data.plant.plantData.name,
                    mapId: data.mapId,
                    growthStage: data.plant.growthStage
                }));

                console.log(`Successfully created plant for event ${actualEventId}`, {
                    eventId: actualEventId,
                    plantId: template.plantId,
                    plant: plant,
                    currentPlants: plantLogs
                });

                return actualEventId;
            } catch (error) {
                console.error(`Error spawning plant: ${error.message}`);
                return null;
            }
        }

        // Add save/load methods
        saveData() {
            if ($gameHDB && $gameHDB.save) {
                const plantsData = Array.from(this.plants.entries()).map(([eventId, plantData]) => ({
                    eventId,
                    plantData: plantData.plant.plantData,
                    plantDay: plantData.plant.plantDay,
                    plantSeason: plantData.plant.plantSeason,
                    plantYear: plantData.plant.plantYear,
                    growthStage: plantData.plant.growthStage,
                    waterLevel: plantData.plant.waterLevel,
                    quality: plantData.plant.quality,
                    yield: plantData.plant.yield,
                    wateredToday: plantData.plant.wateredToday,
                    fertilized: plantData.plant.fertilized,
                    pollinationStatus: plantData.plant.pollinationStatus,
                    lastHarvestDay: plantData.plant.lastHarvestDay,
                    harvestCount: plantData.plant.harvestCount
                }));
                
                $gameHDB.save.setPluginData('gardening', {
                    plants: plantsData
                });
                
                logger.log('INFO', 'Saved gardening data: ' + JSON.stringify({
                    plantsData,
                    plantCount: plantsData.length
                }));
            }
        }

        loadData() {
            if ($gameHDB && $gameHDB.save) {
                const savedData = $gameHDB.save.getPluginData('gardening');
                if (savedData && savedData.plants) {
                    this.plants.clear();
                    
                    // Store the raw plant data for later initialization
                    this._pendingPlants = savedData.plants;
                    
                    // Initialize plants if time system is ready
                    if ($gameHDB.time && $gameHDB.time.isReady) {
                        this._initializePendingPlants();
                    } else {
                        // Wait for time system to be ready
                        const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
                        Scene_Map.prototype.createDisplayObjects = function() {
                            _Scene_Map_createDisplayObjects.call(this);
                            if ($gameHDB.time && $gameHDB.time.isReady && $gameHDB.gardening._pendingPlants) {
                                $gameHDB.gardening._initializePendingPlants();
                            }
                        };
                    }
                }
            }
        }

        _initializePendingPlants() {
            if (!this._pendingPlants) return;
            
            this._pendingPlants.forEach(plantData => {
                if (!plantData || !plantData.plantData) {
                    logger.log('ERROR', 'Invalid plant data during restoration:', plantData);
                    return;
                }

                // Ensure plantData.plantData exists and has required properties
                const restoredPlantData = {
                    id: plantData.plantData.id || 'unknown',
                    name: plantData.plantData.name || 'Unknown Plant',
                    type: plantData.plantData.type || 'standard',
                    stages: plantData.plantData.stages || 3,
                    daysPerStage: plantData.plantData.daysPerStage || 1,
                    seasons: plantData.plantData.seasons || [0, 1, 2],
                    multiHarvest: plantData.plantData.multiHarvest || false,
                    harvestInterval: plantData.plantData.harvestInterval || 3
                };
                
                const plant = new Plant(restoredPlantData, plantData.eventId, true);
                // Restore all plant properties
                Object.assign(plant, {
                    plantDay: plantData.plantDay,
                    plantSeason: plantData.plantSeason,
                    plantYear: plantData.plantYear,
                    growthStage: plantData.growthStage,
                    waterLevel: plantData.waterLevel,
                    quality: plantData.quality,
                    yield: plantData.yield,
                    wateredToday: plantData.wateredToday,
                    fertilized: plantData.fertilized,
                    pollinationStatus: plantData.pollinationStatus,
                    lastHarvestDay: plantData.lastHarvestDay,
                    harvestCount: plantData.harvestCount
                });
                this.plants.set(plantData.eventId, {
                    plant,
                    mapId: $gameMap.mapId()
                });
            });
            
            logger.log('INFO', 'Loaded gardening data: ' + JSON.stringify({
                plantCount: this._pendingPlants.length,
                plants: Array.from(this.plants.entries()).map(([id, plant]) => ({
                    id,
                    name: plant.plantData.name,
                    stage: plant.growthStage
                }))
            }));
            
            // Clear pending plants
            this._pendingPlants = null;
        }

        setupMap() {
            console.log(`Setting up map ${$gameMap.mapId()}:`, {
                events: $gameMap.events().map(e => ({
                    id: e.eventId(),
                    name: e.event().name
                }))
            });
            this.updatePlantsForCurrentMap();
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
        _Scene_Map_update.call(this);
        
        // Update time system if it exists and is ready
        if ($gameHDB.time && $gameHDB.time.isReady) {
            $gameHDB.time.update();
            
            // Update plants after time system update
            if ($gameHDB.gardening) {
                $gameHDB.gardening.updatePlantsForCurrentMap();
            }
        }
    };

    // Map setup
    const _Scene_Map_setup = Scene_Map.prototype.setup;
    Scene_Map.prototype.setup = function() {
        _Scene_Map_setup.call(this);
        if ($gameHDB.gardening) {
            console.log(`Setting up map ${$gameMap.mapId()}:`, {
                events: $gameMap.events().map(e => ({
                    id: e.eventId(),
                    name: e.event().name
                }))
            });
            $gameHDB.gardening.setupMap();
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
                plantTemplates: $gameHDB.gardening ? $gameHDB.gardening.plantTemplates : null,
                currentPlants: $gameHDB.gardening ? Array.from($gameHDB.gardening.plants.entries()).map(([id, data]) => ({
                    id,
                    name: data && data.plant && data.plant.plantData ? data.plant.plantData.name : 'Unknown',
                    mapId: data ? data.mapId : 'Unknown',
                    growthStage: data && data.plant ? data.plant.growthStage : 0
                })) : null
            });
            
            // Ensure time system is ready
            if (!$gameHDB || !$gameHDB.time || !$gameHDB.time.isReady) {
                console.error('Time system not ready for plant command');
                logger.log('ERROR', 'Time system not ready for plant command');
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
                    waterLevel: plant.waterLevel,
                    plantDay: plant.plantDay,
                    plantSeason: plant.plantSeason,
                    plantYear: plant.plantYear,
                    quality: plant.quality,
                    yield: plant.yield,
                    wateredToday: plant.wateredToday,
                    fertilized: plant.fertilized,
                    harvestCount: plant.harvestCount,
                    daysSincePlanting: plant.getDaysSincePlanting($gameHDB.time.getCurrentTime())
                } : null
            });
            
            switch (args[0]) {
                case 'STATUS':
                    // Get the event ID from the variable if it's a spawned plant
                    const statusEventId = this.eventId();
                    logger.log('INFO', 'Checking plant status', {
                        statusEventId,
                        event: $gameMap.event(statusEventId),
                        plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, data]) => ({
                            id,
                            name: data && data.plant && data.plant.plantData ? data.plant.plantData.name : 'Unknown',
                            plantDay: data && data.plant ? data.plant.plantDay : 0,
                            plantSeason: data && data.plant ? data.plant.plantSeason : 0,
                            plantYear: data && data.plant ? data.plant.plantYear : 0,
                            mapId: data ? data.mapId : 'Unknown'
                        }))
                    });
                    
                    // Get the plant instance
                    const statusPlant = $gameHDB.gardening.getPlant(statusEventId);
                    
                    if (statusPlant) {
                        // Log the exact plant data we're using
                        logger.log('INFO', 'Plant data for status display', {
                            eventId: statusEventId,
                            plant: {
                                id: statusPlant.eventId,
                                name: statusPlant.plantData.name,
                                plantDay: statusPlant.plantDay,
                                plantSeason: statusPlant.plantSeason,
                                plantYear: statusPlant.plantYear,
                                currentTime: $gameHDB.time.getCurrentTime()
                            }
                        });
                        
                        // Calculate age in days
                        const currentTime = $gameHDB.time.getCurrentTime();
                        const ageInDays = statusPlant.getDaysSincePlanting(currentTime);
                        
                        // Get the growth stage self variable value
                        const growthStageSelfValue = $gameSelfSwitches.value([$gameMap.mapId(), statusEventId, 'SELF VARIABLE 52']);
                        const gardenTestSelfValue = $gameSelfSwitches.value([$gameMap.mapId(), statusEventId, 'SELF VARIABLE 57']);
                        const harvestReadyValue = $gameSelfSwitches.value([$gameMap.mapId(), statusEventId, 'Self Switch harvestReady']);
                        
                        const status = `Plant: ${statusPlant.plantData.name}
Planted: ${['Spring', 'Summer', 'Fall', 'Winter'][statusPlant.plantSeason]} ${statusPlant.plantDay}
Age: ${ageInDays} days
Stage: ${statusPlant.growthStage + 1}/${statusPlant.plantData.stages}
Growth Stage (Self): ${growthStageSelfValue}
Garden Test (Self): ${gardenTestSelfValue}
Harvest Ready (Self): ${harvestReadyValue}
Water: ${statusPlant.waterLevel}%
Quality: ${statusPlant.quality}
Yield: ${statusPlant.yield}
Harvests: ${statusPlant.harvestCount}`;
                        
                        // Log the final status message
                        logger.log('INFO', 'Final status message', {
                            eventId: statusEventId,
                            plantingDate: `Year ${statusPlant.plantYear}, ${['Spring', 'Summer', 'Fall', 'Winter'][statusPlant.plantSeason]} ${statusPlant.plantDay}`,
                            ageInDays,
                            status
                        });
                        
                        $gameMessage.add(status);
                    } else {
                        logger.log('WARN', 'No plant found for status display', {
                            statusEventId,
                            event: $gameMap.event(statusEventId),
                            plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, data]) => ({
                                id,
                                name: data && data.plant && data.plant.plantData ? data.plant.plantData.name : 'Unknown',
                                plantDay: data && data.plant ? data.plant.plantDay : 0,
                                plantSeason: data && data.plant ? data.plant.plantSeason : 0,
                                plantYear: data && data.plant ? data.plant.plantYear : 0,
                                mapId: data ? data.mapId : 'Unknown'
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
                        const currentTime = $gameHDB.time.getCurrentTime();
                        logger.log('INFO', `Attempting to harvest plant ${plant.plantData.name} (Event ${eventId}):`, {
                            growthStage: plant.growthStage,
                            maxStage: plant.plantData.stages - 1,
                            daysSincePlanting: plant.getDaysSincePlanting(currentTime),
                            daysPerStage: plant.plantData.daysPerStage,
                            multiHarvest: plant.plantData.multiHarvest,
                            lastHarvestDay: plant.lastHarvestDay,
                            harvestInterval: plant.plantData.harvestInterval
                        });

                        if (plant.isReadyToHarvest(currentTime)) {
                            const harvestData = plant.harvest();
                            $gameMap.event(eventId).requestAnimation([4]);
                            
                            // Give harvest items based on plant type
                            let itemId;
                            switch (plant.plantData.id) {
                                case 'carrot':
                                    itemId = 102; // Carrot item
                                    break;
                                case 'cabbage':
                                    itemId = 104; // Cabbage item
                                    break;
                                default:
                                    itemId = 102; // Default to carrot if unknown
                            }
                            
                            $gameParty.gainItem($dataItems[itemId], harvestData.yield);
                            
                            logger.log('INFO', `Successfully harvested plant:`, {
                                eventId,
                                itemId,
                                yield: harvestData.yield,
                                harvestData,
                                plantType: plant.plantData.id
                            });
                            
                            $gameMessage.add(`Harvested ${harvestData.yield} ${plant.plantData.name}(s)!`);
                            
                            if (!plant.plantData.multiHarvest) {
                                $gameMap.event(eventId).erase();
                            }
                        } else {
                            logger.log('WARN', `Plant not ready to harvest:`, {
                                eventId,
                                growthStage: plant.growthStage,
                                maxStage: plant.plantData.stages - 1,
                                daysSincePlanting: plant.getDaysSincePlanting(currentTime),
                                daysPerStage: plant.plantData.daysPerStage
                            });
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
                                plants: Array.from($gameHDB.gardening.plants.entries()).map(([id, data]) => {
                                    // Safe access to plant data with fallbacks
                                    return {
                                        id,
                                        name: data && data.plant && data.plant.plantData ? data.plant.plantData.name : 'Unknown',
                                        mapId: data ? data.mapId : 'Unknown'
                                    };
                                })
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

    // Add save/load hooks to DataManager
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

    // Check for Yanfly's EventSpawner plugin after all plugins are loaded
    if (typeof Yanfly === 'undefined' || typeof Yanfly.SpawnEventTemplateAt !== 'function') {
        console.error('Yanfly EventSpawner plugin not found. Please ensure it is loaded before the gardening plugin.');
    }
})(); 