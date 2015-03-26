define(['views/user_list', 'views/dialogs', 'views/chat', '../views/settings'], function(userListView, dialogsView, v6ChatView, v6SettingsView) {
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
        this.settingsView = new v6SettingsView(this.client)
    };

    ViewsManager.prototype.closeAll = function(){
        this.client.ratingManager.close();
        this.client.historyManager.close();
        this.settingsView.close();
    };

    ViewsManager.prototype.showSettings = function () {
        this.settingsView.show();
    };

    return ViewsManager;
});