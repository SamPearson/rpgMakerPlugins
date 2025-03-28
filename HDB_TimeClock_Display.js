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

    // Create a single logger instance for the time display
    let timeDisplayLogger = null;

    // Time Display Window Class
    class Window_TimeDisplay extends Window_Base {
        constructor() {
            // Prevent multiple instances
            if (Window_TimeDisplay.instance) {
                return Window_TimeDisplay.instance;
            }

            // Initialize logger if not already done
            if (!timeDisplayLogger && window.HDB_Logger) {
                timeDisplayLogger = window.HDB_Logger.forPlugin('HDB_TimeClock_Display');
            }

            // Get plugin parameters first
            const params = PluginManager.parameters('HDB_TimeClock_Display');
            const size = JSON.parse(params['Window Size'] || '{"width":"350","height":"auto"}');
            
            // Calculate size
            const height = size.height === 'auto' ? 60 : Number(size.height);
            
            // Calculate top right position
            const padding = 10;
            const x = Graphics.width - padding;
            const y = padding;

            // Call super constructor with temporary width
            super(x, y, 100, height);
            
            // Store parameters for later use
            this.size = size;
            
            // Set window properties
            this.opacity = 255;
            this.contents.fontSize = 24;
            this.contents.textColor = '#ffffff';
            this.contents.outlineColor = '#000000';
            this.contents.outlineWidth = 6;
            
            // Make sure window is visible
            this.visible = true;
            this.active = true;
            this.backOpacity = 255;
            
            // Initialize update tracking
            this.lastUpdateTime = Date.now();
            this._updateInterval = 1000;
            
            // Initial refresh to calculate proper width
            this.refresh();
            
            // Adjust window position based on calculated width
            this.x = Graphics.width - this.width - padding;

            // Set the instance
            Window_TimeDisplay.instance = this;

            // Log window creation
            if (timeDisplayLogger) {
                timeDisplayLogger.info('Time display window created', {
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height
                });
            }
        }

        static getInstance() {
            if (!Window_TimeDisplay.instance) {
                if (Window_TimeDisplay.isInitializing) {
                    console.warn('TimeDisplay initialization already in progress');
                    return null;
                }
                Window_TimeDisplay.isInitializing = true;
                Window_TimeDisplay.instance = new Window_TimeDisplay();
                Window_TimeDisplay.isInitializing = false;
            }
            return Window_TimeDisplay.instance;
        }

        update() {
            super.update();
            const now = Date.now();
            const timeSinceLastUpdate = now - this.lastUpdateTime;
            
            // Only update if we've waited at least 1000ms since the last update
            if (timeSinceLastUpdate >= 1000) {
                // Force a refresh of the time data
                if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
                    $gameHDB.time.update();
                }
                this.refresh();
                this.lastUpdateTime = now;
                
                // Log the update timing
                if (timeDisplayLogger) {
                    timeDisplayLogger.debug('Time display update', {
                        timeSinceLastUpdate,
                        lastUpdateTime: this.lastUpdateTime,
                        now: now
                    });
                }
            }
        }

        refresh() {
            this.contents.clear();
            const timeString = this.getFormattedTimeString();
            
            // Calculate text width
            this.contents.fontSize = 24;
            const textWidth = this.textWidth(timeString);
            const outlinePadding = this.contents.outlineWidth * 2;
            const fixedPadding = 75;
            const totalWidth = textWidth + outlinePadding + fixedPadding;
            
            // Resize window if needed
            if (this.width !== totalWidth) {
                this.width = totalWidth;
                this.createContents();
            }
            
            // Draw text with horizontal centering and adjusted vertical position
            this.drawText(timeString, 0, -5, this.width, this.height, 'center');
            
            // Log the window's current state
            if (timeDisplayLogger) {
                timeDisplayLogger.info('Window state after refresh', {
                    visible: this.visible,
                    active: this.active,
                    opacity: this.opacity,
                    backOpacity: this.backOpacity,
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    parent: this.parent ? 'Scene_Map' : 'none'
                });
            }
        }

        getFormattedTimeString() {
            const params = PluginManager.parameters('HDB_TimeClock_Display');
            let format = params['Display Format'];
            
            // Safety check for time system
            if (!$gameHDB || !$gameHDB.time || !$gameHDB.time.isReady) {
                if (timeDisplayLogger) {
                    timeDisplayLogger.warn('Time system not available or not ready');
                }
                return "Time System Not Available";
            }
            
            // Get time values from the TimeSystem instance
            const timeData = $gameHDB.time.getCurrentTime();
            
            // Safety check for time data
            if (!timeData) {
                if (timeDisplayLogger) {
                    timeDisplayLogger.warn('Time data not available');
                }
                return "Time Data Not Available";
            }

            // Log the time data we're working with
            if (timeDisplayLogger) {
                timeDisplayLogger.info('Time data received', timeData);
            }

            // Ensure all required values exist with defaults
            const values = {
                year: timeData.year || 1,
                month: timeData.month || 1,
                day: timeData.day || 1,
                hour: timeData.hour || 0,
                minute: timeData.minute || 0
            };

            // Replace placeholders with actual values
            return format
                .replace(/{year}/g, values.year)
                .replace(/{month}/g, values.month.toString().padStart(2, '0'))
                .replace(/{day}/g, values.day.toString().padStart(2, '0'))
                .replace(/{hour}/g, values.hour.toString().padStart(2, '0'))
                .replace(/{minute}/g, values.minute.toString().padStart(2, '0'));
        }
    }

    // Initialize static properties
    Window_TimeDisplay.instance = null;
    Window_TimeDisplay.isInitializing = false;

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
            $gameHDB.time.addTimeUpdateListener(this.updateLighting.bind(this));
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

    // Scene_Map extension
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        
        // Wait for time system to be ready
        if (!$gameHDB || !$gameHDB.time || !$gameHDB.time.isReady) {
            if (timeDisplayLogger) {
                timeDisplayLogger.warn('Time system not ready, delaying window creation');
            }
            // Try again in a short while
            setTimeout(() => {
                if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
                    this.createTimeDisplayWindow();
                } else {
                    if (timeDisplayLogger) {
                        timeDisplayLogger.error('Time system still not ready after delay');
                    }
                }
            }, 1000);
            return;
        }
        
        this.createTimeDisplayWindow();
    };

    // Add new method to create time display window
    Scene_Map.prototype.createTimeDisplayWindow = function() {
        // Create and add the time display window
        this._timeDisplayWindow = Window_TimeDisplay.getInstance();
        
        if (!this._timeDisplayWindow) {
            if (timeDisplayLogger) {
                timeDisplayLogger.error('Failed to create time display window');
            }
            return;
        }
        
        // Ensure window is on top and properly positioned
        this._timeDisplayWindow.z = 100;
        this._timeDisplayWindow.visible = true;
        this._timeDisplayWindow.active = true;
        this._timeDisplayWindow.opacity = 255;
        this._timeDisplayWindow.backOpacity = 255;
        
        // Add to scene if not already added
        if (!this._timeDisplayWindow.parent) {
            this.addChild(this._timeDisplayWindow);
        }
        
        // Force a refresh
        this._timeDisplayWindow.refresh();
        
        // Log only essential information
        if (timeDisplayLogger) {
            timeDisplayLogger.info('Time display window added to scene', {
                z: this._timeDisplayWindow.z,
                parent: this._timeDisplayWindow.parent ? 'Scene_Map' : 'none',
                visible: this._timeDisplayWindow.visible,
                active: this._timeDisplayWindow.active,
                opacity: this._timeDisplayWindow.opacity,
                backOpacity: this._timeDisplayWindow.backOpacity,
                x: this._timeDisplayWindow.x,
                y: this._timeDisplayWindow.y,
                width: this._timeDisplayWindow.width,
                height: this._timeDisplayWindow.height,
                screenWidth: Graphics.width,
                screenHeight: Graphics.height
            });
        }
    };

    // Update the time display window
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (this._timeDisplayWindow) {
            this._timeDisplayWindow.update();
            // Ensure window stays on top and visible
            this._timeDisplayWindow.z = 100;
            this._timeDisplayWindow.visible = true;
            this._timeDisplayWindow.active = true;
            
            // Log window state periodically
            if (this._timeDisplayWindow._updateInterval === 60 && timeDisplayLogger) {
                timeDisplayLogger.info('Window state during update', {
                    visible: this._timeDisplayWindow.visible,
                    active: this._timeDisplayWindow.active,
                    opacity: this._timeDisplayWindow.opacity,
                    backOpacity: this._timeDisplayWindow.backOpacity,
                    x: this._timeDisplayWindow.x,
                    y: this._timeDisplayWindow.y,
                    parent: this._timeDisplayWindow.parent ? 'Scene_Map' : 'none'
                });
            }
        } else {
            // Try to recreate window if it's missing
            this.createTimeDisplayWindow();
        }
    };

    // Initialize lighting system
    if ($gameHDB && $gameHDB.time && $gameHDB.time.isReady) {
        const lightingSystem = new LightingSystem();
    }
})(); 