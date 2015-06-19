
import React from "react";
import Spinner from "../../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class RepoNew extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: "loading"
        ,   orgs:   null
        };
    }
    componentDidMount () {
        fetch("/api/orgs")
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ orgs: data, status: "ready" });
            })
            .catch(utils.catchHandler);
        
    }
    onSubmit () {
        console.log("submit");
        React.findDOMNode(this.refs.form).disabled = true;
        this.setState({ status: "submitting" });
        // XXX
        // here we POST the relevant information to the server, and wait (possibly a long time)
        // for the feedback. The hope is that the "long time" isn't all that long.
        fetch(
            "/api/create-repo"
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:   {
                    org:    utils.val(this.refs.org)
                ,   repo:   utils.val(this.refs.repo)
                }
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            this.setState({
                status: "results"
            ,   result: data
            });
        })
        .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   content
        ,   results
        ;
        if (st.status === "loading") {
            content = <Spinner/>;
            results = "";
        }
        else if (st.status === "ready") {
            content =   <form onSubmit={this.onSubmit.bind(this)} ref="form">
                            <div className="formline">
                                <label htmlFor="repo">pick organisation or account, and repository name</label>
                                <select ref="org">
                                    {st.orgs.map((org) => { return <option value={org}>{org}</option>; })}
                                </select>
                                {" / "}
                                <input type="text" ref="repo"/>
                            </div>
                            <div className="formline actions">
                                <button>Create</button>
                            </div>
                        </form>
            ;
            results = "";
        }
        else if (st.status === "submitting") {
            results = <Spinner/>;
        }
        else if (st.status === "results") {
            // XXX
            //  undisable the form unconditionally
            //  if st.result is an error, show the errors
            //  otherwise reset the form and show the list of actions (plus link to go to the repo)
            results = "";
        }
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
}
