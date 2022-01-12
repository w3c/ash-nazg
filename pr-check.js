const async = require("async")
,   notification = require('./notification')
,   w3ciprcheck = require('./w3c-ipr')
,   doAsync = require('doasync') // rather than utils.promisy to get "free" support for object methods
,   w3c = require("node-w3capi")
,   types = {
      'working group': 'wg',
      'interest group': 'ig',
      'community group': 'cg',
      'business group': 'bg'
    };

let store, log;

async function findW3CUserFromGithub(user) {
  log.info("Looking for github user with id " + user.ghID + " in W3C API");
  try {
    let w3cuser = await  w3c.user({type: 'github', id: user.ghID}).fetch();
    log.info(JSON.stringify(w3cuser, null, 2));
    await doAsync(store).mergeOnUser(user.username, {
      w3cid:  w3cuser.id,
      w3capi: w3cuser._links.self.href.replace(/.*\//, "")
    });
  } catch (err) {
    return user;
  }
  log.info("Found matching W3C user");
  return doAsync(store).getUser(user.username);
}

async function findOrCreateUserFromGithub(username, gh) {
  let user;
  try {
    user = await doAsync(store).getUser(username);
  } catch (err) {
    if (err.error !== "not_found") throw err;
  }
  if (!user) {
    log.info("Getting GH id from github for " + username);
    let ghuser = await gh.getUser(username);
    // we store this for sake of efficiency
    await doAsync(store).addUser(ghuser);
    return findW3CUserFromGithub(ghuser);
  } else {
    // Let's check if the link has since been established
    if (!user.w3capi) {
      return findW3CUserFromGithub(user);
    } else {
      return user;
    }
  }
}


async function getStoredPR(fullname) {
  log.info("Setting status for PR " + fullname);
  let repo = await doAsync(store).getRepo(fullname);
  if (!repo) throw ("Unknown repository: " + fullname);
  let token = await doAsync(store).getToken(repo.owner);
  if (!token) throw ("Token not found for: " + repo.owner);
  return {repoGroups: repo.groups, token};
}

async function updateStoredPR(pr) {
  log.info("Setting status for PR " + pr.fullName);
  await doAsync(store).updatePR(pr.fullName, pr.num, pr);
  return pr;
}

async function setGhStatus(gh, status) {
  return new Promise((res, rej) => {
    gh.status(status, (err) => {
      if (err) log.error(err);
      res();
    })
  });
}

async function checkPrScope(gh, pr) {
  const ignoreFiles = ["package.json", "package-lock.json", ".travis.yml", "w3c.json", "CONTRIBUTING.md", "LICENSE.md", "LICENSE.txt", "CODE_OF_CONDUCT.md"];
  const ignorePath = ".github/";
  let files;
  try {
    files = await gh.getPrFiles(pr.owner, pr.shortName, pr.num);
  } catch(err) {
    log.error(err);
    // if unsure, assumes it is IPR-relevant
    return true;
  }
  return !(files.map(f => f.filename).every(p => ignoreFiles.includes(p) || p.startsWith(ignorePath)));
}

function prChecker(config, argLog, argStore, GH, mailer) {
  log = argLog;
  store = argStore;
  return {
    validate: async function prStatus (pr, delta, cb) {
      const currentPrAcceptability = pr.acceptable;
      const prString = pr.owner + "/" + pr.shortName + "/" + pr.num;
      const statusData = {
        owner:      pr.owner,
        shortName:  pr.shortName,
        sha:        pr.sha,
        payload:    {
          state:          "pending",
          target_url:     config.url + "pr/id/" + prString,
          description:    "PR is being assessed, results will come shortly.",
          context:        "ipr"
        }
      };
      let token, repoGroups, iprRelevant = true;
      try {
        ({token, repoGroups} = await getStoredPR(pr.fullName));
      } catch (err) {
        return cb(err);
      }
      const gh = new GH({ accessToken: token.token });
      log.info("Setting pending status on " + prString);
      await setGhStatus(gh, statusData);

      iprRelevant = await checkPrScope(gh, pr, log);
      if (!iprRelevant) {
        statusData.payload.state = "success";
        statusData.payload.description = "PR files identified as non-substantive.";
        log.info("Setting status success for " + prString);
        pr.acceptable = "yes";
        await setGhStatus(gh, statusData);
        try {
          let updatedPR = await updateStoredPR(pr);
          return cb(null, updatedPR);
        } catch (err) {
          return cb(err);
        }
      }

      if (pr.markedAsNonSubstantiveBy) {
        pr.acceptable = "yes";
        statusData.payload.state = "success";
        statusData.payload.description = "PR deemed acceptable as non-substantive by @" + pr.markedAsNonSubstantiveBy + ".";
        log.info("Setting status success for " + prString);
        await setGhStatus(gh, statusData);
        try {
          let updatedPR = await updateStoredPR(pr);
          return cb(null, updatedPR);
        } catch (err) {
          return cb(err);
        }
      }

      log.info("Looking up users for " + prString);
      let contrib = {};
      log.info("Finding deltas for " + prString);
      pr.contributors.forEach(function (c) { contrib[c] = true; });
      delta.add.forEach(function (c) { contrib[c] = true; });
      delta.remove.forEach(function (c) { delete contrib[c]; });
      pr.contributors = Object.keys(contrib);
      pr.contribStatus = {};
      pr.groups = repoGroups;
      pr.affiliations = {};
      let results = await Promise.all(
        pr.contributors.map(async function(username) {
          let user = await findOrCreateUserFromGithub(username, gh);
          // TODO: check that this is appropriate
          // and if so, replace by check of affiliation
          // to staff
          if (user.blanket) {
            pr.affiliations[user.affiliation] = user.affiliationName;
            pr.contribStatus[username] = "ok";
            return "ok";
          }
          // if user not found in W3C API,
          // report undetermined affiliation
          // TODO: We will contact contributor to ask
          // establishing the connection.
          if (!user.w3capi) {
            pr.contribStatus[username] = "undetermined affiliation";
            return "undetermined affiliation";
          }

          let groups = [];

          for (let g of repoGroups) {
            // get group type and shortname
            try {
              const group = await w3c.group(g).fetch();
              groups.push({id: g, type: types[group.type], shortname: group.shortname});
            } catch (err) {
              return cb(err);
            }
          }

          let result = await w3ciprcheck(w3c, user.w3capi, user.displayName, groups, store);
          let ok = result.ok;
          if (ok) {
            pr.affiliations[result.affiliation.id] = result.affiliation.name;
            pr.contribStatus[username] = "ok";
            return "ok";
          } else {
            // we assume that all groups are of the same type
            let group = await doAsync(store).getGroup(repoGroups[0]);
            if (!group) throw "Unknown group: " + repoGroups[0];
            if (group.groupType === 'WG') {
              log.info("Looking up for non-participant licensing contribution");
              if (pr.repoId) {
                let nplc;
                try {
                  nplc = await w3c.nplc({repoId: pr.repoId, pr: pr.num}).fetch();
                } catch (err) {
                  // Non-participant licensing contribution doesn't exist
                  pr.contribStatus[username] = "not in group";
                  return "not in group";
                }
                const u = nplc.commitments.find(c => c.user["connected-accounts"].find(ca => ca.nickname === username));
                const contribStatus = (u.commitment_date === undefined) ? "commitment pending" : "ok";
                pr.contribStatus[username] = contribStatus;
                return contribStatus;
              } else {
                pr.contribStatus[username] = "no commitment made - missing repository ID";
                return "no commitment made - missing repository ID";
              }
            } else {
              pr.contribStatus[username] = "not in group";
              return "not in group";
            }
          }
        }));
      let good = results.every(st => st === "ok");
      log.info("Got users for " + prString + " results good? " + good);
      if (good) {
        pr.acceptable = "yes";
        pr.unknownUsers = [];
        pr.outsideUsers = [];
        statusData.payload.state = "success";
        statusData.payload.description = "PR deemed acceptable.";
        log.info("Setting status success for " + prString);
        await setGhStatus(gh, statusData);
        let updatedPR = await updateStoredPR(pr);
        return cb(null, updatedPR);
      }
      pr.acceptable = "no";
      pr.unknownUsers = [];
      pr.outsideUsers = [];
      pr.unaffiliatedUsers = [];
      for (var u in pr.contribStatus) {
        if (pr.contribStatus[u] === "unknown") pr.unknownUsers.push(u);
        if (pr.contribStatus[u] === "undetermined affiliation") pr.unaffiliatedUsers.push(u);
        if (pr.contribStatus[u] === "not in group") pr.outsideUsers.push(u);
      }
      var msg = "PR has contribution issues.";
      const collateUserNames = users => users.map(u => "@" + u).join (", ");
      if (pr.unknownUsers.length)
        msg += " The following users were unknown: " + collateUserNames(pr.unknownUsers) +
        ".";
      if (pr.unaffiliatedUsers.length)
        msg += " The following users' affiliation could not be determined: " + collateUserNames(pr.unaffiliatedUsers) + ".";
      if (pr.outsideUsers.length)
        msg += " The following users were not in the repository's groups: " + collateUserNames(pr.outsideUsers) + ".";
      statusData.payload.state = "failure";
      statusData.payload.description =  msg;
      if (statusData.payload.description.length > 140) {
        statusData.payload.description = statusData.payload.description.slice(0, 139) + '…';
      }
      log.info("Setting status failure for " + prString + ", " + msg);
      await setGhStatus(gh, statusData);
      let updatedPR = await updateStoredPR(pr);
      // Only send email notifications
      // if the status of the PR has just
      // changed
      if (currentPrAcceptability !== pr.acceptable) {
        // FIXME: make it less context-dependent
        await notification.notifyContacts(gh, pr, statusData, mailer, {from: config.notifyFrom, fallback: config.emailFallback || [], cc: config.emailCC || []}, store, log);
        return cb(null, updatedPR);
      }
      return cb(null, updatedPR);
    }
  };
}

module.exports = prChecker;
