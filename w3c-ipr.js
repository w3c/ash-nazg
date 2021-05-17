const fromUrlToId = url => url.replace(/.*\//, "");

module.exports = async function iprcheck(w3c, w3cprofileid, name, w3cgroups, store, cb) {
  return Promise.all(
    w3cgroups.map(
      ({id, type, shortname}) => new Promise((res, rej) => {
        store.getGroup(id, function(err, group) {
          if (err) return rej(err);
          w3c.user(w3cprofileid)
            .participations()
            .fetch({embed: true},
                   function(err, participations) {
                     if (err) return rej(err);
                     for (var i = 0 ; i < participations.length; i++) {
                       var p = participations[i];
                       var org = p._links.organization;
                       var affiliation = p.individual ? {id: w3cprofileid, name: name} : {id: fromUrlToId(org.href), name: org.title};
                       if (p._links.group.href === `https://api.w3.org/groups/${type}/${shortname}`) {
                         return res({ok: true, affiliation: affiliation});
                       }
                     }
                     // If we reach here,
                     // the user is not participating directly in the group
                     // For non WGs, game over
                     if (group.groupType != "WG") {
                       return res({ok: false});
                     }
                     // For WGs, we check if the user is affiliated
                     // with an organization that is participating
                     w3c.group({type, shortname})
                       .participations()
                       .fetch({embed: true}, function(err, participations) {
                         if (err) return rej(err);
                         var orgids = participations
                             .filter(p => !p.individual)
                             .map(p => fromUrlToId(p._links.organization.href));
                         w3c.user(w3cprofileid)
                           .affiliations()
                           .fetch(function(err, affiliations) {
                             if (err) return rej(err);
                             var affids = affiliations.map(a => a ? fromUrlToId(a.href) : undefined);
                             var intersection = orgids.filter(id =>  affids.includes(id));
                             if (intersection.length) {
                               var affiliationId = intersection[0];
                               var affiliationName = affiliations.find(a => a.href == "https://api.w3.org/affiliations/" + affiliationId).title;
                               return res({ok: true, affiliation: {id: affiliationId, name: affiliationName}});
                             }
                             return res({ok: false});
                           });
                       });
                   });
        })
      })))
    .then(results => {
      for(let res of results) {
        if (res.ok) {
          return {affiliation: res.affiliation, ok: true};
        }
      }
      return {affiliation: null, ok: false};
    });
};
