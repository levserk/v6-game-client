define(['EE'], function(EE) {
    var AdminManager = function(client){
        this.client = client;

    };

    AdminManager.prototype  = new EE();

    AdminManager.prototype.onMessage = function(message) {
        var data = message.data;
        console.log('admin_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                this.client.viewsManager.dialogsView.showDialog(data,{}, true, false, false);
                break;
            case 'enable_games':
                this.client.gameManager.enableGames = data['flag'];
                break;
            case 'reload':
                this.client.forceReload = true;
                location.reload();
                break;
            case 'get_config':
                console.log('admin;', 'config', data);
        }
    };


    AdminManager.prototype.send = function(type, data, pass){
        this.client.send('admin', type, 'server', {pass: pass, data:data})
    };


    return AdminManager;
});
