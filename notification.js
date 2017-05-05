var async = require("async");
exports.notifyContacts = function (gh, pr, status, mailer, from, emailFallback, store, log, cb) {
    log.info("Attempting to notify error on " + pr.fullName);
    var staff = gh.getRepoContacts(pr.fullName, function(err, emails) {
        var actualEmails;
        if (err) {
            log.error(err);
            actualEmails = emailFallback;
        }
        else {
            actualEmails = emails.filter(function(e) { return e !== null;});
            if (!actualEmails || !actualEmails.length) {
                log.error("Could not retrieve email addresses from repo contacts for " + pr.fullName);
                actualEmails = emailFallback;
            }
        }
        mailer.sendMail({
            from: from,
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
                        mailer.sendMail({
                            from: from,
                            to: user.emails[0].value,
                            cc: actualEmails.join(","),
                            subject: "Information needed for your PR #" + pr.num+ " on " + pr.fullName,
                            text: `Dear ${user.displayName ? user.displayName : user.login}

Thank you for submitting a pull request (PR #${pr.num}) on the W3C specification repository ${pr.fullName}.
  https://github.com/${pr.fullName}/pulls/${pr.num}

To ensure that the Web can be used by any one free of charge, W3C develops its specification under a Royalty-Free Patent Policy:
  http://www.w3.org/Consortium/Patent-Policy/

As part of this policy, W3C groups need to assess the IPR context of contributions made to their repositories.

As our automated tool was not able to determine with what organization (if any) you are affiliated, we would be very grateful if you could see which of the following applies to you:

* if your contribution does not concern a normative part of a specification, or is editorial in nature (e.g. fixing typos or examples), you don't need to do anything

* if you are a member of the group owning this repository, please link your W3C and github accounts together at
     https://www.w3.org/users/myprofile/connectedaccounts

* if you work for a W3C Member organization, please get a W3C account at
     http://www.w3.org/Help/Account/Request/Member
   once done or if you already have one, please link your W3C and github accounts together at
     https://www.w3.org/users/myprofile/connectedaccounts

* otherwise, please contact ${actualEmails.join(',')} to see how to proceed with your contribution.

Thanks again for your contribution. If any of this is unclear, please contact web-human@w3.org or ${actualEmails.join(',')} for assistance.

-- 
W3C automated IPR checker`
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
