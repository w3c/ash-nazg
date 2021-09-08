const template = require("./template");
const doAsync = require('doasync') // rather than utils.promisy to get "free" support for object methods

exports.notifyContacts = async function (gh, pr, status, mailer, emailConfig, store, log) {
  log.info("Attempting to notify error on " + pr.fullName);
  let actualEmails, emails;
  try {
    emails = await gh.getRepoContacts(pr.fullName);
  } catch (err) {
    log.error(err);
  }
  if (!emails) {
    actualEmails = emailConfig.fallback;
  } else {
    actualEmails = emails.filter(function(e) { return e !== null;});
    if (!actualEmails || !actualEmails.length) {
      log.error("Could not retrieve email addresses from repo contacts for " + pr.fullName);
      actualEmails = emailConfig.fallback;
    }
  }
  await doAsync(mailer).sendMail({
      from: emailConfig.from,
      to: actualEmails.join(","),
      cc: emailConfig.cc.join(","),
      subject: `IPR check failed for PR #${pr.num} on ${pr.fullName}`,
      text: `${status.payload.description}\n\nSee ${status.payload.target_url}\nand https://github.com/${pr.fullName}/pull/${pr.num}`
  });
  for await (let user of  pr.unaffiliatedUsers
                 .map(u => doAsync(store).getUser(u))) {
    if (user.emails.length) {
      const mailData = {
        displayName: user.displayName ? user.displayName : user.login,
        prnum: pr.num,
        repo: pr.fullName,
        contacts: actualEmails.join(",")
      };
      return doAsync(mailer).sendMail({
        from: emailConfig.from,
        to: user.emails[0].value,
        cc: [...actualEmails, ...emailConfig.cc].join(","),
        subject: "Information needed for your PR #" + pr.num+ " on " + pr.fullName,
        text: template('affiliation-mail.txt', mailData)
      });
    }
  };
};
