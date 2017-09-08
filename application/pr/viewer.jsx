
import React from "react";
import Spinner from "../../components/spinner.jsx";
import { Link } from "react-router";
import MessageActions from "../../actions/messages";

require("isomorphic-fetch");
let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;

export default class PRViewer extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   pr:         null
        ,   owner:      null
        ,   shortName:  null
        ,   num:        null
        ,   groupDetails: []
        };
    }
    componentDidMount () {
        let owner = this.props.params.owner
        ,   shortName = this.props.params.shortName
        ,   num = this.props.params.num
        ;
        this.setState({ owner: owner, shortName: shortName, num: num });
        fetch(pp + "api/pr/" + [owner, shortName, num].join("/"), { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ pr: data, status: "ready", groupDetails: data.groupDetails });
            })
            .catch(utils.catchHandler)
        ;
    }

    revalidate () {
        let st = this.state;
        this.setState({ status: "loading" });
        fetch(pp + "api/pr/" + [st.owner, st.shortName, st.num, "revalidate"].join("/"), { method: "POST", credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                console.log("got data", data);
                this.setState({ pr: data, status: "ready" });
                if (data.error) return MessageActions.error(data.error);
            })
            .catch(utils.catchHandler)
        ;
    }

    markSubstantiveOrNot (ev) {
        const nonsubstantive = ev.target.name === "nonsubstantive";
        let st = this.state;
        this.setState({ status: "loading" });
        fetch(pp + "api/pr/" + [st.owner, st.shortName, st.num, "markAs" + (nonsubstantive ? "Non" : "") + "Substantive"].join("/"), { method: "POST", credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ pr: data, status: "ready" });
                if (data.error) return MessageActions.error(data.error);
            })
            .catch(utils.catchHandler)
        ;

    }

    render () {
        let st = this.state
        ,   content
        ,   link
        ,   doc
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
            link = "loading";
        }
        else if (st.status === "ready") {
            let cs = st.pr.contribStatus || {}
            ,   thStyle = { paddingRight: "20px" }
            ;
            const link = <a href={"https://github.com/" + st.owner + "/" + st.shortName + "/pull/" + st.num} target="_blank">
                    {st.owner + "/" + st.shortName + "#" + st.num}
                    </a>
            ;
            let action;
            const prAcceptance = st.pr.acceptable === "yes" ? (st.pr.markedAsNonSubstantiveBy ? "Marked as non substantive by " + st.pr.markedAsNonSubstantiveBy : "Made with proper IPR commitments" ) : "no";
            if (st.pr.acceptable === "yes") {
                let revert = "";
                if (st.pr.markedAsNonSubstantiveBy) {
                     revert = <span><button name="substantive" onClick={this.markSubstantiveOrNot.bind(this)}>Unmark as non-substantive</button></span>;
                }
                let merge = "";
                if (st.pr.status === "open") {
                    merge = <span>go merge it at {link}</span>;
                }
                action = <span>{revert}{ revert && merge ? " — or " : (merge ? " — " : "")}{merge}</span>;
            } else {
                action = <span><button  onClick={this.revalidate.bind(this)}>Revalidate</button> <button name="nonsubstantive" onClick={this.markSubstantiveOrNot.bind(this)}>Mark as non-substantive</button></span>;
            }
            content =   <table className="users-list">
                            <tr>
                                <th style={thStyle}>Acceptable</th>
                                <td className={st.pr.acceptable === "yes" ? "good" : "bad"}>
                                    {prAcceptance}
                                    {" "}
                                    {action}
                                </td>
                            </tr>
                            <tr>
                                <th style={thStyle}>Contributors</th>
                                <td>
                                    <ul>
                                        {
                                            Object.keys(cs)
                                                .map((username) => {
                                                    if (cs[username] === "ok") {
                                                        return <li className="good" key={username}>{username}</li>;
                                                    }
                                                    else if (cs[username] === "undetermined affiliation") {
                                                        return <li key={username}>
                                                                <span className="bad">{username}</span> is unknown,{" "} they need to link their <a href="https://www.w3.org/users/myprofile/connectedaccounts">Github account with a W3C account</a>.
                                                            </li>
                                                        ;
                                                    }
                                                    else {
                                                        return <li key={username}>
                                                                <span className="bad">{username}</span> did not make IPR commitments for this group.
                                                            </li>;
                                                    }
                                                })
                                        }
                                    </ul>
                                </td>
                            </tr>
                        </table>
            ;
           if (st.pr.acceptable == "no" && st.pr.unaffiliatedUsers.length) {
               var wgDoc, groups = utils.andify(st.groupDetails.map(g => g.name), "or");
               // we assume that all groups are of the same type
               if (!st.groupDetails || !st.groupDetails.length || st.groupDetails[0].groupType === 'WG') {
                   wgDoc = <li>if the said contributor works for a <a href="https://www.w3.org/Consortium/Member/List">W3C Member organization</a> participating to {groups}, they should <a href="https://www.w3.org/accounts/request">get a W3C account</a>. Once done or if they already have one, they should then <a href="https://www.w3.org/users/myprofile/connectedaccounts">link their W3C and github accounts together</a>.</li>

               }
               doc = <div>
                        <p>Some of the contributors in this pull request were not recognized as having made the required IPR commitment to make substantive changes to the specification in this repository.</p>
                        <p>To fix this situation, please see which of the following applies:</p>
                        <ul>
                        <li>if the contribution  does not concern a normative part of a specification, or is editorial in nature (e.g. fixing typos or examples), the contribution can be marked as non-substantive with the button above - this requires to be logged-in in this system.</li>
                       <li>if the said contributor is a member of {groups}, they should <a href="https://www.w3.org/users/myprofile/connectedaccounts">link their W3C and github accounts together</a>.</li>
                        {wgDoc}
                        <li>Otherwise, the group’s chairs will need to figure how to get the proper IPR commitment from the contributor</li>
                     </ul>
                  </div>;
              }
        }
        return  <div className="primary-app">
                    <h2>Pull Request {link}</h2>
                    {content}
                    {doc}
                </div>
        ;
    }
}
