
var winston = require("winston")
,   transports = []
;

var logger;

module.exports = function(config) {
    if (!logger) {
        // logging
        if (config.logToConsole) {
            transports.push(
                new (winston.transports.Console)({
                    handleExceptions:                   true
                    ,   colorize:                           true
                    ,   maxsize:                            200000000
                    ,   humanReadableUnhandledException:    true
                })
            );
        }
        if (config.logToFile) {
            transports.push(
                new (winston.transports.File)({
                    filename:                           config.logToFile
                    ,   handleExceptions:                   true
                    ,   timestamp:                          true
                    ,   humanReadableUnhandledException:    true
                })
            );
        }

        logger = new (winston.Logger)({ transports: transports });
    }
    return logger;
};
