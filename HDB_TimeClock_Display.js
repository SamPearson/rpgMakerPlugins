/*:
 * @plugindesc v1.0.0_beta Display extension for the Time Clock Core plugin
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @param Display Settings
 * @text ----- Display Settings -----
 * 
 * @param Window Position
 * @parent Display Settings
 * @text Window Position
 * @type struct<WindowPosition>
 * @default {"x":"right","y":"top","padding":"10"}
 * 
 * @param Window Size
 * @parent Display Settings
 * @text Window Size
 * @type struct<WindowSize>
 * @default {"width":"350","height":"auto"}
 * 
 * @param Display Format
 * @parent Display Settings
 * @text Display Format
 * @type string
 * @desc Format string for time display. Use {year}, {month}, {day}, {hour}, {minute} as placeholders
 * @default Year {year} - {month}/{day} {hour}:{minute}
 * 
 * @param Lighting Settings
 * @text ----- Lighting Settings -----
 * 
 * @param useLighting
 * @parent Lighting Settings
 * @type boolean
 * @desc Enable day/night lighting effects
 * @default true
 * 
 * @param outsideSwitch
 * @parent Lighting Settings
 * @type switch
 * @desc Switch ID for tracking if player is outside
 * @default 1
 * 
 * @param lightsSwitch
 * @parent Lighting Settings
 * @type switch
 * @desc Switch ID for indoor lights
 * @default 2
 * 
 * @param manualLightingSwitch
 * @parent Lighting Settings
 * @type switch
 * @desc Switch ID for manual lighting control
 * @default 3
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
 * @default ERROR
 * 
 * @help This plugin extends the Time Clock Core plugin to display the current time
 * in a window on the game screen and handle day/night lighting effects.
 * 
 * =============================================================================
 * Plugin Dependencies
 * =============================================================================
 * 
 * This plugin requires HDB_Core_TimeClock.js to be loaded first.
 * 
 * =============================================================================
 * Window Position
 * =============================================================================
 * 
 * The window position can be set to:
 * - x: left, center, right, or a specific number
 * - y: top, center, bottom, or a specific number
 * - padding: distance from the edge in pixels
 * 
 * =============================================================================
 * Window Size
 * =============================================================================
 * 
 * The window size can be set to:
 * - width: specific number in pixels
 * - height: auto (based on content) or specific number
 * 
 * =============================================================================
 * Display Format
 * =============================================================================
 * 
 * The display format can be customized using the following placeholders:
 * {year} - Current year
 * {month} - Current month
 * {day} - Current day
 * {hour} - Current hour
 * {minute} - Current minute (padded with leading zero)
 * 
 * Example formats:
 * "Year {year} - {month}/{day} {hour}:{minute}"
 * "{hour}:{minute}"
 * "Day {day} of {month}"
 */

/*~struct~WindowPosition:
 * @param x
 * @text X Position
 * @type string
 * @desc left, center, right, or a specific number
 * @default right
 * 
 * @param y
 * @text Y Position
 * @type string
 * @desc top, center, bottom, or a specific number
 * @default top
 * 
 * @param padding
 * @text Padding
 * @type number
 * @desc Distance from the edge in pixels
 * @default 10
 */

/*~struct~WindowSize:
 * @param width
 * @text Width
 * @type number
 * @desc Window width in pixels
 * @default 350
 * 
 * @param height
 * @text Height
 * @type string
 * @desc auto or specific number
 * @default auto
 */

