define(['views/user_list', 'views/dialogs', 'views/chat'], function(userListView, dialogsView, v6ChatView) {
    var ViewsManager = function(client){
        this.client = client;
        this.userListView = null;
        this.dialogsView = dialogsView;
        this.chat = null;
    };

    ViewsManager.prototype.init = function() {
        this.userListView = new userListView(this.client);
        this.dialogsView.init(this.client);
        this.v6ChatView = new v6ChatView(this.client);
    };

    return ViewsManager;
});
