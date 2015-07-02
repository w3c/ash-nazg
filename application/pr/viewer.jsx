
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
                this.setState({ pr: data, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    revalidate () {
        let st = this.state;
        this.setState({ status: "loading" });
        fetch(pp + "api/pr/" + [st.owner, st.shortName, st.num, "revalidate"].join("/"), { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                console.log("got data", data);
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
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
            link = "loading";
        }
        else if (st.status === "ready") {
            let cs = st.pr.contribStatus
            ,   thStyle = { paddingRight: "20px" }
            ;
            link = <a href={"https://github.com/" + st.owner + "/" + st.shortName + "/pull/" + st.num} target="_blank">
                    {st.owner + "/" + st.shortName + "#" + st.num}
                    </a>
            ;
            content =   <table className="users-list">
                            <tr>
                                <th style={thStyle}>Acceptable</th>
                                <td className={st.pr.acceptable === "yes" ? "good" : "bad"}>
                                    {st.pr.acceptable}
                                    {" "}
                                    {
                                        st.pr.acceptable === "yes" ?
                                                <span>— Go merge it at {link}</span>
                                                :
                                                <button onClick={this.revalidate.bind(this)}>Revalidate</button>
                                    }
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
                                                    else if (cs[username] === "unknown") {
                                                        return <li key={username}>
                                                                <span className="bad">{username}</span> is unknown,{" "}
                                                                <Link to={`${pp}admin/user/${username}/add`}>add them to the system</Link>.
                                                            </li>
                                                        ;
                                                    }
                                                    else {
                                                        return <li key={username}>
                                                                <span className="bad">{username}</span> is not
                                                                in the right groups, {" "}
                                                                <Link to={`${pp}admin/user/${username}`}>manage their membership</Link>.
                                                            </li>;
                                                    }
                                                })
                                        }
                                    </ul>
                                </td>
                            </tr>
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Pull Request {link}</h2>
                    <p>
                        If a pull request is not acceptable and you have edited tweaked some of the
                        users in order to grant them the proper rights, then you can hit revalidate
                        in order to get the PR to be checked again in full with the new information.
                    </p>
                    {content}
                </div>
        ;
    }
}
