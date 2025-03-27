/*:
 * @plugindesc v1.0.0_beta Time System Core for RPG Maker MV
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
 * @desc Number of real-world minutes that should pass for one in-game day (15 = 15 real minutes per game day)
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
 * @help This plugin provides core time management functionality for RPG Maker MV.
 * It handles time progression, calendar management, and provides hooks for other
 * systems to react to time changes.
 * 
 * =============================================================================
 * Plugin Dependencies
 * =============================================================================
 * 
 * This plugin requires HDB_SaveSystem.js to be loaded first.
 * 
 * =============================================================================
 * Time System Events
 * =============================================================================
 * 
 * The time system emits the following events that other plugins can listen to:
 * 
 * - timeUpdate: Fired when time updates
 * - dayChange: Fired when day changes
 * - seasonChange: Fired when season changes
 * - yearChange: Fired when year changes
 * 
 * Example usage in other plugins:
 * 
 * $gameHDB.time.onTimeUpdate.add((timeData) => {
 *   // Handle time update
 * });
 */

(function() {
    // Constants
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
    const SEASONS_PER_YEAR = 4;

    // Time System Class
    class TimeSystem {
        constructor() {
            // Initialize with a temporary logger
            this.logger = {
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                group: () => {},
                groupEnd: () => {}
            };

            // Try to get the real logger if available
            if (window.HDB_Logger) {
                console.log('Initializing time system with logger');
                this.logger = window.HDB_Logger.forPlugin('HDB_Core_TimeClock');
                // Test the logger
                this.logger.info('Time system logger initialized');
            } else {
                console.warn('Logger not available for time system');
            }

            // Initialize time tracking
            this.currentTime = 0;
            this.lastUpdateTime = Date.now();
            this.accumulatedMinutes = 0; // Track fractional minutes

            // Load parameters first
            this.loadParameters();
            
            // Then initialize the rest
            this.initialize();
        }

        initialize() {
            console.log('Initializing time system');
            this.logger.group('Time System Initialization');
            
            // Initialize save data
            if (window.$gameHDB && window.$gameHDB.save) {
                window.$gameHDB.save.initializePlugin('timeSystem', {
                    currentTime: 0,
                    currentDay: 1,
                    currentSeason: this.startingSeason,
                    currentYear: this.startingYear,
                    lastUpdateTime: Date.now(),
                    totalMenuTime: 0,
                    menuOpenTime: null
                });

                // Load saved data
                const savedData = window.$gameHDB.save.getPluginData('timeSystem');
                if (savedData) {
                    // Calculate real time passed since last save
                    const now = Date.now();
                    const realTimePassed = now - savedData.lastUpdateTime;
                    
                    // Adjust lastUpdateTime to account for real time passed
                    savedData.lastUpdateTime = now;
                    
                    Object.assign(this, savedData);
                    this.logger.info('Loaded saved time data', {
                        ...savedData,
                        realTimePassed,
                        adjustedLastUpdateTime: now
                    });
                }
            }

            // Initialize event system
            this.initializeEvents();

            this.logger.info('Time System Initialized', {
                currentTime: this.currentTime,
                currentDay: this.currentDay,
                currentSeason: this.currentSeason,
                currentYear: this.currentYear,
                lastUpdateTime: this.lastUpdateTime,
                timeMultiplier: this.timeMultiplier
            });
            
            this.logger.groupEnd();
        }

        loadParameters() {
            const params = PluginManager.parameters('HDB_Core_TimeClock');
            console.log('Raw plugin parameters:', params); // Debug log
            
            // Parse real minutes per game day with explicit type conversion and default value
            const rawRealMinutesPerGameDay = params.realMinutesPerGameDay;
            console.log('Raw real minutes per game day:', rawRealMinutesPerGameDay); // Debug log
            
            // Ensure we have a valid number, default to 15 if not
            const realMinutesPerGameDay = Number(rawRealMinutesPerGameDay) || 15;
            console.log('Parsed real minutes per game day:', realMinutesPerGameDay); // Debug log
            
            // Calculate timeMultiplier: (game minutes per day) / (real seconds per day)
            // game minutes per day = 1440 (24 hours * 60 minutes)
            // real seconds per day = realMinutesPerGameDay * 60
            this.timeMultiplier = 1440 / (realMinutesPerGameDay * 60);
            
            // Load time limit parameters
            this.dayEndHour = Number(params.dayEndHour || 23);
            this.dayStartHour = Number(params.dayStartHour || 6);
            this.isTimePaused = false;
            
            console.log('Time multiplier calculation:', {
                rawValue: rawRealMinutesPerGameDay,
                parsedValue: realMinutesPerGameDay,
                defaultValue: 15,
                finalValue: this.timeMultiplier,
                calculation: {
                    gameMinutesPerDay: 1440,
                    realSecondsPerDay: realMinutesPerGameDay * 60,
                    timeMultiplier: this.timeMultiplier
                }
            });
            
            this.seasonLength = Number(params.seasonLength || 28);
            this.startingSeason = Number(params.startingSeason || 0);
            this.startingYear = Number(params.startingYear || 1);
            
            this.logger.info('Time System Parameters', {
                realMinutesPerGameDay,
                timeMultiplier: this.timeMultiplier,
                dayEndHour: this.dayEndHour,
                dayStartHour: this.dayStartHour,
                seasonLength: this.seasonLength,
                startingSeason: this.startingSeason,
                startingYear: this.startingYear,
                rawParams: params
            });
        }

        initializeEvents() {
            this.onTimeUpdate = new Set();
            this.onDayChange = new Set();
            this.onSeasonChange = new Set();
            this.onYearChange = new Set();
        }

        update() {
            // Log update start
            this.logger.debug('Time System Update', {
                currentTime: this.currentTime,
                lastUpdateTime: this.lastUpdateTime
            });

            // Update time
            this.updateTime();

            // Log update end
            this.logger.debug('Time System Update Complete', {
                newTime: this.currentTime,
                newLastUpdateTime: this.lastUpdateTime
            });
        }

        updateTime() {
            const now = Date.now();
            const realTimeDiff = now - this.lastUpdateTime;
            
            // Only update if we have waited at least 1 second since last update
            // and we're not in a menu or battle
            // and we're not at the time limit
            // and time isn't paused
            if (realTimeDiff >= 1000 && !this.isGamePaused() && !this.isAtTimeLimit() && !this.isTimePaused) {
                // Calculate game minutes based on real time difference using timeMultiplier
                const newMinutes = (realTimeDiff / 1000) * this.timeMultiplier;
                this.accumulatedMinutes += newMinutes;
                
                this.logger.info('Time Update Start', {
                    realTimeDiff,
                    newMinutes,
                    accumulatedMinutes: this.accumulatedMinutes,
                    currentTime: this.currentTime,
                    timeMultiplier: this.timeMultiplier,
                    lastUpdateTime: this.lastUpdateTime,
                    now: now,
                    isPaused: this.isGamePaused(),
                    calculation: {
                        realSeconds: realTimeDiff / 1000,
                        multiplier: this.timeMultiplier,
                        calculatedMinutes: newMinutes,
                        accumulatedMinutes: this.accumulatedMinutes
                    }
                });

                // Only update actual game time if we have at least 1 full minute
                if (this.accumulatedMinutes >= 1) {
                    const gameMinutes = Math.floor(this.accumulatedMinutes);
                    this.accumulatedMinutes -= gameMinutes; // Keep the remainder
                    
                    if (gameMinutes > 0) {
                        this.currentTime += gameMinutes;
                        this.lastUpdateTime = now;
                        
                        // Update actual game time values
                        const totalMinutes = this.currentTime;
                        const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
                        const minutesPerSeason = this.seasonLength * minutesPerDay;
                        const minutesPerYear = 4 * minutesPerSeason; // 4 seasons per year

                        // Calculate current day (1-based)
                        this.currentDay = Math.floor(totalMinutes / minutesPerDay) + 1;
                        
                        // Calculate current season (0-3)
                        this.currentSeason = Math.floor((totalMinutes % minutesPerYear) / minutesPerSeason);
                        
                        // Calculate current year (1-based)
                        this.currentYear = Math.floor(totalMinutes / minutesPerYear) + this.startingYear;
                        
                        // Emit day/season/year change events only when actual values change
                        if (this.currentDay !== this._lastDay) {
                            this.handleDayChange();
                            this._lastDay = this.currentDay;
                        }
                        
                        this.logger.info('Time Updated', {
                            newCurrentTime: this.currentTime,
                            newLastUpdateTime: this.lastUpdateTime,
                            currentDay: this.currentDay,
                            currentSeason: this.currentSeason,
                            currentYear: this.currentYear,
                            minutesPerDay,
                            minutesPerSeason,
                            minutesPerYear,
                            totalMinutes,
                            timeMultiplier: this.timeMultiplier,
                            accumulatedMinutes: this.accumulatedMinutes
                        });
                    }
                }
            }

            // Always emit visual update with current accumulated time
            const visualTime = this.currentTime + this.accumulatedMinutes;
            const totalMinutes = visualTime;
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const minutesPerSeason = this.seasonLength * minutesPerDay;
            const minutesPerYear = 4 * minutesPerSeason; // 4 seasons per year

            // Calculate current day (1-based)
            const visualDay = Math.floor(totalMinutes / minutesPerDay) + 1;
            
            // Calculate current season (0-3)
            const visualSeason = Math.floor((totalMinutes % minutesPerYear) / minutesPerSeason);
            
            // Calculate current year (1-based)
            const visualYear = Math.floor(totalMinutes / minutesPerYear) + this.startingYear;

            // Emit time update event with visual time
            this.emitTimeUpdate({
                time: visualTime,
                day: visualDay,
                season: visualSeason,
                year: visualYear,
                hour: Math.floor((visualTime % (HOURS_PER_DAY * MINUTES_PER_HOUR)) / MINUTES_PER_HOUR),
                minute: Math.floor(visualTime % MINUTES_PER_HOUR)
            });
        }

        handleDayChange() {
            // Check for season change
            const oldSeason = this.currentSeason;
            this.currentSeason = Math.floor((this.currentDay - 1) / this.seasonLength) % SEASONS_PER_YEAR;
            
            if (this.currentSeason !== oldSeason) {
                this.handleSeasonChange();
            }

            // Check for year change
            const oldYear = this.currentYear;
            this.currentYear = Math.floor((this.currentDay - 1) / (this.seasonLength * SEASONS_PER_YEAR)) + this.startingYear;
            
            if (this.currentYear !== oldYear) {
                this.handleYearChange();
            }

            // Emit day change event
            this.emitDayChange();
        }

        handleSeasonChange() {
            this.emitSeasonChange();
        }

        handleYearChange() {
            this.emitYearChange();
        }

        emitTimeUpdate(timeData) {
            // If no timeData provided, use current game time
            if (!timeData) {
                timeData = {
                    time: this.currentTime,
                    day: this.currentDay,
                    season: this.currentSeason,
                    year: this.currentYear,
                    hour: Math.floor((this.currentTime % (HOURS_PER_DAY * MINUTES_PER_HOUR)) / MINUTES_PER_HOUR),
                    minute: this.currentTime % MINUTES_PER_HOUR
                };
            }
            
            this.onTimeUpdate.forEach(callback => callback(timeData));
        }

        emitDayChange() {
            this.onDayChange.forEach(callback => callback({
                day: this.currentDay,
                season: this.currentSeason,
                year: this.currentYear
            }));
        }

        emitSeasonChange() {
            this.onSeasonChange.forEach(callback => callback({
                season: this.currentSeason,
                year: this.currentYear
            }));
        }

        emitYearChange() {
            this.onYearChange.forEach(callback => callback({
                year: this.currentYear
            }));
        }

        saveData() {
            if (window.$gameHDB && window.$gameHDB.save) {
                const timeData = {
                    currentTime: this.currentTime,
                    currentDay: this.currentDay,
                    currentSeason: this.currentSeason,
                    currentYear: this.currentYear,
                    lastUpdateTime: this.lastUpdateTime,
                    totalMenuTime: this.totalMenuTime || 0,
                    menuOpenTime: this.menuOpenTime
                };
                window.$gameHDB.save.setPluginData('timeSystem', timeData);
                this.logger.info('Saved time data', timeData);
            }
        }

        loadData() {
            if (window.$gameHDB && window.$gameHDB.save) {
                const savedData = window.$gameHDB.save.getPluginData('timeSystem');
                if (savedData) {
                    Object.assign(this, savedData);
                    this.logger.info('Loaded time data', savedData);
                }
            }
        }

        // Public API methods
        getCurrentTime() {
            // Ensure we have valid data
            if (!this.currentTime) {
                this.currentTime = 0;
                this.currentDay = 1;
                this.currentSeason = this.startingSeason;
                this.currentYear = this.startingYear;
                this.lastUpdateTime = Date.now();
                this.totalMenuTime = 0;
                this.menuOpenTime = null;
            }

            // Calculate hours and minutes from total minutes
            const totalMinutes = this.currentTime;
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const currentDayMinutes = totalMinutes % minutesPerDay;
            
            const hour = Math.floor(currentDayMinutes / MINUTES_PER_HOUR);
            const minute = currentDayMinutes % MINUTES_PER_HOUR;

            this.logger.debug('Time Calculation', {
                totalMinutes,
                minutesPerDay,
                currentDayMinutes,
                hour,
                minute
            });

            return {
                year: this.currentYear,
                month: (this.currentSeason * 3) + 1, // Convert season to month (1-12)
                day: this.currentDay,
                hour: hour,
                minute: minute,
                season: this.currentSeason,
                seasonName: SEASONS[this.currentSeason]
            };
        }

        addTimeUpdateListener(callback) {
            this.onTimeUpdate.add(callback);
        }

        addDayChangeListener(callback) {
            this.onDayChange.add(callback);
        }

        addSeasonChangeListener(callback) {
            this.onSeasonChange.add(callback);
        }

        addYearChangeListener(callback) {
            this.onYearChange.add(callback);
        }

        // Add menu tracking methods
        onMenuOpen() {
            this.menuOpenTime = Date.now();
            this.logger.info('Menu opened', { menuOpenTime: this.menuOpenTime });
        }

        onMenuClose() {
            if (this.menuOpenTime) {
                const menuDuration = Date.now() - this.menuOpenTime;
                this.totalMenuTime = (this.totalMenuTime || 0) + menuDuration;
                this.lastUpdateTime += menuDuration; // Adjust lastUpdateTime to account for menu time
                this.menuOpenTime = null;
                this.logger.info('Menu closed', {
                    menuDuration,
                    totalMenuTime: this.totalMenuTime,
                    adjustedLastUpdateTime: this.lastUpdateTime
                });
            }
        }

        isGamePaused() {
            return SceneManager._scene instanceof Scene_Menu ||
                   SceneManager._scene instanceof Scene_Item ||
                   SceneManager._scene instanceof Scene_Skill ||
                   SceneManager._scene instanceof Scene_Equip ||
                   SceneManager._scene instanceof Scene_Status ||
                   SceneManager._scene instanceof Scene_File ||
                   SceneManager._scene instanceof Scene_Options ||
                   SceneManager._scene instanceof Scene_Gameover ||
                   SceneManager._scene instanceof Scene_Title ||
                   SceneManager._scene instanceof Scene_Battle;
        }

        isAtTimeLimit() {
            const currentHour = Math.floor((this.currentTime % (HOURS_PER_DAY * MINUTES_PER_HOUR)) / MINUTES_PER_HOUR);
            return currentHour >= this.dayEndHour;
        }

        pauseTime() {
            this.isTimePaused = true;
            this.logger.info('Time paused', { 
                currentTime: this.currentTime,
                currentHour: Math.floor((this.currentTime % (HOURS_PER_DAY * MINUTES_PER_HOUR)) / MINUTES_PER_HOUR)
            });
        }

        resumeTime() {
            this.isTimePaused = false;
            this.logger.info('Time resumed');
        }

        sleepUntilNextDay() {
            // Calculate current hour and minutes into the day
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const currentDayMinutes = this.currentTime % minutesPerDay;
            const currentHour = Math.floor(currentDayMinutes / MINUTES_PER_HOUR);

            // Calculate minutes until next day at start hour
            const minutesToNextDay = (minutesPerDay - currentDayMinutes) + (this.dayStartHour * MINUTES_PER_HOUR);

            // Advance time
            this.currentTime += minutesToNextDay;
            this.lastUpdateTime = Date.now();
            this.accumulatedMinutes = 0;

            // Update day/season/year
            const totalMinutes = this.currentTime;
            this.currentDay = Math.floor(totalMinutes / minutesPerDay) + 1;
            this.currentSeason = Math.floor((totalMinutes % (minutesPerDay * this.seasonLength * 4)) / (minutesPerDay * this.seasonLength));
            this.currentYear = Math.floor(totalMinutes / (minutesPerDay * this.seasonLength * 4)) + this.startingYear;

            // Resume time
            this.resumeTime();

            this.logger.info('Slept until next day', {
                minutesAdvanced: minutesToNextDay,
                newDay: this.currentDay,
                newHour: this.dayStartHour,
                newSeason: this.currentSeason,
                newYear: this.currentYear
            });

            // Emit events
            this.handleDayChange();
            this.emitTimeUpdate();
        }
    }

    // Create global instance
    if (typeof $gameHDB === 'undefined') {
        $gameHDB = {};
    }
    if (!$gameHDB.time) {
        $gameHDB.time = new TimeSystem();
    }

    // Scene update handling
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.update();
        }
    };

    // Ensure time system is initialized before display window
    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        if ($gameHDB && !$gameHDB.time) {
            $gameHDB.time = new TimeSystem();
        }
        _Scene_Map_createDisplayObjects.call(this);
    };

    // Add save/load hooks to DataManager
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

    // Add menu hooks
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function() {
        _Scene_Menu_create.call(this);
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.onMenuOpen();
        }
    };

    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function() {
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.onMenuClose();
        }
        _Scene_Menu_terminate.call(this);
    };

    // Add battle hooks
    const _Scene_Battle_create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function() {
        _Scene_Battle_create.call(this);
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.onMenuOpen();
        }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        if ($gameHDB && $gameHDB.time) {
            $gameHDB.time.onMenuClose();
        }
        _Scene_Battle_terminate.call(this);
    };
})(); 