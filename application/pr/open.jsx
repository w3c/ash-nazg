
import React from "react";
import Spinner from "../../components/spinner.jsx";
import { Link } from "react-router";

require("isomorphic-fetch");
let utils = require("../../application/utils");

function byStatus (pr, status) {
    let cs = pr.contribStatus;
    return Object.keys(cs).filter((u) => { return cs[u] === status; });
}

export default class PROpen extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   prs:        null
        };
    }
    componentDidMount () {
        fetch("/api/pr/open")
            .then(utils.jsonHandler)
            .then((data) => {
                console.log("prs", data);
                this.setState({ prs: data, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner/>;
        }
        else if (st.status === "ready") {
            content =   <table className="users-list">
                            <tr>
                                <th>Ok?</th>
                                <th>PR</th>
                                <th>Good</th>
                                <th>Unknown</th>
                                <th>Outside</th>
                                <th>Actions</th>
                            </tr>
                            {
                                st.prs.map(
                                    (pr) => {
                                        console.log("pr", pr);
                                        
                                        return <tr key={pr.id}>
                                                <td className={pr.acceptable === "yes" ? "good" : "bad"}>
                                                    {pr.acceptable}
                                                </td>
                                                <td>
                                                    <a href={"https://github.com/" + pr.owner + "/" + pr.shortName + "/pull/" + pr.num} target="_blank">
                                                    {pr.owner + "/" + pr.shortName + "#" + pr.num}
                                                    </a>
                                                </td>
                                                <td>
                                                    <ul>
                                                        {
                                                            byStatus(pr, "ok")
                                                                .map((u) => {
                                                                    return <li key={u} className="good">{u}</li>;
                                                                })
                                                        }
                                                    </ul>
                                                </td>
                                                <td>
                                                    <ul>
                                                        {
                                                            byStatus(pr, "unknown")
                                                                .map((u) => {
                                                                    return <li key={u} className="bad">
                                                                            <Link to={`/admin/user/${u}/add`}>{u}</Link>
                                                                        </li>;
                                                                })
                                                        }
                                                    </ul>
                                                </td>
                                                <td>
                                                    <ul>
                                                        {
                                                            byStatus(pr, "not in group")
                                                                .map((u) => {
                                                                    return <li key={u} className="bad">
                                                                            <Link to={`/admin/user/${u}`}>{u}</Link>
                                                                        </li>;
                                                                })
                                                        }
                                                    </ul>
                                                </td>
                                                <td>
                                                    <Link to={`/pr/id/${pr.owner}/${pr.shortName}/${pr.num}`} className="button">Details</Link>
                                                </td>
                                            </tr>
                                        ;
                                    }
                                )
                            }
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Open Pull Requests</h2>
                    {content}
                </div>
        ;
    }
}
