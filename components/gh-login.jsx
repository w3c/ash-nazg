
import React from "react";
import GHUserActions from "../actions/gh-user-actions";

function val (ref) {
    return React.findDOMNode(ref).value.trim();
}

export default class GHLogin extends React.Component {
    submit (e) {
        e.preventDefault();
        GHUserActions.login(val(this.refs.username), val(this.refs.password), val(this.refs.save));
        console.log(val(this.refs.save), !!val(this.refs.save));
    }
    
    render () {
        return  <form className="login-box" onSubmit={this.submit.bind(this)}>
                    <h2>GitHub Login</h2>
                    <div className="formline">
                        <label htmlFor="username">username</label>
                        <input type="text" id="username" placeholder="username" ref="username"/>
                    </div>
                    <div className="formline">
                        <label htmlFor="password">password</label>
                        <input type="password" id="password" placeholder="password" ref="password"/>
                    </div>
                    <div className="formline">
                        <label>save my details: <input type="checkbox" ref="save"/></label>
                    </div>
                    <div className="formline actions">
                        <button>Log in</button>
                    </div>
                </form>
        ;
    }
}
