
import React from "react";

export default class GHLogin extends React.Component {
    render () {
        return  <div className="login-box">
                    <h2>GitHub Login</h2>
                    <div className="formline">
                        <label htmlFor="username">username</label>
                        <input type="text" id="username" placeholder="username"/>
                    </div>
                    <div className="formline">
                        <label htmlFor="password">password</label>
                        <input type="password" id="password" placeholder="password"/>
                    </div>
                    <div className="formline actions">
                        <button>Log in</button>
                    </div>
                </div>
        ;
    }
}
