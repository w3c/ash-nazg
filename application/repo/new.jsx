
import React from "react";
import GHUser from "../../stores/gh-user";
import GHLogin from "../../components/gh-login.jsx";

function getState () {
    return { loggedIn: GHUser.isLoggedIn() };
}

export default class RepoNew extends React.Component {
    constructor (props) {
        super(props);
        this.state = getState();
    }
    componentDidMount () {
        GHUser.addChangeListener(this._onChange.bind(this));
    }
    componentWillUnmount () {
        GHUser.removeChangeListener(this._onChange.bind(this));
    }
    _onChange () {
        this.setState(getState());
    }
    
    render () {
        if (!this.state.loggedIn) return <GHLogin/>;
        return  <div className="primary-app">
                    <h2>New Repository</h2>
                    <p>
                        XXX
                    </p>
                </div>
        ;
    }
}
