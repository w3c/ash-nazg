
import React from "react";
import GHUser from "../../stores/gh-user";
import GHLogin from "../../components/gh-login.jsx";
import Spinner from "../../components/spinner.jsx";


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
    
    // XXX
    //  when the component mounts, call octokat to load the list of repos to which we can aspire
    //  when they load, change `content` below to have a select with the user as the first option
    //  (if GH doesn't report it like that already) and a text box for the name. Offer as few 
    //  options as possible. Maybe CG vs WG? No, only CG for now.
    //  On submitting that:
    //      - create the repo (error if exist, error if bad user - maybe the latter applies for org list?)
    //      - add a number of files to it, sometimes interpolate values in them
    //      - set up the hook for it
    //      - add it to our list of monitored repos? (maybe later? at first: anything with the hook?)
    //      - for each item, add to a list of things done
    //      - while processing is going on, keep the spinner going
    
    render () {
        var st = this.state;
        if (!st.loggedIn) return <GHLogin/>;
        let content;
        if (st.orgs && st.orgs.length) content = <div></div>;
        else content = <Spinner/>;
        return  <div className="primary-app">
                    <h2>New Repository</h2>
                    <p>
                        Use the form below to create a new repository under either your user or one
                        of the organisations that you have write access to. There is no requirement
                        to place your proposal under the <code>w3c</code> organisation; in fact if
                        a proposal is simply your own, using your personal repository is preferred.
                        No preference is given to a specification proposal based on the user or
                        organisation it belongs to.
                    </p>
                    {content}
                </div>
        ;
    }
}
