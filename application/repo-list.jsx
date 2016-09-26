
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
                                </tr>
                            </thead>
                            {
                                st.repos.map((r) => {
                                    let admin = "";
                                    if (this.props.isAdmin) {
                                        admin = <td><a href={`repo/${r.fullName}/edit`} className="button">Update</a></td>;
                                    }
                                    return <tr key={r.id} style={{paddingLeft: "20px"}}>
                                            <td><a href={`https://github.com/${r.fullName}`} target="_blank">{r.fullName}</a></td>
                                            <td>{r.groups.map((g) => { return g.name; }).join(", ")}</td>
                                            {admin}
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
