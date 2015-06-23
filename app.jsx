
// this adds some missing ES6 bits, notably Promises
require("babel/polyfill");

import React from "react";

import { Router, Route, Link } from "react-router";
import BrowserHistory from "react-router/lib/BrowserHistory";

import Application from "./components/application.jsx";
import Row from "./components/row.jsx";
import Col from "./components/col.jsx";
import NavBox from "./components/nav-box.jsx";
import NavItem from "./components/nav-item.jsx";
import Spinner from "./components/spinner.jsx";

import UserActions from "./actions/user";
import LoginStore from "./stores/login";

import Welcome from "./application/welcome.jsx";
import LoginWelcome from "./application/login.jsx";
import LogoutButton from "./application/logout-button.jsx";
import RepoManager from "./application/repo-manager.jsx";
import AdminUsers from "./application/admin/users.jsx";
import AdminGroups from "./application/admin/groups.jsx";

function getState () {
    return { loggedIn: LoginStore.isLoggedIn(), admin: LoginStore.isAdmin() };
}

class AshNazg extends React.Component {
    constructor (props) {
        super(props);
        this.state = getState();
    }
    componentDidMount () {
        LoginStore.addChangeListener(this._onChange.bind(this));
        UserActions.login();
    }
    componentWillUnmount () {
        LoginStore.removeChangeListener(this._onChange.bind(this));
    }
    _onChange () {
        this.setState(getState());
    }

    render () {
        let st = this.state
        ,   nav
        ,   body
        ,   admin
        ;
        // show admin links as well
        if (st.admin) {
            admin = <NavBox title="Admin">
                        <NavItem><Link to="/admin/users">Users</Link></NavItem>
                        <NavItem><Link to="/admin/groups">Groups</Link></NavItem>
                    </NavBox>
            ;
        }
        // when logged in show an actual menu and content
        if (st.loggedIn === true) {
            nav = <Col className="nav">
                    <NavBox title="Manage">
                        <NavItem><Link to="/repo/new">New Repository</Link></NavItem>
                        <NavItem><Link to="/repo/import">Import Repository</Link></NavItem>
                    </NavBox>
                    {admin}
                    <NavBox title="User">
                        <NavItem><LogoutButton/></NavItem>
                    </NavBox>
                </Col>;
            body = <Col>{ this.props.children || <Welcome/> }</Col>;
        }
        // when logged out off to log in
        else if (st.loggedIn === false) {
            nav = <Col className="nav"><NavBox title="Login"/></Col>;
            body = <Col><LoginWelcome/></Col>;
        }
        // while we don't know if we're logged in or out, spinner
        else {
            body = <Col><Spinner/></Col>;
        }
        return <Application title="Repository Manager">
                  <Row>
                    {nav}
                    {body}
                  </Row>
                </Application>
        ;
    }
}

React.render(
    <Router history={BrowserHistory}>
        <Route path="/" component={AshNazg}>
            <Route path="repo/:mode" component={RepoManager}/>
            <Route path="admin/users" component={AdminUsers}/>
            <Route path="admin/groups" component={AdminGroups}/>
        </Route>
    </Router>
,   document.body
);
