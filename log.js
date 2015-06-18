
var winston = require("winston")
,   config = require("./config.json")
,   transports = []
;

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
module.exports = new (winston.Logger)({ transports: transports });
