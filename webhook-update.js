
/* update existing hooks */
const doAsync = require("doasync");
var GH = require("./gh");
var config = require("./config.json");
var hookURL = config.hookURL;


if (require.main === module) {
    var Store = require("./store");
    config.logToConsole = false;
    const store = new Store(config);
    (async () => {
        const repos = await doAsync(store).repos();
        for (repo of repos) {
            const owner = repo.owner;
            const shortname = repo.name;
            const { token } = await doAsync(store).getToken(owner);        
            const gh = new GH({ accessToken: token });
            try {
                const { data: hooks } = await gh.octo.request("GET /repos/:owner/:name/hooks",
                {
                    owner: owner,
                    name: shortname
                });

                const hook = (hooks || hooks.length) ? hooks.find(function(h) {
                    return h
                        && h.config
                        && (h.config.url === hookURL || h.config.url === hookURL.replace('/repo-manager', '/hatchery/repo-manager'));
                    }) : null;

                if (hook) {
                    const secret = await doAsync(store).getSecret(`${owner}/${shortname}`);
                    try {
                        await gh.octo.request("PATCH /repos/:owner/:name/hooks/:hook",
                        {
                            owner: owner,
                            name: shortname,
                            hook: hook.id,
                            data: {
                                config: {
                                    url:          config.hookURL || (config.url + "api/hook"),
                                    content_type: "json",
                                    secret:       secret.secret
                                }
                                ,   events: ["pull_request", "issue_comment", "repository"]
                            }
                        });
                        console.log(`Hook updated for ${owner}/${shortname}`);
                    } catch (e) {
                        console.error(`Error updating webhook for ${owner}/${shortname}: ${e.message}`);
                    }
                } else {
                    console.error(`Hook not found for ${owner}/${shortname}`);
                }
            } catch (e) {
                console.error(`Error fetching webhooks for ${owner}/${shortname}: ${e.message}`);
            }
        }
    })();
}