(function() {
    // Constants for lighting values
    const LIGHTING_LEVELS = {
        DARK: [-102, -102, -102, 102],
        DUSK_DAWN: [-34, -34, -34, 34],
        NORMAL: [0, 0, 0, 0],
        INDOOR_DARK: [-51, -51, -51, 51]
    };

    // Create a single logger instance
    let timeDisplayLogger = null;

    // Time Display Window Class
    class Window_TimeDisplay extends Window_Base {
        constructor() {
            // Initialize logger if not already done
            if (!timeDisplayLogger) {
                timeDisplayLogger = window.HDB_Logger ? window.HDB_Logger.createLogger('HDB_TimeClock_Display') : { log: () => {} };
            }

            // Define window dimensions and position
            const width = 250;  // Fixed width large enough for most date formats
            const height = 72;  // Fixed height with room for text
            const padding = 10;
            const x = Graphics.width - width - padding;
            const y = padding;
            
            // Call super constructor with fixed values
            super(x, y, width, height);
            
            // Set window properties
            this.opacity = 200;         // Semi-transparent background
            this.backOpacity = 200;     // Semi-transparent back
            this.contentsOpacity = 255; // Fully opaque contents
            
            // Make window visible
            this.visible = true;
            this.active = true;
            
            // Initialize update tracking
            this.lastUpdateTime = 0;
            this._updateInterval = 1000; // Update once per second
            
            // Initial update
            this.refresh();
            
            // Log window creation
            timeDisplayLogger.log('INFO', 'Time display window created: ' + JSON.stringify({
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
            }));
        }
        
        update() {
            // Only update on an interval
            const now = Date.now();
            if (now - this.lastUpdateTime >= this._updateInterval) {
                this.lastUpdateTime = now;
                this.refresh();
            }
        }
        
        refresh() {
            // Get current time string
            const timeString = this.getFormattedTimeString();
            timeDisplayLogger.log('DEBUG', 'Refreshing with formatted time: ' + timeString);
            
            // Clear the window
            this.contents.clear();
            
            // Set text properties
            this.resetFontSettings();
            this.contents.fontSize = 22;
            this.changeTextColor(this.textColor(0)); // Default white color
            
            // Draw the time string centered in the window
            this.drawText(timeString, 0, 10, this.width - 32, 'center');
            
            timeDisplayLogger.log('DEBUG', 'Window refreshed with dimensions: ' + 
                JSON.stringify({width: this.width, height: this.height}));
        }
        
        getFormattedTimeString() {
            // Check if time system is available and ready
            if (!$gameHDB || !$gameHDB.time || !$gameHDB.time.isReady) {
                timeDisplayLogger.log('WARN', 'Time system not available or not ready');
                return 'Time System Not Ready';
            }

            // Get current time data
            const timeData = $gameHDB.time.getCurrentTime();
            if (!timeData) {
                timeDisplayLogger.log('WARN', 'Time data not available');
                return 'Time Data Not Available';
            }

            // Get display format from parameters
            const params = PluginManager.parameters('HDB_TimeClock_Display');
            let format = params['Display Format'] || 'Year {year} - {month}/{day} {hour}:{minute}';

            // Replace placeholders with actual values
            format = format.replace(/{year}/g, timeData.year);
            format = format.replace(/{month}/g, timeData.month.toString().padStart(2, '0'));
            format = format.replace(/{day}/g, timeData.day.toString().padStart(2, '0'));
            format = format.replace(/{hour}/g, timeData.hour.toString().padStart(2, '0'));
            format = format.replace(/{minute}/g, timeData.minute.toString().padStart(2, '0'));

            return format;
        }
    }

    // Scene_Map extension
    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        
        // Create time display window
        this._timeWindow = new Window_TimeDisplay();
        this.addWindow(this._timeWindow);
    };

    // Initialize lighting system if needed
    if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
        const lightingSystem = new LightingSystem();
    }

    // Lighting System Class
    class LightingSystem {
        constructor() {
            this.initialize();
        }

        initialize() {
            const params = PluginManager.parameters('HDB_TimeClock_Display');
            this.useLighting = JSON.parse(params.useLighting);
            this.outsideSwitch = Number(params.outsideSwitch);
            this.lightsSwitch = Number(params.lightsSwitch);
            this.manualLightingSwitch = Number(params.manualLightingSwitch);

            // Subscribe to time updates
            if ($gameHDB && $gameHDB.time) {
                $gameHDB.time.addTimeUpdateListener(this.updateLighting.bind(this));
            }
        }

        updateLighting(timeData) {
            if (!$gameParty.inBattle() && !$gameSwitches.value(this.manualLightingSwitch)) {
                if (this.useLighting) {
                    this.updateScreenLighting(timeData.hour);
                }
            } else {
                $gameScreen.startTint(LIGHTING_LEVELS.NORMAL, 1);
            }
        }

        updateScreenLighting(hour) {
            const isOutside = $gameSwitches.value(this.outsideSwitch);
            const lightsOn = $gameSwitches.value(this.lightsSwitch);

            if (isOutside) {
                this.updateOutdoorLighting(hour);
            } else {
                this.updateIndoorLighting(hour, lightsOn);
            }
        }

        updateOutdoorLighting(hour) {
            if (hour < 5) {
                $gameScreen.startTint(LIGHTING_LEVELS.DARK, 5);
            } else if (hour < 6) {
                $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
            } else if (hour < 7) {
                $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
            } else if (hour < 17) {
                $gameScreen.startTint(LIGHTING_LEVELS.NORMAL, 5);
            } else if (hour < 18) {
                $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
            } else if (hour < 19) {
                $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
            } else {
                $gameScreen.startTint(LIGHTING_LEVELS.DARK, 5);
            }
        }

        updateIndoorLighting(hour, lightsOn) {
            if (lightsOn) {
                $gameScreen.startTint(LIGHTING_LEVELS.NORMAL, 1);
            } else {
                if (hour < 5) {
                    $gameScreen.startTint(LIGHTING_LEVELS.DARK, 5);
                } else if (hour < 6) {
                    $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
                } else if (hour < 7) {
                    $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
                } else if (hour < 17) {
                    $gameScreen.startTint(LIGHTING_LEVELS.INDOOR_DARK, 5);
                } else if (hour < 18) {
                    $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
                } else if (hour < 19) {
                    $gameScreen.startTint(LIGHTING_LEVELS.DUSK_DAWN, 5);
                } else {
                    $gameScreen.startTint(LIGHTING_LEVELS.DARK, 5);
                }
            }
        }
    }
})(); 