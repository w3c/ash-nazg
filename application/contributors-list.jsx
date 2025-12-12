
import React from "react";
import Spinner from "../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("./utils")
,   pp = utils.pathPrefix()
;

export default class ContributorsList extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:                     "loading"
        ,   owner:                      null
        ,   shortName:                  null
        ,   substantiveContributors:    []
        };
    }
    componentDidMount () {
        let owner = this.props.params.owner
        ,   shortName = this.props.params.shortName;
        fetch(pp + `api/repos/${owner}/${shortName}/contributors`, { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ 
                    substantiveContributors: data.substantiveContributors
                    , owner: owner
                    , shortName: shortName
                    , status: "ready"
                });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   content
        ,   repositoryLink = ""
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            repositoryLink = <a href={`https://github.com/${st.owner}/${st.shortName}`}>{`${st.owner}/${st.shortName}`}</a>;
            content = (
                Object.keys(st.substantiveContributors).length > 0) &&
                (
                    <div>
                        <h3>Substantive contributions</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Contributor</th>
                                    <th>PR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {
                                    Object.keys(st.substantiveContributors).map((i) => {
                                        return <tr key={i}>
                                            <td>{st.substantiveContributors[i].name}</td>
                                            <td>
                                                <ul>
                                                    {st.substantiveContributors[i].prs.map((pr) => {
                                                        return <li key={pr.num}><a href={`https://github.com/${st.owner}/${st.shortName}/pull/${pr.num}`}>PR #{pr.num}</a> (closed on <a href={`${pp}pr/id/${st.owner}/${st.shortName}/${pr.num}`}>{pr.lastUpdated}</a>)</li>
                                                    })}
                                                </ul>
                                            </td>
                                        </tr>
                                    })
                                }
                            </tbody>
                        </table>
                    </div>
                );
        }
        
        return  <div className="primary-app">
                    <h2>List of contributors on {repositoryLink}</h2>
                    {content}
                </div>
        ;
    }
}
