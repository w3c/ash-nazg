
// this is where the express app goes
// 3043
var express = require("express")
,   winston = require("winston")
,   exwin = require("express-winston")
,   serveStatic = require("serve-static")
,   app = express()
,   transports = []
,   version = require("./package.json").version
;

// make this configurable so that console logging can be optional
transports.push(
    new (winston.transports.Console)({
            handleExceptions:                   true
        ,   colorize:                           true
        ,   maxsize:                            200000000
        ,   humanReadableUnhandledException:    true
    })
);
var log = new (winston.Logger)({ transports: transports });


// middleware
app.use(exwin.logger({
    winstonInstance:    log
,   expressFormat:      true
}));
app.use(serveStatic("public"));


// make port configurable
app.listen(3043, function (err) {
    if (err) return log.error(err);
    log.info("Ash-Nazg/" + version + " up and running.");
});
