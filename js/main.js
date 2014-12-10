require(['require-cnf'], function() {
    require(['jquery-ui'], function() {
        require(['client', 'views/user_list', 'views/dialogs'], function(Client, userListView, dialogsView) {
            // TODO client is global(make singleton)
            // TODO css images not found)
            'use strict';

            console.log('main;', new Date(), 'ready');

            document.cookie = 'userId='+(Math.floor(Math.random()*100000))+"; path=/;";

            window.client = new Client({domain:'localhost'});

            client.init();
            _initViews();
            $('#endGameButton').on('click', function() {
                client.gameManager.leaveGame();
            });


            function _initViews() {
                new userListView({el: $('#userList')});
                dialogsView.init();
            }
        });
    });

});