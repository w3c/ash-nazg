
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
        ,   isTeamcontact: null
        };
    }
    componentDidMount () {
        let owner = this.props.params.owner
        ,   shortName = this.props.params.shortName
        ,   num = this.props.params.num
        ,   groupDetails
        ,   isTeamcontact = false
        ;
        this.setState({ owner: owner, shortName: shortName, num: num });
        fetch(pp + "api/pr/" + [owner, shortName, num].join("/"), { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                groupDetails = data.groupDetails || [];
                this.setState({ pr: data  });
            })
            .then(() => {
                const types = {
                    'working group': 'wg',
                    'interest group': 'ig',
                    'community group': 'cg',
                    'business group': 'bg'
                  };
                return Promise.all(groupDetails
                                   .map(g => fetch(pp + "api/w3c/group/" + g.w3cid)
                                        .then(utils.jsonHandler)
                                        .then(groupdata => {
                                          const group = groupDetails.find(gg => gg.w3cid === g.w3cid);
                                          group.joinhref = groupdata._links.join.href;
                                          group.shortname = groupdata.shortname;
                                          group.type = types[groupdata.type];
                                        })
                                       ));
            })
            .then(() => fetch(pp + "api/team-contact-of", { credentials: "include"})
                            .then(utils.jsonHandler)
                            .then((data) => {
                                if (!data.hasOwnProperty('error')) {
                                    isTeamcontact = data.some(wg => groupDetails.map(g => `https://api.w3.org/groups/${g.type}/${g.shortname}`).includes(wg.href));
                                }
                            })
            )
            .then(() => this.setState({groupDetails, status: "ready", isTeamcontact: isTeamcontact}))
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
                let nplc;
                if ((this.props.isAdmin || st.isTeamcontact) && st.pr.repoId && !Object.keys(cs).some(u => cs[u] === "undetermined affiliation")) {
                    let st = this.state
                    ,   nplcUrl = new URL(['/2004/01/pp-impl/nplc', st.pr.repoId, st.num, 'edit'].join("/"), 'https://www.w3.org/')
                    ,   qs = st.pr.contributors.map(c => 'contributors[]=' + c).concat(st.pr.groups.map(g => 'groups[]=' + g)).join('&')
                    ;
                    nplcUrl.search = qs;
                    nplc = <a className="button" target="_blank" href={nplcUrl}>Ask for non-participant commitment</a>
                }
                action = <span><button  onClick={this.revalidate.bind(this)}>Revalidate</button> <button name="nonsubstantive" onClick={this.markSubstantiveOrNot.bind(this)}>Mark as non-substantive</button>{nplc}</span>;
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
                                                        <a className="bad" href={"https://github.com/" + username +"/"}>{username}</a> is unknown,{" "} they need to link their <a href="https://www.w3.org/users/myprofile/connectedaccounts">GitHub account with a W3C account</a>.
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
               var groupDoc, groups = utils.andify(st.groupDetails.map(g => g.name), "or");
               // we assume that all groups are of the same type
               if (!st.groupDetails || !st.groupDetails.length || st.groupDetails[0].groupType === 'WG') {
                   let instructions = <a href="https://www.w3.org/2019/12/05-dak-nplc/">instructions</a>
                   groupDoc = [<li key={1}>if the said contributor works for a <a href="https://www.w3.org/Consortium/Member/List">W3C Member organization</a> participating to {groups}, they should <a href="https://www.w3.org/accounts/request">get a W3C account</a>. Once done or if they already have one, they should then <a href="https://www.w3.org/users/myprofile/connectedaccounts">link their W3C and github accounts together</a>.</li>,
                   <li key={2}>Otherwise, the WG’s team contacts will request the contributors to sign the non-participant licensing commitments{!st.pr.repoId ? " (missing repository ID in the database)" : ""}{(this.props.isAdmin || st.isTeamcontact) ? [" - ", instructions] : ""}</li>]
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
