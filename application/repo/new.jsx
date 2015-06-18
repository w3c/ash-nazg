
import React from "react";
// import GHUser from "../../stores/gh-user";
import Spinner from "../../components/spinner.jsx";


// function getState () {
//     return { loggedIn: GHUser.isLoggedIn() };
// }

export default class RepoNew extends React.Component {
    // constructor (props) {
    //     super(props);
    //     this.state = getState();
    // }
    // componentDidMount () {
    //     GHUser.addChangeListener(this._onChange.bind(this));
    // }
    // componentWillUnmount () {
    //     GHUser.removeChangeListener(this._onChange.bind(this));
    // }
    // _onChange () {
    //     this.setState(getState());
    // }
    
    render () {
        let content = <Spinner/>;
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
