/*:
 * @plugindesc v1.1.0 Time System Core for RPG Maker MV
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @param Time Settings
 * @text Time Configuration
 * 
 * @param realMinutesPerGameDay
 * @parent Time Settings
 * @type number
 * @min 0.1
 * @max 1440
 * @desc Number of real-world minutes that should pass for one in-game day
 * @default 15
 * 
 * @param Time Limits
 * @text Time Limit Configuration
 * 
 * @param dayEndHour
 * @parent Time Limits
 * @type number
 * @min 0
 * @max 23
 * @desc Hour when time stops (24-hour format)
 * @default 23
 * 
 * @param dayStartHour
 * @parent Time Limits
 * @type number
 * @min 0
 * @max 23
 * @desc Hour when new day starts after sleeping (24-hour format)
 * @default 6
 * 
 * @param Calendar Settings
 * @text Calendar Configuration
 * 
 * @param seasonLength
 * @parent Calendar Settings
 * @type number
 * @min 1
 * @desc Days per season
 * @default 28
 * 
 * @param startingSeason
 * @parent Calendar Settings
 * @type number
 * @min 0
 * @max 3
 * @desc Starting season (0: Spring, 1: Summer, 2: Fall, 3: Winter)
 * @default 0
 * 
 * @param startingYear
 * @parent Calendar Settings
 * @type number
 * @min 1
 * @desc Starting year
 * @default 1
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
 * @default WARN
 * 
 * @help This plugin provides core time management functionality for RPG Maker MV.
 * It handles time progression, calendar management, and provides hooks for other
 * systems to react to time changes.
 * 
 * =============================================================================
 * Plugin Dependencies
 * =============================================================================
 * 
 * This plugin requires HDB_SaveTackOns_Core.js and HDB_Logger_Core.js
 * to be loaded first.
 * 
 * =============================================================================
 * Event System
 * =============================================================================
 * 
 * Subscribe to time events with:
 * 
 * $gameHDB.time.on('timeUpdate', (timeData) => {
 *   // Handle time update
 * });
 * 
 * Available events:
 * - timeUpdate: Fired when time updates
 * - dayChange: Fired when day changes
 * - seasonChange: Fired when season changes
 * - yearChange: Fired when year changes
 * 
 * =============================================================================
 * Plugin Commands
 * =============================================================================
 * 
 * TIMECLOCK_SLEEP - Advances time to the next day's start hour
 * TIMECLOCK_PAUSE - Pauses time progression
 * TIMECLOCK_RESUME - Resumes time progression
 */

