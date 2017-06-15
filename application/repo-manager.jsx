
import React from "react";
import Spinner from "../components/spinner.jsx";
import MessageActions from "../actions/messages";

require("isomorphic-fetch");
let utils = require("./utils")
,   pp = utils.pathPrefix()
;

export default class RepoNew extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   orgs:       null
        ,   orgRepos:   {}
        ,   groups:     null
        ,   disabled:   false
        ,   org:        null
        ,   repo:       null
        ,   repoGroups: null
        ,   mode:      "new"
        };
    }
    componentWillMount () {
        let org, repo;
        let mode = this.props.params.mode;
        if (["new", "import", "edit"].indexOf(mode) === -1) throw new Error("Unknown repository mode: " + mode);
        if (mode === "edit") {
            org = this.props.params.owner;
            repo = this.props.params.shortname;
        }
        this.updateState({ mode: mode, org:org, repo: repo });
    }
    componentDidMount () {
        let orgs;
        let st = this.state;
        fetch(pp + "api/orgs", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                orgs = data;
                return fetch(pp + "api/groups", { credentials: "include" })
                        .then(utils.jsonHandler)
                        .then((data) => {
                            this.updateState({ orgs: orgs, groups: data, status: "ready", org: st.org || (orgs ? orgs[0] : null) });
                        })
                ;
            })
            .catch(utils.catchHandler);
        fetch(pp + "api/org-repos", { credentials: "include" })
            .then(utils.jsonHandler)
            .then(((orgRepos) => {
                this.updateState({orgRepos: orgRepos});
            }).bind(this))
            .catch(utils.catchHandler);
    }
    componentWillReceiveProps (nextProps) {
        let nextMode = nextProps.params.mode;
        if (nextMode !== this.state.mode) this.updateState({ mode: nextMode });
    }

    updateState(partialState) {
        this.setState(Object.assign({}, this.state, partialState));
    }

    updateOrg (ev) {
        let org = utils.val(this.refs.org);
        this.updateState({org: org});
    }

    onRepoNameChange (ev) {
        if (!Object.keys(this.state.orgRepos).length) return;
        let org = utils.val(this.refs.org);
        switch(this.state.mode) {
        case "new":
            if (this.state.orgRepos[org].indexOf(ev.target.value) !== -1) {
                return ev.target.setCustomValidity("Can't create a repo with that name - already exists");
            }
            break;
        case "import":
            if (this.state.orgRepos[org].indexOf(ev.target.value) === -1) {
                return ev.target.setCustomValidity("Can't import a repo with that name - does not exist");
            }
            break;
        }
        ev.target.setCustomValidity("");
    }

    onSubmit (ev) {
        ev.preventDefault();
        let org = utils.val(this.refs.org)
        ,   repo = utils.val(this.refs.repo)
        ,   repoGroups = utils.val(this.refs.groups)
        ;
        this.setState({
            disabled:   true
        ,   status:     "submitting"
        ,   org:        org
        ,   repo:       repo
        ,   repoGroups: repoGroups
        });
        let apiPath;
        switch(this.state.mode) {
        case "new":
            apiPath = "api/create-repo";
            break;
        case "edit":
            apiPath = "api/repos/" + org + "/" + repo + "/edit";
            break;
        case "import":
            apiPath = "api/import-repo";
            break;
        }
        fetch(
            pp + apiPath
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
            ,   credentials: "include"
            ,   body:   JSON.stringify({
                    org:    org
                ,   repo:   repo
                ,   groups: repoGroups
                })
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            var newState = {
                status:     "results"
            ,   result:     data
            ,   disabled:   false
            };
            if (!data.error) {
                newState.org = "";
                newState.repo = "";
                newState.repoGroups = "";
                MessageActions.success("Successfully " + (this.state.mode === "new" ? "created" : (this.state.mode === "import" ? "imported" : "edited data on")) + " repository.");
            }
            else {
                MessageActions.error(data.error.json);
                newState.result.error = data.error.json.message;
            }
            this.setState(newState);
        })
        .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   results = ""
        ,   readonly = st.mode === "edit";
        let org = st.org || (st.orgs ? st.orgs[0] : null);
        let repos = org && Object.keys(this.state.orgRepos).length ? st.orgRepos[org] : [];

        let content = (st.status === "loading") ?
                        <Spinner prefix={pp}/>
                    :
                        <form onSubmit={this.onSubmit.bind(this)} ref="form">
                            <div className="formline">
                                <label htmlFor="repo">pick organisation or account, and repository name</label>
                                <select disabled={readonly} ref="org" defaultValue={st.org} required onChange={this.updateOrg.bind(this)}>
                                    {st.orgs.map((org) => { return <option value={org} key={org}>{org}</option>; })}
                                </select>
                                {" / "}
                                <input readOnly={readonly} type="text" ref="repo" id="repo" defaultValue={st.repo} required list="repos" onChange={this.onRepoNameChange.bind(this)}/>
                                {(st.mode === "import") ?
                                <datalist id="repos">
                                   {repos.map(repo => {
                                     return <option key={org +"/" + repo}>{repo}</option>;
                                   })}
                                 </datalist>
                                 : ""}
                            </div>
                            <div className="formline">
                                <label htmlFor="groups">relevant group</label>
                                <select ref="groups" id="groups" defaultValue={st.group} multiple size="10" required>
                                    {st.groups.map((g) => { return <option value={g.w3cid} key={g.w3cid}>{g.name}</option>; })}
                                </select>
                            </div>
                            <div className="formline actions">
                                <button>{st.mode === "new" ? "Create" : (st.mode === "import" ? "Import" : "Update")}</button>
                            </div>
                        </form>
        ;
        if (st.status === "submitting") {
            results = <Spinner prefix={pp}/>;
        }
        else if (st.status === "results") {
            // XXX need a proper flash message
            if (st.result.error) {
                results = <div className="error">{st.result.error}</div>;
            }
            else {
                results = <div>
                            <p>
                                The following operations were successfully carried out against your
                                repository:
                            </p>
                            <ul>
                                { st.result.actions.map((act) => { return <li key={act}>{act}</li>; }) }
                            </ul>
                            <p>
                                You can view your { st.mode === "new" ? "newly minted" : "" } repository over 
                                there: <a href={"https://github.com/" + st.result.repo} target="_blank">{st.result.repo}</a>
                            </p>
                          </div>;
            }
        }
        if (st.mode === "new") {
            return  <div className="primary-app">
                        <h2>New Repository</h2>
                        <p>
                            Use the form below to create a new repository under either your user or one
                            of the organisations that you have write access to. There is no requirement
                            to place your proposal under the <code>w3c</code> organisation; in fact if
                            a proposal is simply your own, using your personal repository is preferred.
                            No preference is given to a specification proposal based on the user or
                            organisation it belongs to.
                        </p>
                        {content}
                        {results}
                    </div>
            ;
        }
        else if (st.mode === "edit") {
            return  <div className="primary-app">
                        <h2>Update Repository Data</h2>
                        <p>
                            Use the form below to update the group(s) to which an existing managed repository is associated.
                        </p>
                        {content}
                        {results}
                    </div>
            ;
        }
        else {
            return  <div className="primary-app">
                        <h2>Import Repository</h2>
                        <p>
                            Use the form below to import an existing repository under either your user
                            or one of the organisations that you have write access to. Your existing
                            files will no be overwritten, it is your responsibility to check that you
                            are set up correctly. New files will, however, be added.
                        </p>
                        {content}
                        {results}
                    </div>
            ;
        }
    }
}
