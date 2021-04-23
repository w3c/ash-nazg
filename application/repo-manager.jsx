
import React from "react";
import Spinner from "../components/spinner.jsx";
import {RadioGroup, Radio} from 'react-radio-group';
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
        ,   groups:     []
        ,   disabled:   false
        ,   org:        null
        ,   repo:       null
        ,   repoGroups: []
        ,   initGroups: null
        ,   mode:       "new"
        ,   license:    'doc'
        ,   login:      null
        ,   lastAddedRepo: {groups: []}
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
        fetch(pp + "api/logged-in", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.updateState({login: data.login});
            })
            .catch(utils.catchHandler);
        if (st.mode === "edit") {
            fetch(pp + "api/repos")
                .then(utils.jsonHandler)
                .then(repos => {
                    this.updateState({initGroups: repos.find(r => r.owner === st.org && r.name === st.repo).groups.map(g => g.w3cid)});
                });
        }
        fetch(pp + "api/my/last-added-repo", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((lastAddedRepo) => {
                if (lastAddedRepo)
                    this.updateState({lastAddedRepo});
            })
            .catch(utils.catchHandler);
        fetch(pp + "api/orgs", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                orgs = data;
                return fetch(pp + "api/groups", { credentials: "include" })
                        .then(utils.jsonHandler)
                        .then((data) => {
                            this.updateState({ orgs: orgs, groups: data, status: "ready" });
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

    updateGroups () {
        let repoGroups = utils.val(this.refs.groups);
        this.updateState({repoGroups});
    }

    updateWGLicense (license) {
        this.updateState({license});
    }


    onSubmit (ev) {
        ev.preventDefault();
        let st = this.state
        ,   org = utils.val(this.refs.org)
        ,   repo = utils.val(this.refs.repo)
        ,   includeW3cJson = (this.refs.w3c || {}).checked
        ,   w3cJsonContacts = (utils.val(this.refs.contacts) || "").replace(/ /,'').split(',').filter(x=>x)
        ,   includeContributing = (this.refs.contributing || {}).checked
        ,   includeLicense = (this.refs.license || {}).checked
        ,   wgLicense = st.license
        ,   includeReadme = (this.refs.readme || {}).checked
        ,   includeCodeOfConduct = (this.refs.codeOfConduct || {}).checked
        ,   includeSpec = (this.refs.spec || {}).checked
        ,   repoGroups = utils.val(this.refs.groups)
        ;
        this.setState({
            disabled:   true
        ,   status:     "submitting"
        ,   org:        org
        ,   repo:       repo
        });
        let apiPath;
        switch(st.mode) {
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
                    org
                ,   repo
                ,   groups: repoGroups
                ,   includeW3cJson
                ,   w3cJsonContacts
                ,   includeContributing
                ,   includeLicense
                ,   wgLicense
                ,   includeReadme
                ,   includeCodeOfConduct
                ,   includeSpec
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
                newState.repoGroups = [];
                MessageActions.success("Successfully " + (st.mode === "new" ? "created" : (st.mode === "import" ? "imported" : "edited data on")) + " repository.");
            }
            else {
                MessageActions.error(data.error.json);
                newState.result.error = data.error.json.message;
            }
            this.setState(newState);
            return !data.error;
        })
        .then ((success) => {
            if (success && st.mode !== "edit") {
                return fetch(
                    pp + 'api/my/last-added-repo'
                    ,   {
                        method:     "post"
                        ,   headers:    { "Content-Type": "application/json" }
                        ,   credentials: "include"
                        ,   body:   JSON.stringify({
                                groups: repoGroups,
                                repo,
                                org,
                                w3cJsonContacts
                        })
                    }
                );
            }
        })
        .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   results = ""
        ,   readonly = st.mode === "edit";
        let org = st.org || (st.orgs ? st.orgs[0] : null);
        let repos = org && Object.keys(st.orgRepos).length ? st.orgRepos[org] : [];
        let selectedGroupType = st.repoGroups.length ? st.groups.filter(g => g.w3cid == st.repoGroups[0])[0].groupType : null;
        let contributingLink, licenseLink;
        if (selectedGroupType) {
            contributingLink = selectedGroupType === 'CG' ? 'https://github.com/w3c/licenses/blob/main/CG-CONTRIBUTING.md' : (st.license === 'doc' ? 'https://github.com/w3c/licenses/blob/main/WG-CONTRIBUTING.md' : 'https://github.com/w3c/licenses/blob/main/WG-CONTRIBUTING-SW.md');
            licenseLink = selectedGroupType === 'CG' ? 'https://github.com/w3c/licenses/blob/main/CG-LICENSE.md' : (st.license === 'doc' ? 'https://github.com/w3c/licenses/blob/main/WG-LICENSE.md' : 'https://github.com/w3c/licenses/blob/main/WG-LICENSE-SW.md');
        }
        // Files selected by default:
        // w3c.json in all cases (since it's used by ashnazg for operation)
        // for new repos: CONTRIBUTING, LICENSE
        // for new CG repos: +basic respec doc
        
        let licensePicker = selectedGroupType === 'WG' ?
           <div className="formLine">License of the specification in that repository:
             <RadioGroup ref="wglicense" name="wglicense" selectedValue={st.license} onChange={this.updateWGLicense.bind(this)}>
                <label className="inline"><Radio value='doc' /><a href="https://www.w3.org/Consortium/Legal/copyright-documents" target="_blank">W3C Document license</a> </label>
                <label className="inline"><Radio value='SW' /><a href="https://www.w3.org/Consortium/Legal/copyright-software" target="_blank">W3C Software and Document license</a> </label>
                </RadioGroup></div>
            : "";
        let customization = st.mode === "edit" ? "" : <div className="formline">
          <p>Add the following files to the repository {st.mode === "import" ? "if they don't already exist (existing files will NOT be overwritten)" : ""}:</p>
          <ul>
          <li><label><input defaultChecked ref="w3c" type="checkbox" name="w3c" /> <a href="https://github.com/w3c/ash-nazg/blob/master/templates/w3c.json" target="_blank">w3c.json</a> [<a href="https://w3c.github.io/w3c.json.html" target="_blank" title="What is the w3c.json file">?</a>]</label> (<label className="inline">administrative contacts: <input ref="contacts" name="contacts" defaultValue={st.lastAddedRepo.w3cJsonContacts ? st.lastAddedRepo.w3cJsonContacts.join(",") : st.login + ","}/></label>)</li>
          <li><label><input type="checkbox" ref="contributing" name="CONTRIBUTING" defaultChecked/> <a href={contributingLink} target="_blank">CONTRIBUTING.md</a></label></li>
          <li><label><input type="checkbox" ref="license" name="license"  defaultChecked/> <a href={licenseLink} target="_blank">LICENSE.md</a></label></li>
          <li><label><input type="checkbox" ref="readme" name="readme" /> <a href="https://github.com/w3c/ash-nazg/blob/master/templates/README.md" target="_blank">README.md</a></label></li>
          <li><label><input type="checkbox" ref="codeOfConduct" name="codeOfConduct" /> <a href="https://github.com/w3c/ash-nazg/blob/master/templates/CODE_OF_CONDUCT.md" target="_blank">CODE_OF_CONDUCT.md</a></label></li>
          <li><label><input type="checkbox" ref="spec" name="spec" defaultChecked={st.mode=='new' && selectedGroupType == 'CG'}/> <a href="https://github.com/w3c/ash-nazg/blob/master/templates/index.html" target="_blank">Basic ReSpec-based document</a> as <code>index.html</code></label></li>
          </ul>
        </div>;
        const cgs = st.groups.filter(g => g.groupType === 'CG').sort((g1,g2) => g1.name.localeCompare(g2.name));
        const wgs = st.groups.filter(g => g.groupType === 'WG').sort((g1,g2) => g1.name.localeCompare(g2.name));
        let content = (st.status === "loading") ?
                        <Spinner prefix={pp}/>
                    :
                        <form onSubmit={this.onSubmit.bind(this)} ref="form">
                            <div className="formline">
                                <label htmlFor="repo">pick organisation or account, and repository name</label>
                                <select disabled={readonly} ref="org" defaultValue={st.org ? st.org : st.lastAddedRepo.org} required onChange={this.updateOrg.bind(this)}>
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
            <label htmlFor="groups">relevant group(s)</label>
                                <select ref="groups" id="groups" defaultValue={st.initGroups ? st.initGroups : st.lastAddedRepo.groups} multiple size="10" required onChange={this.updateGroups.bind(this)}>
                                   <optgroup label='Community Groups'>
                                    {cgs.map((g) => { return <option value={g.w3cid} key={g.w3cid} disabled={selectedGroupType ? g.groupType != selectedGroupType : false}>{g.name}</option>; })}
                                   </optgroup>
                                   <optgroup label='Working Groups'>
                                    {wgs.map((g) => { return <option value={g.w3cid} key={g.w3cid} disabled={selectedGroupType ? g.groupType != selectedGroupType : false}>{g.name}</option>; })}
                                   </optgroup>
                                </select>
                            </div>
                            {licensePicker}
                            {customization}
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
                            Use this form to turn an unmanaged repository into a W3C-managed repository. This tool does the following:
                            <ol>
                                <li>associates the repository with one or more groups (for patent policy and other integration)</li>
                                <li>checks that pull requests made on the repository from now on match the IPR commitments of the submitters</li>
                                <li>makes it easy to add files that are important to group work (e.g., the code of conduct)</li>
                            </ol>
                        </p>
                        {content}
                        {results}
                    </div>
            ;
        }
    }
}
