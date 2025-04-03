/*:
 * @plugindesc v1.0.0 Time System Core Plugin for RPG Maker MV
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
 * @help This plugin provides core time management functionality for RPG Maker MV.
 * It handles time progression, calendar management, and provides hooks for other
 * systems to react to time changes.
 */

(function() {
    'use strict';

    // Constants
    const PLUGIN_NAME = 'HDB_TimeClock_Core';
    const HOURS_PER_DAY = 24;
    const MINUTES_PER_HOUR = 60;
    const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
    const SEASONS_PER_YEAR = 4;

    // Time System Class
    class TimeSystem {
        constructor() {
            this._initialized = false;
            this._time = {
                totalMinutes: 0,
                day: 1,
                season: 0,
                year: 1,
                hour: 0,
                minute: 0
            };
            this._state = {
                isPaused: false,
                lastUpdate: Date.now(),
                accumulatedMinutes: 0
            };
            this._config = {
                timeMultiplier: 0,
                dayEndHour: 23,
                dayStartHour: 6,
                seasonLength: 28
            };
        }

        initialize() {
            if (!this._initialized) {
                // Load parameters
                const params = PluginManager.parameters(PLUGIN_NAME);
                const realMinutesPerGameDay = Number(params.realMinutesPerGameDay) || 15;
                this._config.timeMultiplier = 1440 / (realMinutesPerGameDay * 60);
                this._config.dayEndHour = Number(params.dayEndHour) || 23;
                this._config.dayStartHour = Number(params.dayStartHour) || 6;
                this._config.seasonLength = Number(params.seasonLength) || 28;

                // Initialize time
                this._time.day = 1;
                this._time.season = 0;
                this._time.year = 1;
                this._time.hour = 0;
                this._time.minute = 0;
                this._time.totalMinutes = 0;

                this._initialized = true;
                console.log('Time System initialized:', this._config);
            }
            return this;
        }

        update() {
            if (!this._initialized) return;

            const now = Date.now();
            if (now - this._state.lastUpdate >= 1000) {
                this.updateTime(now);
            }
        }

        updateTime(now) {
            if (this._state.isPaused) {
                this._state.lastUpdate = now;
                return;
            }

            const realTimeDiff = now - this._state.lastUpdate;
            const newMinutes = (realTimeDiff / 1000) * this._config.timeMultiplier;
            this._state.accumulatedMinutes += newMinutes;

            if (this._state.accumulatedMinutes >= 1) {
                const gameMinutes = Math.floor(this._state.accumulatedMinutes);
                this._state.accumulatedMinutes -= gameMinutes;
                this._time.totalMinutes += gameMinutes;

                // Update calendar values
                const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
                const minutesPerSeason = this._config.seasonLength * minutesPerDay;
                const minutesPerYear = SEASONS_PER_YEAR * minutesPerSeason;

                this._time.day = Math.floor(this._time.totalMinutes / minutesPerDay) + 1;
                this._time.season = Math.floor((this._time.totalMinutes % minutesPerYear) / minutesPerSeason);
                this._time.year = Math.floor(this._time.totalMinutes / minutesPerYear) + 1;
                this._time.hour = Math.floor((this._time.totalMinutes % minutesPerDay) / MINUTES_PER_HOUR);
                this._time.minute = Math.floor(this._time.totalMinutes % MINUTES_PER_HOUR);
            }

            this._state.lastUpdate = now;
        }

        getCurrentTime() {
            return {
                ...this._time,
                seasonName: SEASONS[this._time.season]
            };
        }

        pauseTime() {
            this._state.isPaused = true;
        }

        resumeTime() {
            this._state.isPaused = false;
            this._state.lastUpdate = Date.now();
        }

        sleepUntilNextDay() {
            const minutesPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR;
            const currentDayMinutes = this._time.totalMinutes % minutesPerDay;
            const minutesToNextDay = (minutesPerDay - currentDayMinutes) + (this._config.dayStartHour * MINUTES_PER_HOUR);
            
            this._time.totalMinutes += minutesToNextDay;
            this._state.lastUpdate = Date.now();
            this._state.accumulatedMinutes = 0;
            
            // Force update calendar values
            this.updateTime(Date.now());
        }
    }

    // Singleton pattern implementation
    const TimeSystemSingleton = {
        _instance: null,
        
        getInstance: function() {
            if (!this._instance) {
                this._instance = new TimeSystem();
            }
            return this._instance;
        }
    };

    // Make singleton globally available
    window.HDB_TimeSystem = TimeSystemSingleton;

    // Integrate with core game
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        const timeSystem = window.HDB_TimeSystem.getInstance();
        if (timeSystem && timeSystem._initialized) {
            timeSystem.update();
        }
        _Scene_Map_update.call(this);
    };

    // Plugin command integration
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        const timeSystem = window.HDB_TimeSystem.getInstance();
        if (!timeSystem || !timeSystem._initialized) return;

        if (command === 'TIMECLOCK_SLEEP') {
            timeSystem.sleepUntilNextDay();
        } else if (command === 'TIMECLOCK_PAUSE') {
            timeSystem.pauseTime();
        } else if (command === 'TIMECLOCK_RESUME') {
            timeSystem.resumeTime();
        } else if (command === 'TIMECLOCK_DEBUG') {
            console.log('Time System Debug Info:', {
                time: timeSystem.getCurrentTime(),
                state: timeSystem._state,
                config: timeSystem._config
            });
        }
    };

    // Initialize time system when game starts
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        window.HDB_TimeSystem.getInstance().initialize();
    };
})(); 