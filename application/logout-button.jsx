
import React from "react";
import UserActions from "../actions/user";

export default class LogoutButton extends React.Component {
    handleClick () {
        UserActions.logout();
    }
    render () {
        return  <button className="logout" onClick={this.handleClick}>Logout</button>;
    }
}

