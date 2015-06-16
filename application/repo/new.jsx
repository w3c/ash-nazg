
import React from "react";
import GHUser from "../../stores/gh-user";
import GHLogin from "../../components/gh-login.jsx";

export default class RepoNew extends React.Component {
    render () {
        if (!GHUser.isLoggedIn()) return <GHLogin/>;
        return  <div className="primary-app">
                    <h2>New Repository</h2>
                    <p>
                        XXX
                    </p>
                </div>
        ;
    }
}
