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

    // Version management
    const Version = {
        current: "1.0.0",
        compare(v1, v2) {
            const v1Parts = v1.split('.').map(Number);
            const v2Parts = v2.split('.').map(Number);
            
            for (let i = 0; i < 3; i++) {
                if (v1Parts[i] > v2Parts[i]) return 1;
                if (v1Parts[i] < v2Parts[i]) return -1;
            }
            return 0;
        }
    };

    // Create save system object with all methods
    const createSaveSystem = () => ({
        version: Version.current,
        plugins: {},
        onSave: null,
        onLoad: null,
        
        // Initialize plugin data with validation
        initializePlugin(pluginName, defaultData) {
            logger.log('DEBUG', `Initializing plugin data for ${pluginName}`);
            
            if (!pluginName) {
                logger.log('ERROR', 'Plugin name is required for initialization');
                return false;
            }

            if (!this.plugins[pluginName]) {
                this.plugins[pluginName] = {
                    version: Version.current,
                    data: defaultData
                };
                logger.log('INFO', `Initialized plugin data for ${pluginName}`);
                return true;
            }
            
            logger.log('WARN', `Plugin ${pluginName} already initialized`);
            return false;
        },

        // Get plugin data with validation
        getPluginData(pluginName) {
            logger.log('DEBUG', `Getting plugin data for ${pluginName}`);
            
            if (!pluginName) {
                logger.log('ERROR', 'Plugin name is required to get data');
                return null;
            }

            const plugin = this.plugins[pluginName];
            if (!plugin) {
                logger.log('WARN', `No data found for plugin ${pluginName}`);
                return null;
            }

            return plugin.data;
        },

        // Set plugin data with validation
        setPluginData(pluginName, data) {
            logger.log('DEBUG', `Setting plugin data for ${pluginName}`);
            
            if (!pluginName) {
                logger.log('ERROR', 'Plugin name is required to set data');
                return false;
            }

            if (!this.plugins[pluginName]) {
                logger.log('WARN', `Plugin ${pluginName} not initialized, initializing now`);
                this.initializePlugin(pluginName, data);
                return true;
            }

            this.plugins[pluginName].data = data;
            this.plugins[pluginName].version = Version.current;
            logger.log('INFO', `Updated plugin data for ${pluginName}`);
            return true;
        },

        // Save all plugin data
        savePluginData() {
            logger.log('DEBUG', 'Saving all plugin data');
            try {
                $gameSystem.saveData = this.plugins;
                logger.log('INFO', 'Successfully saved plugin data');
                return true;
            } catch (e) {
                logger.log('ERROR', `Failed to save plugin data: ${e.message}`);
                return false;
            }
        },

        // Load all plugin data with version checking
        loadPluginData() {
            logger.log('DEBUG', 'Loading all plugin data');
            
            if (!$gameSystem.saveData) {
                logger.log('WARN', 'No save data found in game system');
                return false;
            }

            try {
                this.plugins = $gameSystem.saveData;
                
                // Check versions and log any mismatches
                Object.entries(this.plugins).forEach(([pluginName, plugin]) => {
                    if (Version.compare(plugin.version, Version.current) !== 0) {
                        logger.log('WARN', `Version mismatch for ${pluginName}: ${plugin.version} vs ${Version.current}`);
                    }
                });
                
                logger.log('INFO', 'Successfully loaded plugin data');
                return true;
            } catch (e) {
                logger.log('ERROR', `Failed to load plugin data: ${e.message}`);
                return false;
            }
        }
    });

    // Create global namespace
    $gameHDB = {
        version: Version.current,
        save: createSaveSystem()
    };

    // Save data
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        logger.log('DEBUG', 'Making save contents');
        const contents = _DataManager_makeSaveContents.call(this);
        contents.hdb = $gameHDB.save;
        return contents;
    };

    // Load data
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        logger.log('DEBUG', 'Extracting save contents');
        _DataManager_extractSaveContents.call(this, contents);
        
        if (contents.hdb) {
            try {
                // Preserve the save system methods
                const currentSave = $gameHDB.save;
                $gameHDB.save = createSaveSystem();
                
                // Restore the saved data
                $gameHDB.save.plugins = contents.hdb.plugins || {};
                $gameHDB.save.version = contents.hdb.version || Version.current;
                
                // Call onLoad if it exists
                if ($gameHDB.save.onLoad) {
                    logger.log('DEBUG', 'Executing onLoad callback');
                    $gameHDB.save.onLoad();
                }
                
                logger.log('INFO', 'Successfully restored save data');
            } catch (e) {
                logger.log('ERROR', `Failed to restore save data: ${e.message}`);
            }
        }
    };

    // New game initialization
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        logger.log('DEBUG', 'Creating new game objects');
        _DataManager_createGameObjects.call(this);
        $gameHDB = {
            version: Version.current,
            save: createSaveSystem()
        };
    };

    // Save game
    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function(savefileId) {
        logger.log('DEBUG', `Saving game to file ${savefileId}`);
        if ($gameHDB.save.onSave) {
            logger.log('DEBUG', 'Executing onSave callback');
            $gameHDB.save.onSave();
        }
        return _DataManager_saveGame.call(this, savefileId);
    };
})(); 