/*:
 * @plugindesc v1.0.0 Logging System Core for HDB plugins
 * @author HDB & Associates
 * 
 * @param Enable Console Logging
 * @desc Enable logging to browser console
 * @type boolean
 * @default true
 * 
 * @param Log Level
 * @desc Minimum log level to display
 * @type select
 * @option DEBUG
 * @option INFO
 * @option WARN
 * @option ERROR
 * @default INFO
 * 
 * @param Enable Plugin Filters
 * @desc List of plugins to log (comma separated). Leave empty for all.
 * @type text
 * @default 
 * 
 * @help
 * HDB_Core_Logger.js
 * 
 * This plugin provides a centralized logging system for all HDB plugins.
 * 
 * Usage in other plugins:
 * 
 * // Initialize logger for your plugin
 * const logger = $gameHDB.logger.forPlugin('HDB_YourPlugin');
 * 
 * // Log messages
 * logger.debug('Detailed information', { someData: 123 });
 * logger.info('Normal information');
 * logger.warn('Warning message');
 * logger.error('Error occurred', error);
 * 
 * // Group related logs
 * logger.group('Operation Name');
 * logger.info('Step 1');
 * logger.info('Step 2');
 * logger.groupEnd();
 */

(function() {
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    class Logger {
        constructor(pluginName) {
            this.pluginName = pluginName;
            this.params = PluginManager.parameters('HDB_Core_Logger');
            this.minLevel = LOG_LEVELS[this.params['Log Level'] || 'INFO'];
            this.enabledPlugins = (this.params['Enable Plugin Filters'] || '').split(',').map(p => p.trim());
            
            // Debug log to verify logger creation
            console.log(`Logger created for plugin: ${pluginName}`, {
                params: this.params,
                minLevel: this.minLevel,
                enabledPlugins: this.enabledPlugins
            });
        }

        shouldLog(pluginName, level) {
            // Only log INFO and above by default
            if (level < LOG_LEVELS.INFO) return false;
            
            // Allow all plugins to log for now
            return true;
            
            // Original logic commented out for debugging
            /*
            if (!this.params['Enable Console Logging']) return false;
            if (level < this.minLevel) return false;
            if (this.enabledPlugins.length && !this.enabledPlugins.includes(pluginName)) return false;
            return true;
            */
        }

        formatMessage(level, message, data) {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}][${this.pluginName}][${level}]`;
            return data ? `${prefix} ${message}\n${JSON.stringify(data, null, 2)}` : `${prefix} ${message}`;
        }

        log(level, message, data) {
            if (!this.shouldLog(this.pluginName, LOG_LEVELS[level])) return;

            const formattedMessage = this.formatMessage(level, message, data);
            
            switch(level) {
                case 'DEBUG':
                    console.debug(formattedMessage);
                    break;
                case 'INFO':
                    console.info(formattedMessage);
                    break;
                case 'WARN':
                    console.warn(formattedMessage);
                    break;
                case 'ERROR':
                    console.error(formattedMessage);
                    break;
            }

            // Store logs in memory for potential export
            this.storeLogs(level, message, data);
        }

        storeLogs(level, message, data) {
            // Only store INFO and above
            if (level < LOG_LEVELS.INFO) return;
            
            // Ensure we're using the global logs array
            if (!window.HDB_Logger.logs) {
                window.HDB_Logger.logs = [];
            }
            const logEntry = {
                timestamp: new Date().toISOString(),
                plugin: this.pluginName,
                level,
                message,
                data
            };
            window.HDB_Logger.logs.push(logEntry);
            
            // Also store in $gameHDB for consistency
            if (!window.$gameHDB.logger) {
                window.$gameHDB.logger = window.HDB_Logger;
            }
            if (!window.$gameHDB.logger.logs) {
                window.$gameHDB.logger.logs = window.HDB_Logger.logs;
            }
        }

        debug(message, data) { this.log('DEBUG', message, data); }
        info(message, data) { this.log('INFO', message, data); }
        warn(message, data) { this.log('WARN', message, data); }
        error(message, data) { this.log('ERROR', message, data); }

        group(label) {
            if (this.shouldLog(this.pluginName, LOG_LEVELS.DEBUG)) {
                console.group(`[${this.pluginName}] ${label}`);
            }
        }

        groupEnd() {
            if (this.shouldLog(this.pluginName, LOG_LEVELS.DEBUG)) {
                console.groupEnd();
            }
        }

        // Export logs to string (could be saved to file in Node environment)
        exportLogs() {
            console.log('Exporting logs:', window.HDB_Logger.logs);
            if (!window.HDB_Logger.logs) {
                return '[]';
            }
            return JSON.stringify(window.HDB_Logger.logs, null, 2);
        }

        // Display logs in console
        displayLogs() {
            if (!window.HDB_Logger.logs || window.HDB_Logger.logs.length === 0) {
                console.log('No logs available');
                return;
            }
            console.group('Game Logs');
            window.HDB_Logger.logs.forEach(log => {
                console.log(`[${log.timestamp}][${log.plugin}][${log.level}] ${log.message}`, log.data || '');
            });
            console.groupEnd();
        }

        // Download logs as file
        downloadLogs() {
            const logs = this.exportLogs();
            const blob = new Blob([logs], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `game-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    // Initialize logger system immediately and globally
    if (typeof $gameHDB === 'undefined') {
        $gameHDB = {};
    }

    // Create the global logger object first
    window.HDB_Logger = {
        forPlugin: function(pluginName) {
            return new Logger(pluginName);
        },
        logs: [],
        displayLogs: function() {
            if (!this.logs || this.logs.length === 0) {
                console.log('No logs available');
                return;
            }
            console.group('Game Logs');
            this.logs.forEach(log => {
                console.log(`[${log.timestamp}][${log.plugin}][${log.level}] ${log.message}`, log.data || '');
            });
            console.groupEnd();
        }
    };

    // Then initialize the game HDB logger
    if (!$gameHDB.logger) {
        $gameHDB.logger = window.HDB_Logger;
    }

    // Make sure both are available globally and share the same logs array
    window.$gameHDB = $gameHDB;
    window.$gameHDB.logger = window.HDB_Logger;
    window.$gameHDB.logger.logs = window.HDB_Logger.logs;

    // Create a default logger for early initialization
    const defaultLogger = new Logger('HDB_Core_Logger');
    defaultLogger.info('Logger system initialized');
    defaultLogger.debug('Debug test message');
    defaultLogger.warn('Warning test message');

    // Test the logger
    defaultLogger.info('Logger system fully initialized');
})(); 