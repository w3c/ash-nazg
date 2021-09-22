
/* update existing hooks */
const doAsync = require("doasync");
var GH = require("./gh");
var config = require("./config.json");
var hookURL = config.hookURL;


if (require.main === module) {
    var Store = require("./store");
    config.logToConsole = false;
    const store = new Store(config);
    store.repos(async (err, data) => {
        for (repo of data) {
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

                const hook = (hooks || hooks.length) ? hooks.find(function(h) { return h && h.config && h.config.url === hookURL; }) : null;

                if (hook) {
                    const secret = await doAsync(store).getSecret(`${owner}/${shortname}`);
                    await gh.octo.request("PATCH /repos/:owner/:name/hooks/:hook",
                    {
                        owner: owner,
                        name: shortname,
                        hook: hook.id,
                        data: {
                            config: {
                                url:          config.hookURL || (config.url + "api/hook"),
                                content_type: "json",
                                secret:       secret
                            }
                            ,   events: ["pull_request", "issue_comment", "repository"]
                        }
                    });
                    console.log(`Hook updated for ${owner}/${shortname}`);
                } else {
                    console.error(`Hook not found for ${owner}/${shortname}`);
                }
            } catch (e) {
                console.error(`Error fetching webhooks for ${owner}/${shortname}: ${e.message}`);
            }
        }
    });
}