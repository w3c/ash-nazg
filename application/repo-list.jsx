
import React from "react";
import Spinner from "../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("./utils")
,   pp = utils.pathPrefix()
;

export default class RepoList extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: "loading"
        ,   repos:   null
        };
    }
    componentDidMount () {
        fetch(pp + "api/repos", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ repos: data, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }

    deleteRepo (repo) {
        let st = this.state;
        let repos = st.repos;
        this.setState({ status: "loading" });
        if (confirm("Are you sure you want to delete this repository?")) {
            fetch(pp + `api/repos/${repo}`, { method: "DELETE", credentials: "include" })
                .then(utils.jsonHandler)
                .then((data) => {
                    const newRepos = repos.filter(r => r.fullName !== repo)
                    this.setState({ repos: newRepos, status: "ready" });
                })
                .catch(utils.catchHandler)
            ;
            console.log(`Delete repo: ${repo}`);
        }
    }
    
    render () {
        let st = this.state
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            content =   <table className="users-list">
                            <thead>
                                <tr>
                                    <th>Full name</th>
                                    <th>Groups</th>
                                    <th>Contributors list</th>
                                </tr>
                            </thead>
                            {
                                st.repos.map((r) => {
                                    let updateAction = "";
                                    let deleteAction = "";
                                    if (this.props.isAdmin) {
                                        updateAction = <td><a href={`repo/${r.fullName}/edit`}>Update</a></td>
                                        deleteAction = <td><button onClick={() => this.deleteRepo(r.fullName)}>Delete</button></td>;
                                    }
                                    return <tr key={r.id} style={{paddingLeft: "20px"}}>
                                            <td><a href={`https://github.com/${r.fullName}`} target="_blank">{r.fullName}</a></td>
                                            <td>{r.groups.map((g) => { return g.name; }).join(", ")}</td>
                                            <td><a href={`repos/${r.fullName}/contributors`}>Contributors</a></td>
                                            {updateAction}
                                            {deleteAction}
                                        </tr>
                                    ;
                                })
                            }
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>List of Managed Repositories</h2>
                    {content}
                </div>
        ;
    }
}
