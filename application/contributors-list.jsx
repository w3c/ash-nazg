
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
        ,   nonSubstantiveContributors: []
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
                    , nonSubstantiveContributors: data.nonSubstantiveContributors
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
        ,   substantiveKeys
        ,   nonSubstantiveKeys
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            repositoryLink = <a href={`https://github.com/${st.owner}/${st.shortName}`}>{`${st.owner}/${st.shortName}`}</a>;
            substantiveKeys = Object.keys(st.substantiveContributors);
            nonSubstantiveKeys = Object.keys(st.nonSubstantiveContributors);
            content = (
                <div>
                    {[substantiveKeys, nonSubstantiveKeys].map((type) => {
                        if (type.length > 0) {
                            return (
                                <div key={type}>
                                    <h3>{type === substantiveKeys ? "Substantive" : "Non-substantive"} contributions</h3>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Contributor</th>
                                                <th>PR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {
                                                type.map((i) => {
                                                    return <tr key={(type === substantiveKeys ? st.substantiveContributors : st.nonSubstantiveContributors)[i].name}>
                                                        <td>{(type === substantiveKeys ? st.substantiveContributors : st.nonSubstantiveContributors)[i].name}</td>
                                                        <td>
                                                            <ul>
                                                                {(type === substantiveKeys ? st.substantiveContributors : st.nonSubstantiveContributors)[i].prs.map((pr) => {
                                                                    return <li key={pr}><a href={`${pp}pr/id/${st.owner}/${st.shortName}/${pr}`}>PR #{pr}</a></li>
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
                    }
                    )}
                </div>
        )}
        
        return  <div className="primary-app">
                    <h2>List of contributors on {repositoryLink}</h2>
                    {content}
                </div>
        ;
    }
}
