
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
import RepoNew from "./application/repo/new.jsx";

function getState () {
    return { loggedIn: LoginStore.isLoggedIn() };
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
        ,   body;
        // when logged in show an actual menu and content
        if (st.isLoggedIn === true) {
            nav = <Col className="nav">
                    <NavBox title="Manage">
                        <NavItem><Link to="/repo/new">New Repository</Link></NavItem>
                        <NavItem><Link to="/repo/import">Import Repository</Link></NavItem>
                    </NavBox>
                    <NavBox title="User">
                        <NavItem><LogoutButton/></NavItem>
                    </NavBox>
                </Col>;
            body = <Col>{ this.props.children || <Welcome/> }</Col>;
        }
        // when logged out off to log in
        else if (st.isLoggedIn === false) {
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
            <Route path="repo/new" component={RepoNew}/>
        </Route>
    </Router>
,   document.body
);
