
import React from "react";

// a very simple flash error
export default class FlashList extends React.Component {
    // receive a store to listen to
    // when it changes, get messages from there
    constructor (props) {
        super(props);
        this.state = { messages: [] };
    }
    componentDidMount () {
        this.props.store.addChangeListener(this._onChange.bind(this));
    }
    componentWillUnmount () {
        this.props.store.removeChangeListener(this._onChange.bind(this));
    }
    _onChange () {
        this.setState({ messages: this.props.store.messages() });
    }
    dismiss (id) {
        this.props.actions.dismiss(id);
    }
    
    render () {
        let st = this.state
        ,   messages = st.messages || []
        ;
        return  <div className="flash-list">
                    {
                        messages.map(
                            (msg) => {
                                return  <div className={"flash-" + msg.type} key={msg.id}>
                                            <button onClick={function () { this.dismiss(msg.id); }.bind(this)}>╳</button>
                                            <p>
                                                {msg.message}
                                            </p>
                                        </div>
                                ;
                            }
                        )
                    }
                </div>
        ;
    }
}
