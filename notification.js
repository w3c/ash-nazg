var async = require("async");
const template = require("./template");

exports.notifyContacts = function (gh, pr, status, mailer, emailConfig, store, log, cb) {
    log.info("Attempting to notify error on " + pr.fullName);
    var staff = gh.getRepoContacts(pr.fullName, function(err, emails) {
        var actualEmails;
        if (err || !emails) {
            log.error(err);
            actualEmails = emailConfig.fallback;
        }
        else {
            actualEmails = emails.filter(function(e) { return e !== null;});
            if (!actualEmails || !actualEmails.length) {
                log.error("Could not retrieve email addresses from repo contacts for " + pr.fullName);
                actualEmails = emailConfig.fallback;
            }
        }
        mailer.sendMail({
            from: emailConfig.from,
            to: actualEmails.join(","),
            subject: "IPR check failed for PR #" + pr.num+ " on " + pr.fullName,
            text: status.payload.description + "\n\n See " + status.payload.target_url
        }, function(err) {
            if (err) {
                log.error(err);
                return cb();
            }
            // send mail to unaffiliated users
            async.each(pr.unaffiliatedUsers, function(u, userCB) {
                store.getUser(u, function(err, user) {
                    if (err) return userCB(err);
                    if (user.emails.length) {
                        const mailData = {
                            displayName: user.displayName ? user.displayName : user.login,
                            prnum: pr.num,
                            repo: pr.fullName,
                            contacts: actualEmails.join(",")
                        }
                        mailer.sendMail({
                            from: emailConfig.from,
                            to: user.emails[0].value,
                            cc: actualEmails.join(",") + emailConfig.cc.join(","),
                            subject: "Information needed for your PR #" + pr.num+ " on " + pr.fullName,
                            text: template('affiliation-mail.txt', mailData)
                        }, userCB);
                    } else {
                        // TODO: comment on pull request directly?
                        return userCB();
                    }
                })
            }, function(err) {
                if (err)  log.error(err);
                return cb();
            });
        });
    });
};
