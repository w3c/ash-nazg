
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
        ,   repoId:     null
        };
    }
    componentDidMount () {
        let owner = this.props.params.owner
        ,   shortName = this.props.params.shortName
        ,   num = this.props.params.num
        ,   groupDetails
        ;
        this.setState({ owner: owner, shortName: shortName, num: num });
        fetch(pp + "api/pr/" + [owner, shortName, num].join("/"), { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                groupDetails = data.groupDetails || [];
                this.setState({ pr: data  });
            })
            .then(() => {
                return Promise.all(groupDetails
                                   .map(g => fetch(pp + "api/w3c/group/" + g.w3cid)
                                        .then(utils.jsonHandler)
                                        .then(groupdata => {
                                          groupDetails.find(gg => gg.w3cid === g.w3cid).joinhref = groupdata._links.join.href;
                                        })
                                       ));
            })
            .then(() => this.setState({groupDetails, status: "ready"}))
            .catch(utils.catchHandler)
        ;
        fetch(pp + "api/repos/" + [owner, shortName].join("/"), { credentials: "include"})
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ repoId: data.id  });
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
            link = <a href={"https://github.com/" + st.owner + "/" + st.shortName + "/pull/" + st.num} target="_blank">
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
                                                        return <li className="good" key={username}><a href={"https://github.com/" + username +"/"}>{username}</a></li>;
                                                    }
                                                    else if (cs[username] === "undetermined affiliation") {
                                                        return <li key={username}>
                                                        <a className="bad" href={"https://github.com/" + username +"/"}>{username}</a> is unknown,{" "} they need to link their <a href="https://www.w3.org/users/myprofile/connectedaccounts">Github account with a W3C account</a>.
                                                            </li>
                                                        ;
                                                    }
                                                    else if (cs[username] === "commitment pending") {
                                                        return <li key={username}>
                                                        <a className="bad" href={"https://github.com/" + username +"/"}>{username}</a> needs to submit their non-participant licensing commitment via the link they received by email.
                                                            </li>
                                                        ;
                                                    }
                                                    else {
                                                        const groupJoins = (st.groupDetails || []).map((g, i, a) => <span><a href={g.joinhref}>join the {g.name}</a> {i < a.length - 1 ? " or " : ""}</span>);
                                                        return <li key={username}>
                                                          <a href={"https://github.com/" + username +"/"} className="bad">{username}</a> did not make IPR commitments for this group. To make the IPR commitments, {username} should {groupJoins}.
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
               let nplcUrl = new URL(['/2004/01/pp-impl/nplc', st.repoId, st.num, 'edit'].join("/"), 'https://www.w3.org/');
               let qs = st.pr.contributors.map((c) => {return 'contributors[]=' + c;}).concat(st.pr.groups.map((g) => {return 'groups[]=' + g;})).join('&');
               nplcUrl.search = qs;
               var groupDoc, groups = utils.andify(st.groupDetails.map(g => g.name), "or");
               // we assume that all groups are of the same type
               if (!st.groupDetails || !st.groupDetails.length || st.groupDetails[0].groupType === 'WG') {
                   groupDoc = [<li key={1}>if the said contributor works for a <a href="https://www.w3.org/Consortium/Member/List">W3C Member organization</a> participating to {groups}, they should <a href="https://www.w3.org/accounts/request">get a W3C account</a>. Once done or if they already have one, they should then <a href="https://www.w3.org/users/myprofile/connectedaccounts">link their W3C and github accounts together</a>.</li>,
                   <li key={2}>Otherwise, the WG’s team contacts will {this.props.isAdmin ? <a href={nplcUrl.toString()} target="_blank">request the contributors to sign the non-participant licensing commitments</a> : "request the contributors to sign the non-participant licensing commitments"}.</li>]
               } else {
                   groupDoc = <li>Otherwise, the group’s chairs will need to figure how to get the proper IPR commitment from the contributor.</li>
               }

               doc = <div>
                        <p>Some of the contributors in this pull request were not recognized as having made the required IPR commitment to make substantive changes to the specification in this repository.</p>
                        <p>To fix this situation, please see which of the following applies:</p>
                        <ul>
                        <li>if the contribution does not concern a normative part of a specification, or is editorial in nature (e.g. fixing typos or examples), the contribution can be marked as non-substantive with the button above - this requires to be logged-in in this system.</li>
                        <li>if the said contributor is a member of {groups}, they should <a href="https://www.w3.org/users/myprofile/connectedaccounts">link their W3C and github accounts together</a>.</li>
                        {groupDoc}
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
