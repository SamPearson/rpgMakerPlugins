/*:
 * @plugindesc v1.0.0 Logging System Core for HDB plugins
 * @author HDB & Associates
 * 
 * @help
 * HDB_Core_Logger.js
 * 
 * This plugin provides a simple logging system for all HDB plugins.
 * 
 * Usage in other plugins:
 * 
 * // Add this parameter to your plugin header (can be nested under a group):
 * @param logLevel
 * @type select
 * @option DEBUG
 * @option INFO
 * @option WARN
 * @option ERROR
 * @default INFO
 * 
 * // Initialize logger for your plugin
 * const logger = window.HDB_Logger.forPlugin('HDB_YourPlugin', PluginManager.parameters('HDB_YourPlugin').logLevel);
 * 
 * // Log messages
 * logger.log('DEBUG', 'Detailed information');
 * logger.log('INFO', 'Normal information');
 * logger.log('WARN', 'Warning message');
 * logger.log('ERROR', 'Error occurred');
 */

(function() {
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    class Logger {
        constructor(pluginName, logLevelLimit) {
            this.pluginName = pluginName;
            console.log(`Creating logger for ${pluginName} with level ${logLevelLimit}`);
            console.log('Available log levels:', LOG_LEVELS);
            this.minLevel = logLevelLimit !== undefined ? LOG_LEVELS[logLevelLimit] : LOG_LEVELS['INFO'];
            console.log(`Set minimum level to ${this.minLevel} (${logLevelLimit})`);
        }

        log(level, message) {
            const messageLevel = LOG_LEVELS[level];
            // In case it's necessary to debug the logger
            //console.log(`Logging message: level=${level} (${messageLevel}), minLevel=${this.minLevel}`);
            if (messageLevel >= this.minLevel) {
                console.log(`[${level}][${this.pluginName}] ${message}`);
            }
        }
    }

    // Initialize global state
    window.HDB_Logger = {
        forPlugin: function(pluginName, logLevel) {
            return new Logger(pluginName, logLevel);
        }
    };
})(); 