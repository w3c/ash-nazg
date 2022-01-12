const doAsync = require('doasync'); // rather than utils.promisy to get "free" support for object methods

const fromUrlToId = url => url.replace(/.*\//, "");

module.exports = async function iprcheck(w3c, w3cprofileid, name, w3cgroups, store, cb) {
  for (let {id, type, shortname} of w3cgroups) {
    const group = await doAsync(store).getGroup(id);
    const participations = await w3c.user(w3cprofileid)
          .participations()
          .fetch({embed: true});
    if (!participations) return {affiliation: null, ok: false};
    for (let p of participations) {
      const org = p._links.organization;
      const affiliation = p.individual ? {id: w3cprofileid, name: name} : {id: fromUrlToId(org.href), name: org.title};
      if (p._links.group.href === `https://api.w3.org/groups/${type}/${shortname}`) {
        return {ok: true, affiliation: affiliation};
      }
    }
    // If we reach here,
    // the user is not participating directly in the group
    // For non WGs, game over
    if (group.groupType != "WG") {
      continue;
    }
    // For WGs, we check if the user is affiliated
    // with an organization that is participating
    const orgParticipations = await w3c.group({type, shortname})
          .participations()
          .fetch({embed: true});
    const orgids = orgParticipations
        .filter(p => !p.individual)
        .map(p => fromUrlToId(p._links.organization.href));
    const affiliations = await w3c.user(w3cprofileid)
          .affiliations()
          .fetch();
    const affids = affiliations.map(a => a ? fromUrlToId(a.href) : undefined);
    const intersection = orgids.filter(id =>  affids.includes(id));
    if (intersection.length) {
      const affiliationId = intersection[0];
      const affiliationName = affiliations.find(a => a.href == "https://api.w3.org/affiliations/" + affiliationId).title;
      return {ok: true, affiliation: {id: affiliationId, name: affiliationName}};
    }
  }
  return {affiliation: null, ok: false};
};