(function() {
    // Constants
    const PLUGIN_NAME = 'HDB_TimeClock_Core';
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
    const SEASONS_PER_YEAR = 4;
    
    // Create global instance if needed
    if (typeof $gameHDB === 'undefined') {
        $gameHDB = {};
    }

    // Time System Class
    class TimeSystem {
        constructor() {
            // Initialize logger first for proper debugging
            this.logger = window.HDB_Logger ? 
                window.HDB_Logger.createLogger(PLUGIN_NAME) : 
                { log: () => {} };
            
            this.logger.log('INFO', 'Initializing Time System');
            
            // Configuration (loaded from parameters)
            this.timeMultiplier = 0;
            this.dayEndHour = 23;
            this.dayStartHour = 6;
            this.seasonLength = 28;
            this.startingSeason = 0;
            this.startingYear = 1;
            
            // Time tracking
            this.totalGameMinutes = 0;
            this.lastUpdateTime = Date.now();
            this.accumulatedMinutes = 0;
            this.isTimePaused = false;
            
            // State tracking
            this.currentDay = 1;
            this.currentSeason = 0;
            this.currentYear = 1;
            this._lastDay = 1;
            
            // Event callbacks
            this.callbacks = {
                timeUpdate: [],
                dayChange: [],
                seasonChange: [],
                yearChange: []
            };
            
            // Load parameters
            this.loadParameters();
            
            // Initialize save data
            this.initializeSaveData();
            
            // Mark as ready
            this.isReady = true;
            this.logger.log('INFO', 'Time System is ready');
        }

        loadParameters() {
            this.logger.log('DEBUG', 'Loading parameters');
            
            const params = PluginManager.parameters(PLUGIN_NAME);
            
            // Time settings
            const realMinutesPerGameDay = Number(params.realMinutesPerGameDay) || 15;
            this.timeMultiplier = 1440 / (realMinutesPerGameDay * 60);
            
            // Time limits
            this.dayEndHour = Number(params.dayEndHour) || 23;
            this.dayStartHour = Number(params.dayStartHour) || 6;
            
            // Calendar settings
            this.seasonLength = Number(params.seasonLength) || 28;
            this.startingSeason = Number(params.startingSeason) || 0;
            this.startingYear = Number(params.startingYear) || 1;
            
            this.logger.log('INFO', `Parameters loaded: timeMultiplier=${this.timeMultiplier}, dayEndHour=${this.dayEndHour}, dayStartHour=${this.dayStartHour}, seasonLength=${this.seasonLength}`);
        }
        
        initializeSaveData() {
            this.logger.log('DEBUG', 'Initializing save data');
            
            if (window.$gameHDB && window.$gameHDB.save) {
                // Default data structure
                const defaultData = {
                    totalGameMinutes: 0,
                    currentDay: 1,
                    currentSeason: this.startingSeason,
                    currentYear: this.startingYear,
                    lastUpdateTime: Date.now(),
                    isTimePaused: false
                };
                
                // Register with save system
                window.$gameHDB.save.initializePlugin('timeSystem', defaultData);
                
                this.logger.log('INFO', 'Save data initialized');
            } else {
                this.logger.log('WARN', 'Save system not available, operating without persistence');
            }
        }

        update() {
            if (!this.isReady) return;
            
            const now = Date.now();
            // Only update every second to reduce performance impact
            if (now - this.lastUpdateTime >= 1000) {
                this.updateTime(now);
            }
        }
        
        updateTime(now) {
            const realTimeDiff = now - this.lastUpdateTime;
            
            // Only update if we're not paused, not at time limit, and not in menu/battle
            if (!this.isTimePaused && !this.isAtTimeLimit() && !this.isGamePaused()) {
                // Calculate game minutes to add based on real time
                const newMinutes = (realTimeDiff / 1000) * this.timeMultiplier;
                this.accumulatedMinutes += newMinutes;
                
                // Only process whole minutes
                if (this.accumulatedMinutes >= 1) {
                    const gameMinutes = Math.floor(this.accumulatedMinutes);
                    this.accumulatedMinutes -= gameMinutes;
                    
                    // Update total minutes
                    this.totalGameMinutes += gameMinutes;
                        this.lastUpdateTime = now;
                        
                    // Update calendar values
                    this.updateCalendar();
                    
                    this.logger.log('DEBUG', `Updated time: added ${gameMinutes} game minutes, total=${this.totalGameMinutes}`);
                }
            } else {
                // Still update lastUpdateTime to prevent jumps when resuming
                this.lastUpdateTime = now;
            }
            
            // Always emit time update for UI
            this.emitTimeUpdate();
        }
        
        updateCalendar() {
            // Calculate calendar values
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const minutesPerSeason = this.seasonLength * minutesPerDay;
            const minutesPerYear = SEASONS_PER_YEAR * minutesPerSeason;

            // Calculate current day (1-based)
            const newDay = Math.floor(this.totalGameMinutes / minutesPerDay) + 1;
            
            // Check for day change
            if (newDay !== this.currentDay) {
                this.currentDay = newDay;
                
                // Calculate season and year
                this.currentSeason = Math.floor((this.totalGameMinutes % minutesPerYear) / minutesPerSeason);
                this.currentYear = Math.floor(this.totalGameMinutes / minutesPerYear) + this.startingYear;
                
                // Emit events
                this.emit('dayChange', this.getCurrentTime());
                
            // Check for season change
                if (Math.floor((this._lastDay - 1) / this.seasonLength) !== Math.floor((this.currentDay - 1) / this.seasonLength)) {
                    this.emit('seasonChange', this.getCurrentTime());

            // Check for year change
                    if (Math.floor((this._lastDay - 1) / (this.seasonLength * SEASONS_PER_YEAR)) !== 
                        Math.floor((this.currentDay - 1) / (this.seasonLength * SEASONS_PER_YEAR))) {
                        this.emit('yearChange', this.getCurrentTime());
                    }
                }
                
                this._lastDay = this.currentDay;
            }
        }
        
        getCurrentTime() {
            // Calculate hours and minutes from total minutes
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const currentDayMinutes = this.totalGameMinutes % minutesPerDay;
            
            const hour = Math.floor(currentDayMinutes / MINUTES_PER_HOUR);
            const minute = Math.floor(currentDayMinutes % MINUTES_PER_HOUR);

            return {
                total: this.totalGameMinutes,
                year: this.currentYear,
                season: this.currentSeason,
                seasonName: SEASONS[this.currentSeason],
                month: (this.currentSeason * 3) + 1, // Convert season to month (1-12)
                day: this.currentDay,
                hour: hour,
                minute: minute
            };
        }

        // Simplified helper for days since calculation
        getDaysSince(startDay, startSeason, startYear) {
            // Calculate total days for current time
            const currentTotalDays = 
                ((this.currentYear - 1) * SEASONS_PER_YEAR * this.seasonLength) + 
                                   (this.currentSeason * this.seasonLength) + 
                                   this.currentDay;
            
            // Calculate total days for start time
            const startTotalDays = 
                ((startYear - 1) * SEASONS_PER_YEAR * this.seasonLength) + 
                                  (startSeason * this.seasonLength) + 
                                  startDay;
            
            return currentTotalDays - startTotalDays;
        }
        
        isAtTimeLimit() {
            const currentHour = Math.floor((this.totalGameMinutes % (HOURS_PER_DAY * MINUTES_PER_HOUR)) / MINUTES_PER_HOUR);
            return currentHour >= this.dayEndHour;
        }
        
        isGamePaused() {
            // Check if we're in a menu, battle, etc
            return SceneManager._scene instanceof Scene_Menu ||
                   SceneManager._scene instanceof Scene_Battle ||
                   SceneManager._scene instanceof Scene_Map === false;
        }
        
        // Event system
        on(event, callback) {
            if (this.callbacks[event]) {
                this.callbacks[event].push(callback);
                return true;
            }
            return false;
        }
        
        off(event, callback) {
            if (this.callbacks[event]) {
                const index = this.callbacks[event].indexOf(callback);
                if (index !== -1) {
                    this.callbacks[event].splice(index, 1);
                    return true;
                }
            }
            return false;
        }
        
        emit(event, data) {
            if (this.callbacks[event]) {
                this.callbacks[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        this.logger.log('ERROR', `Error in ${event} callback: ${e.message}`);
                    }
                });
            }
        }
        
        emitTimeUpdate() {
            this.emit('timeUpdate', this.getCurrentTime());
        }
        
        // Compatibility with old API
        addTimeUpdateListener(callback) {
            return this.on('timeUpdate', callback);
        }

        addDayChangeListener(callback) {
            return this.on('dayChange', callback);
        }

        addSeasonChangeListener(callback) {
            return this.on('seasonChange', callback);
        }

        addYearChangeListener(callback) {
            return this.on('yearChange', callback);
        }
        
        // Time control methods
        pauseTime() {
            this.isTimePaused = true;
            this.logger.log('INFO', 'Time paused');
        }

        resumeTime() {
            this.isTimePaused = false;
            this.lastUpdateTime = Date.now(); // Reset to prevent time jump
            this.logger.log('INFO', 'Time resumed');
        }

        sleepUntilNextDay() {
            // Calculate minutes until next day at start hour
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const currentDayMinutes = this.totalGameMinutes % minutesPerDay;

            // If we're already past the end hour, advance to next day's start hour
            // If not, advance to next day's start hour from current time
            const minutesToNextDay = (minutesPerDay - currentDayMinutes) + (this.dayStartHour * MINUTES_PER_HOUR);

            // Advance time
            this.totalGameMinutes += minutesToNextDay;
            this.lastUpdateTime = Date.now();
            this.accumulatedMinutes = 0;

            // Update calendar values
            this.updateCalendar();
            
            // Resume time if it was paused
            this.resumeTime();

            this.logger.log('INFO', `Slept until next day: advanced ${minutesToNextDay} minutes to ${this.dayStartHour}:00`);

            // Force emit all events
            this.emitTimeUpdate();
        }
        
        // Save/Load integration
        saveData() {
            if (window.$gameHDB && window.$gameHDB.save) {
                const timeData = {
                    totalGameMinutes: this.totalGameMinutes,
                    currentDay: this.currentDay,
                    currentSeason: this.currentSeason,
                    currentYear: this.currentYear,
                    lastUpdateTime: Date.now(), // Always save current time
                    isTimePaused: this.isTimePaused
                };
                
                window.$gameHDB.save.setPluginData('timeSystem', timeData);
                this.logger.log('INFO', 'Time data saved');
            }
        }
        
        loadData() {
            if (window.$gameHDB && window.$gameHDB.save) {
                const savedData = window.$gameHDB.save.getPluginData('timeSystem');
                
                if (savedData) {
                    // Restore from saved data
                    this.totalGameMinutes = savedData.totalGameMinutes || 0;
                    this.currentDay = savedData.currentDay || 1;
                    this.currentSeason = savedData.currentSeason || this.startingSeason;
                    this.currentYear = savedData.currentYear || this.startingYear;
                    this.isTimePaused = savedData.isTimePaused || false;
                    this._lastDay = this.currentDay;
                    
                    // Always reset the last update time to now
                    this.lastUpdateTime = Date.now();
                    this.accumulatedMinutes = 0;
                    
                    this.logger.log('INFO', 'Time data loaded');
                    
                    // Emit events
                    this.emitTimeUpdate();
    } else {
                    this.logger.log('WARN', 'No saved time data found');
                }
            }
        }
    }
    
    // Create the time system
    $gameHDB.time = new TimeSystem();
    $gameHDB.TimeSystem = TimeSystem; // Expose the class
    
    // Integrate with core game
    
    // Update integration
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.update();
        }
        _Scene_Map_update.call(this);
    };

    // Plugin command integration
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        if (command === 'TIMECLOCK_SLEEP') {
            if ($gameHDB && $gameHDB.time) {
                $gameHDB.time.sleepUntilNextDay();
            }
        } else if (command === 'TIMECLOCK_PAUSE') {
            if ($gameHDB && $gameHDB.time) {
                $gameHDB.time.pauseTime();
            }
        } else if (command === 'TIMECLOCK_RESUME') {
            if ($gameHDB && $gameHDB.time) {
                $gameHDB.time.resumeTime();
            }
        } else if (command === 'TIMECLOCK_DEBUG') {
            console.log("so sick of this slop")
            if ($gameHDB && $gameHDB.time) {
                const timeData = $gameHDB.time.getCurrentTime();
                const debugInfo = {
                    totalGameMinutes: $gameHDB.time.totalGameMinutes,
                    currentTime: timeData,
                    isPaused: $gameHDB.time.isTimePaused,
                    isAtLimit: $gameHDB.time.isAtTimeLimit(),
                    lastUpdate: $gameHDB.time.lastUpdateTime,
                    accumulatedMinutes: $gameHDB.time.accumulatedMinutes,
                    timeMultiplier: $gameHDB.time.timeMultiplier
                };
                console.log('TimeClock Debug Info:', debugInfo);
            }
        }
    };
    
    // Save/load hooks
    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.saveData();
        }
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.loadData();
        }
    };

    // New game initialization
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        if ($gameHDB && $gameHDB.time) {
            // Reset time system to defaults for new game
            $gameHDB.time.totalGameMinutes = 0;
            $gameHDB.time.currentDay = 1;
            $gameHDB.time.currentSeason = $gameHDB.time.startingSeason;
            $gameHDB.time.currentYear = $gameHDB.time.startingYear;
            $gameHDB.time.lastUpdateTime = Date.now();
            $gameHDB.time.isTimePaused = false;
            $gameHDB.time._lastDay = 1;
            $gameHDB.time.emitTimeUpdate();
        }
    };
})(); 