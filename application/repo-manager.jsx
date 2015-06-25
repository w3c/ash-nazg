
import React from "react";
import Spinner from "../components/spinner.jsx";
import MessageActions from "../actions/messages";

require("isomorphic-fetch");
let utils = require("./utils")
;

export default class RepoNew extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   orgs:       null
        ,   groups:     null
        ,   disabled:   false
        ,   org:        null
        ,   repo:       null
        ,   repoGroups: null
        ,   isNew:      true
        };
    }
    componentWillMount () {
        let mode = this.props.params.mode;
        console.log("component WILL mount with mode ", mode);
        if (mode !== "new" && mode !== "import") throw new Error("Unknown repository mode: " + mode);
        this.setState({ isNew: mode === "new" });
    }
    componentDidMount () {
        console.log("component DID mount with mode ", this.props.params.mode);
        let orgs;
        fetch("/api/orgs")
            .then(utils.jsonHandler)
            .then((data) => {
                orgs = data;
                return fetch("/api/groups")
                        .then(utils.jsonHandler)
                        .then((data) => {
                            this.setState({ orgs: orgs, groups: data, status: "ready" });
                        })
                ;
            })
            .catch(utils.catchHandler);
        
    }
    componentWillReceiveProps (nextProps) {
        let nextIsNew = nextProps.params.mode === "new";
        if (nextIsNew !== this.state.isNew) this.setState({ isNew: nextIsNew });
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
        fetch(
            this.state.isNew ? "/api/create-repo" : "/api/import-repo"
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
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
                MessageActions.success("Successfully " + (this.state.isNew ? "created" : "imported") + " repository.");
            }
            else MessageActions.error(data.error);
            this.setState(newState);
        })
        .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   results = ""
        ,   content = (st.status === "loading") ?
                        <Spinner/>
                    :
                        <form onSubmit={this.onSubmit.bind(this)} ref="form">
                            <div className="formline">
                                <label htmlFor="repo">pick organisation or account, and repository name</label>
                                <select ref="org" value={st.org}>
                                    {st.orgs.map((org) => { return <option value={org} key={org}>{org}</option>; })}
                                </select>
                                {" / "}
                                <input type="text" ref="repo" id="repo" defaultValue={st.repo}/>
                            </div>
                            <div className="formline">
                                <label htmlFor="groups">relevant group</label>
                                <select ref="groups" id="groups" value={st.group} multiple size="10">
                                    {st.groups.map((g) => { return <option value={g.w3cid} key={g.w3cid}>{g.name}</option>; })}
                                </select>
                            </div>
                            <div className="formline actions">
                                <button>{st.isNew ? "Create" : "Import"}</button>
                            </div>
                        </form>
        ;
        if (st.status === "submitting") {
            results = <Spinner/>;
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
                                You can view your { st.isNew ? "newly minted" : "imported" } repository over 
                                there: <a href={"https://github.com/" + st.result.repo} target="_blank">{st.result.repo}</a>
                            </p>
                          </div>;
            }
        }
        if (st.isNew) {
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
