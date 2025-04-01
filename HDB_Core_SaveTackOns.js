/*:
 * @plugindesc v1.0.0_beta Save System Core for HDB plugins
 * @author HDB & Associates
 * 
 * @target MV
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
 * @help This plugin provides a centralized save system for all HDB plugins.
 * It handles data persistence, versioning, and migration.
 * 
 * =============================================================================
 * Plugin Dependencies
 * =============================================================================
 * 
 * This is a core plugin that other HDB plugins will depend on.
 * It should be loaded before any other HDB plugins.
 * 
 * =============================================================================
 * Save Data Structure
 * =============================================================================
 * 
 * The save system uses the following structure:
 * 
 * $gameHDB = {
 *   version: "1.0.0",
 *   plugins: {
 *     pluginName: {
 *       version: "1.0.0",
 *       data: { ... }
 *     }
 *   }
 * }
 * 
 * =============================================================================
 * Usage
 * =============================================================================
 * 
 * In other plugins, use the following methods:
 * 
 * // Initialize plugin data
 * $gameHDB.save.initializePlugin('pluginName', defaultData);
 * 
 * // Get plugin data
 * const data = $gameHDB.save.getPluginData('pluginName');
 * 
 * // Update plugin data
 * $gameHDB.save.setPluginData('pluginName', newData);
 * 
 * // Subscribe to save/load events
 * $gameHDB.save.onSave = function() { ... };
 * $gameHDB.save.onLoad = function() { ... };
 */

let logger = null;

(function() {
    // Initialize logger near the start of your IIFE
    logger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_Core_SaveTackOns') : { log: () => {} };

    // Create save system object with all methods
    const createSaveSystem = () => ({
        version: "1.0.0",
        plugins: {},
        onSave: null,
        onLoad: null,
        
        // Initialize plugin data
        initializePlugin(pluginName, defaultData) {
            if (!this.plugins[pluginName]) {
                this.plugins[pluginName] = defaultData;
            }
        },

        // Get plugin data
        getPluginData(pluginName) {
            return this.plugins[pluginName];
        },

        // Set plugin data
        setPluginData(pluginName, data) {
            this.plugins[pluginName] = data;
        },

        // Save all plugin data
        savePluginData() {
            $gameSystem.saveData = this.plugins;
        },

        // Load all plugin data
        loadPluginData() {
            if ($gameSystem.saveData) {
                this.plugins = $gameSystem.saveData;
            }
        }
    });

    // Create global namespace
    $gameHDB = {
        version: "1.0.0",
        save: createSaveSystem()
    };

    // Save data
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        contents.hdb = $gameHDB.save;
        return contents;
    };

    // Load data
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if (contents.hdb) {
            // Preserve the save system methods
            const currentSave = $gameHDB.save;
            $gameHDB.save = createSaveSystem();
            
            // Restore the saved data
            $gameHDB.save.plugins = contents.hdb.plugins || {};
            $gameHDB.save.version = contents.hdb.version || "1.0.0";
            
            // Call onLoad if it exists
            if ($gameHDB.save.onLoad) {
                $gameHDB.save.onLoad();
            }
        }
    };

    // New game initialization
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        $gameHDB = {
            version: "1.0.0",
            save: createSaveSystem()
        };
    };

    // Save game
    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function(savefileId) {
        if ($gameHDB.save.onSave) {
            $gameHDB.save.onSave();
        }
        return _DataManager_saveGame.call(this, savefileId);
    };
})(); 