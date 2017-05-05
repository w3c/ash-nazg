
import React from "react";
import Spinner from "../../components/spinner.jsx";
import MessageActions from "../../actions/messages";

let async = require("async");
require("isomorphic-fetch");
let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;

export default class EditUser extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:         "loading"
        ,   user:           null
        ,   groups:         null
        ,   username:       null
        ,   modified:       false
        ,   w3cidStatus:    "showing"
        ,   userList:       null
        ,   userSuggest:    null
        };
    }
    componentWillMount () {
        this.setState({ username: this.props.params.username });
    }
    componentDidMount () {
        let user;
        fetch(pp + "api/user/" + this.state.username, { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                user = data;
                return fetch(pp + "api/groups", { credentials: "include" })
                        .then(utils.jsonHandler)
                        .then((data) => {
                            this.setState({ user: user, groups: data, status: "ready" });
                        })
                ;
            })
            .catch(utils.catchHandler)
        ;
    }

    removeGroup (w3cid) {
        let user = this.state.user;
        delete user.groups[w3cid];
        this.setState({ user: user, modified: true, w3cidStatus: "showing" });
    }

    addGroup (w3cid) {
        let user = this.state.user;
        if (!user.groups) user.groups = {};
        user.groups[w3cid + ""] = true;
        this.setState({ user: user, modified: true, w3cidStatus: "showing" });
    }

    pickW3CID () {
        this.setState(({ w3cidStatus: "loading" }));
        let groups = Object.keys(this.state.user.groups);
        async.map(
            groups
        ,   (group, cb) => {
                fetch(pp + "api/w3c/group/" + group + "/users", { credentials: "include" })
                    .then(utils.jsonHandler)
                    .then((data) => {
                        // sometimes you get a 404, just handle it
                        if (!data.length) {
                            console.error("Got a 404 for " + group + ", skipping.");
                            return;
                        }
                        cb(null, data);
                    })
                    .catch(utils.catchHandler)
                ;
            }
        ,   (err, data) => {
                // sometimes you get an empty group, just handle it
                if (!data || !data.length) {
                    console.error("Got no participants for " + group + ", skipping.");
                    return;
                }
                let users = {}, hrefs = {};
                data.forEach((res) => {
                    // sometimes you get an empty group, just handle it
                    if (!res || !res.length) {
                        console.error("Got no participants for " + group + ", skipping.");
                        return;
                    }
                    res.forEach((u) => {
                        if (!u) return;
                        if (!users[u.href]) users[u.href] = 0;
                        users[u.href]++;
                        hrefs[u.href] = u.title;
                    });
                });
                // we're looking for users who are in all listed groups, this is an intersection
                // if you've picked the wrong groups, this could easily be empty
                let profiles = Object.keys(users)
                                     .filter((href) => { return users[href] === data.length; })
                                     .sort((a, b) => { return hrefs[a].localeCompare(hrefs[b]); })
                                     .map((h) => { return { displayName: hrefs[h], href: h, id: h.replace(/.*\//, "") }; })
                ,   curName = this.state.user.displayName
                ,   suggest
                ;
                profiles.forEach((u) => {
                    if (u.displayName === curName) suggest = u.id;
                });
                this.setState({ w3cidStatus: "suggesting", userList: profiles, userSuggest: suggest });
            }
        );
    }

    setUser () {
        this.setState(({ w3cidStatus: "setting-user", modified: true }));
        let user = this.state.user
        ,   apiID = utils.val(this.refs.w3cUser)
        ,   groups = Object.keys(user.groups)
        ,   self = this
        ;
        fetch(pp + "api/w3c/user/" + apiID, { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                user.w3cid = data.id + "";
                user.w3capi = apiID;
                return fetch(pp + "api/w3c/user/" + apiID + "/affiliations", { credentials: "include" })
                        .then(utils.jsonHandler)
                        .then((data) => {
                            // KLUDGE Alert
                            // There should be one affiliation / group
                            // See https://github.com/w3c/ash-nazg/issues/29
                            async.filter(groups,
                                         function(group, cb) {
                                             fetch(pp + "api/w3c/group/" + group, { credentials: "include" })
                                                 .then(utils.jsonHandler)
                                                 .then((data) => {
                                                     // Warning: async 2 has a different API
                                                     cb(data.type === "community group");
                                                 })
                                                 .catch(utils.catchHandler)
                                                     ;
                                         }, function (err, results) {
                                             if (err) return utils.catchHandler(err);
                                             var aff;
                                             if (results.length > 0) {
                                                 // If we're dealing with (at least one) CG
                                                 // we can't accept Invited Expert as an affiliation
                                                 aff = data.filter((it) => {
                                                     return !/invited expert/i.test(it.title);
                                                 })[0];
                                             } else {
                                                 aff = data[0];
                                             }
                                             user.affiliation = aff.href.replace(/.*\//, "");
                                             user.affiliationName = aff.title;
                                             self.setState({ user: user, w3cidStatus: "showing" });
                                         });
                        })
                ;
            })
            .catch(utils.catchHandler)
        ;
    }

    saveUser () {
        this.setState({ modified: false, w3cidStatus: "saving" });
        let user = this.state.user;
        fetch(
            pp + "api/user/" + this.state.user.username + "/affiliate"
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
            ,   credentials: "include"
            ,   body:       JSON.stringify({
                                affiliation:        user.affiliation
                            ,   affiliationName:    user.affiliationName
                            ,   w3cid:              user.w3cid
                            ,   w3capi:             user.w3capi
                            ,   groups:             user.groups
                            })
            }
        )
        .then(() => {
            MessageActions.success("Successfully saved user.");
            this.setState({ w3cidStatus: "showing" });
        })
        .catch((e) => {
            MessageActions.error("Failure to save info on user: " + e);
            this.setState({ modified: true,  w3cidStatus: "showing" });
            utils.catchHandler(e);
        })
        ;
    }

    render () {
        let st = this.state
        ,   u = st.user
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            let groupTable =
                <table>
                    {
                        st.groups.map((g) => {
                            return <tr key={g.w3cid}>
                                    <td>{g.name}</td>
                                    <td>
                                        { u.groups && u.groups[g.w3cid] ?
                                            <button onClick={function () { this.removeGroup(g.w3cid); }.bind(this)}>Remove</button>
                                            :
                                            <button onClick={function () { this.addGroup(g.w3cid); }.bind(this)}>Add</button> }
                                    </td>
                                </tr>;
                        })
                    }
                </table>
            ,   w3cid
            ;
            if (st.w3cidStatus === "showing") {
                w3cid = u.w3cid ?
                            u.w3cid
                            :
                            <button onClick={this.pickW3CID.bind(this)} disabled={Object.keys(st.user.groups || []).length === 0}>Set</button>
                ;
            }
            else if (st.w3cidStatus === "loading" || st.w3cidStatus === "setting-user") {
                w3cid = <Spinner prefix={pp} size="small"/>;
            }
            else if (st.w3cidStatus === "suggesting") {
                w3cid = <div>
                            <select ref="w3cUser" defaultValue={st.userSuggest} required>
                                {
                                    st.userList.map((u) => { return <option value={u.id} key={u.id}>{u.displayName}</option> ; })
                                }
                            </select>
                            <button onClick={this.setUser.bind(this)}>Ok</button>
                        </div>
                ;
            }
            content =
                <table className="users-list">
                    <tr>
                        <th>Name</th>
                        <td>{u.displayName}{ u.admin ? " [admin]" : ""}</td>
                    </tr>
                    <tr>
                        <th>Login</th>
                        <td>{st.username}</td>
                    </tr>
                    <tr>
                        <th>Groups</th>
                        <td>{groupTable}</td>
                    </tr>
                    <tr>
                        <th>W3C ID</th>
                        <td>
                            {w3cid}
                        </td>
                    </tr>
                    {
                        u.affiliation ?
                                <tr>
                                    <th>Affiliation</th>
                                    <td>{u.affiliationName + " [" + u.affiliation + "]"}</td>
                                </tr>
                                :
                                null
                    }
                </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Edit user</h2>
                    <p>
                        Use this interface to set a the group and company affiliation for a user.
                        The process is a little baroque due to the nature of the APIs queried for
                        this purpose: a user needs to be associated with (at least) one group in
                        order for their W3C ID to be discoverable, and through that the matching
                        affiliation.
                    </p>
                    {content}
                    <div className="formline actions">
                        <button onClick={this.saveUser.bind(this)} disabled={!st.modified}>Save</button>
                    </div>
                </div>
        ;
    }
}
