
import React from "react";
import Spinner from "../../components/spinner.jsx";
import { Link } from "react-router";
// import MessageActions from "../../actions/messages";

require("isomorphic-fetch");
let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;

function byStatus (pr, status) {
    let cs = pr.contribStatus;
    return Object.keys(cs).filter((u) => { return cs[u] === status; });
}

export default class PRLastWeek extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:             "loading"
        ,   prs:                null
        ,   affiliations:       {}
        ,   affiliationFilter:  false
        };
    }
    componentDidMount () {
        var aff = {};
        fetch(pp + "api/pr/last-week", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                data.forEach((pr) => {
                    for (var k in (pr.affiliations || {})) {
                        if (k) aff[k] = pr.affiliations[k];
                    }
                });
                this.setState({ prs: data, affiliations: aff, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    affFilter () {
        this.setState({ affiliationFilter: utils.val(this.refs.affiliation) || false });
    }
    
    render () {
        let st = this.state
        ,   content
        ,   filter
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            filter = <div>
                    <div className="formline">
                        <label htmlFor="affiliation">affiliation</label>
                        <select id="affiliation" ref="affiliation" defaultValue={st.affiliationFilter} onChange={this.affFilter.bind(this)}>
                            <option key="none" value="">All</option>
                            {
                                Object.keys(st.affiliations)
                                    .map((aff) => {
                                        return <option key={aff} value={aff}>{st.affiliations[aff]}</option>;
                                    })
                            }
                        </select>
                    </div>
                </div>
            ;
            content =   <table className="users-list">
                            <tr>
                                <th>Status</th>
                                <th>Ok?</th>
                                <th>PR</th>
                                <th>Affiliations</th>
                                <th>Good</th>
                                <th>Unknown</th>
                                <th>Outside</th>
                                <th>Actions</th>
                            </tr>
                            <tbody>
                            {
                                st.prs.map(
                                    (pr) => {
                                        // filtering
                                        if (st.affiliationFilter && (!pr.affiliations || !pr.affiliations[st.affiliationFilter])) return;
                                        
                                        return <tr key={pr.id}>
                                                <td>{pr.status}</td>
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
                                                            Object.keys((pr.affiliations || {}))
                                                                .map((aff) => {
                                                                    if (!aff) return;
                                                                    return <li key={aff}>{pr.affiliations[aff]}</li>;
                                                                })
                                                        }
                                                    </ul>
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
                                                            byStatus(pr, "undetermined affiliation")
                                                                .map((u) => {
                                                                    return <li key={u} className="bad">
                                                                            <Link to={`${pp}admin/user/${u}/add`}>{u}</Link>
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
                                                                            <Link to={`${pp}admin/user/${u}`}>{u}</Link>
                                                                        </li>;
                                                                })
                                                        }
                                                    </ul>
                                                </td>
                                                <td>
                                                    <Link to={`${pp}pr/id/${pr.owner}/${pr.shortName}/${pr.num}`} className="button">Details</Link>
                                                </td>
                                            </tr>
                                        ;
                                    }
                                )
                            }
                            </tbody>
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Last Week’s Pull Requests</h2>
                    {filter}
                    {content}
                </div>
        ;
    }
}
