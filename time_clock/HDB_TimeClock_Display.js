/*:
 * @plugindesc v1.0.0 Time Display Plugin for RPG Maker MV
 * @author HDB & Associates
 * 
 * @target MV
 * 
 * @param Window Settings
 * @text Window Configuration
 * 
 * @param windowX
 * @parent Window Settings
 * @type number
 * @desc X position of the time window
 * @default 600
 * 
 * @param windowY
 * @parent Window Settings
 * @type number
 * @desc Y position of the time window
 * @default 0
 * 
 * @param windowWidth
 * @parent Window Settings
 * @type number
 * @desc Width of the time window
 * @default 220
 * 
 * @param windowHeight
 * @parent Window Settings
 * @type number
 * @desc Height of the time window
 * @default 30
 * 
 * @param timeFormat
 * @parent Window Settings
 * @type string
 * @desc Format string for time display (use {hour}, {minute}, {day}, {season}, {year})
 * @default {hour:02d}:{minute:02d} - Day {day} of {season}, Year {year}
 * 
 * @help This plugin provides a simple window to display the current in-game time.
 * It requires HDB_TimeClock_Core to be installed and loaded before this plugin.
 */

(function() {
    'use strict';

    // Constants
    const PLUGIN_NAME = 'HDB_TimeClock_Display';

    // Time Display Window
    class Window_TimeDisplay extends Window_Base {
        constructor() {
            const params = PluginManager.parameters(PLUGIN_NAME);
            const x = Number(params.windowX) || 550;
            const y = Number(params.windowY) || 0;
            const width = Number(params.windowWidth) || 250;
            const height = Number(params.windowHeight) || 70;
            super(x, y, width, height);
            this._timeFormat = params.timeFormat || '{hour:02d}:{minute:02d} - Day {day} of {season}, Year {year}';
            this._lastTime = null;
            this.refresh();
        }

        update() {
            super.update();
            const timeSystem = window.HDB_TimeSystem.getInstance();
            if (timeSystem && timeSystem._initialized) {
                const currentTime = timeSystem.getCurrentTime();
                if (JSON.stringify(currentTime) !== JSON.stringify(this._lastTime)) {
                    this.refresh();
                }
            }
        }

        refresh() {
            const timeSystem = window.HDB_TimeSystem.getInstance();
            if (!timeSystem || !timeSystem._initialized) {
                this.contents.clear();
                this.drawText('Time System Not Ready', 0, 0, this.contentsWidth(), 'center');
                return;
            }

            const time = timeSystem.getCurrentTime();
            this._lastTime = { ...time };
            
            this.contents.clear();
            const formattedTime = this._timeFormat
                .replace('{hour:02d}', time.hour.toString().padStart(2, '0'))
                .replace('{minute:02d}', time.minute.toString().padStart(2, '0'))
                .replace('{day}', time.day)
                .replace('{season}', time.seasonName)
                .replace('{year}', time.year);
            
            // Center text both horizontally and vertically
            const lineHeight = this.lineHeight();
            const y = (this.contentsHeight() - lineHeight) / 2;
            this.drawText(formattedTime, 0, y, this.contentsWidth(), 'center');
        }
    }

    // Scene Integration
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this.createTimeDisplayWindow();
    };

    Scene_Map.prototype.createTimeDisplayWindow = function() {
        this._timeDisplayWindow = new Window_TimeDisplay();
        this.addWindow(this._timeDisplayWindow);
    };

    // Plugin command integration
    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        if (command === 'TIMECLOCK_SHOW') {
            SceneManager._scene._timeDisplayWindow.show();
        } else if (command === 'TIMECLOCK_HIDE') {
            SceneManager._scene._timeDisplayWindow.hide();
        }
    };
})(); 