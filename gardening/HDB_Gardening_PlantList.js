/*:
 * @plugindesc v1.0.0 Plant Registry for HDB Gardening System
 * @author HDB & Associates
 *
 * @target MV
 *
 * @param Item IDs
 * @text Item Database IDs
 *
 * @param Carrot Item ID
 * @parent Item IDs
 * @type number
 * @min 1
 * @desc Database ID of the carrot item
 * @default 1
 *
 * @param Cabbage Item ID
 * @parent Item IDs
 * @type number
 * @min 1
 * @desc Database ID of the cabbage item
 * @default 2
 *
 * @param Green Bean Item ID
 * @parent Item IDs
 * @type number
 * @min 1
 * @desc Database ID of the green bean item
 * @default 3
 *
 * @param Gladiolus Item ID
 * @parent Item IDs
 * @type number
 * @min 1
 * @desc Database ID of the gladiolus flower item
 * @default 4
 *
 * @param Radish Item ID
 * @parent Item IDs
 * @type number
 * @min 1
 * @desc Database ID of the radish item
 * @default 5
 *
 * @help
 * =============================================================================
 * HDB Plant Registry
 * =============================================================================
 *
 * This plugin registers all available plant types for the gardening system.
 *
 * Plugin Dependencies:
 * - HDB_Gardening_Core.js
 * - HDB_Gardening_GrowthTypes.js
 *
 * Load Order:
 * 1. HDB_Gardening_Core.js
 * 2. HDB_Gardening_GrowthTypes.js
 * 3. HDB_Gardening_PlantList.js
 *
 * Plant Types:
 *
 * Standard Plants:
 * - Carrot: Basic root vegetable, single harvest
 * - Cabbage: Leafy vegetable, single harvest
 *
 * Vine Plants:
 * - Green Bean: Produces multiple harvests, dies after 56 days
 *
 * Bulb Plants:
 * - Gladiolus: Summer-blooming flower, returns yearly
 */

(function() {
    'use strict';

    // Initialize logger
    const logger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_Gardening_PlantList') : { log: () => {} };

    // Get plugin parameters
    const params = PluginManager.parameters('HDB_Gardening_PlantList');
    const CARROT_ITEM_ID = Number(params['Carrot Item ID']) || 1;
    const CABBAGE_ITEM_ID = Number(params['Cabbage Item ID']) || 2;
    const GREEN_BEAN_ITEM_ID = Number(params['Green Bean Item ID']) || 3;
    const GLADIOLUS_ITEM_ID = Number(params['Gladiolus Item ID']) || 4;
    const RADISH_ITEM_ID = Number(params['Radish Item ID']) || 5;

    // Wait for gardening system to be ready
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        if ($gameHDB && $gameHDB.gardening) {
            registerPlants();
        }
    };

    function registerPlants() {
        const gardening = window.HDB_GardeningSystem.getInstance();
        if (!gardening) {
            logger.log('ERROR', 'Gardening system not found');
            return;
        }


        // Register carrot (standard growth)
        gardening.registerPlantType({
            id: 'carrot',
            name: 'Carrot',
            templateName: 'CarrotPlant',
            growthType: 'standard',
            growthStages: 4,
            daysPerStage: 1,
            baseYield: 2,
            harvestItemId: CARROT_ITEM_ID,
            validSeasons: [0, 1, 2]  // Spring, Summer, Fall
        });

        // Register cabbage (standard growth)
        gardening.registerPlantType({
            id: 'cabbage',
            name: 'Cabbage',
            templateName: 'CabbagePlant',
            growthType: 'standard',
            growthStages: 4,
            daysPerStage: 2,
            baseYield: 1,
            harvestItemId: CABBAGE_ITEM_ID,
            validSeasons: [0, 1]  // Spring and Summer only
        });

        // Register green bean (vine growth)
        gardening.registerPlantType({
            id: 'green_bean',
            name: 'Green_Bean',
            templateName: 'GreenBeanPlant',
            growthType: 'vine',
            growthStages: 4,
            daysPerStage: 2,
            regrowthStage: 2,  // Return to stage 2 after harvest
            maxAge: 56,        // Dies after 56 days
            baseYield: 3,
            harvestItemId: GREEN_BEAN_ITEM_ID,
            validSeasons: [0, 1]  // Spring and Summer only
        });

        // Register gladiolus (bulb growth)
        gardening.registerPlantType({
            id: 'gladiolus',
            name: 'Gladiolus',
            templateName: 'GladiolusPlant',
            growthType: 'bulb',
            growthStages: 4,
            daysPerStage: 2,              // Takes 14 days total to flower
            baseYield: 1		,
            harvestItemId: GLADIOLUS_ITEM_ID,
            activeSeasons: [1],             // Only grows in Summer (season index 1)
            qualityYieldMultiplier: true    // Quality affects stem count
        });

        // Register radish (standard growth)
        gardening.registerPlantType({
            id: 'radish',
            name: 'Radish',
            templateName: 'RadishPlant',
            growthType: 'standard',
            growthStages: 2,
            daysPerStage: 1,
            baseYield: 1,
            harvestItemId: RADISH_ITEM_ID,
            validSeasons: [0, 1, 2]  // Spring, Summer, Fall
        });

        logger.log('INFO', 'Registered all plants');
    }
})(); 